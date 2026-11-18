import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { ClaimVerdict, FactCheckRequest, FactCheckResult, EntityRef, SourceRef } from "@tumi/contracts";
import { factCheckResultSchema } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { DecisionsService } from "./decisions/decisions.service";
import { JneSearchService } from "./evidence/jne-search.service";
import { VectorSearchService } from "./evidence/vector-search.service";
import { isSocialUrl } from "./evidence/outlets";
import { WebSearchService } from "./evidence/web-search.service";
import { buildGraph } from "./graph/fact-check.graph";
import { bestMatch, leadingNames, mentions, namesInText } from "./graph/mentions";
import type { AgentDeps, EvidenceItem, StreamHooks, TumiState } from "./graph/state";
import { loadProfile } from "./profile/load-profile";
import {
  asksOtherOffice,
  searchList,
  officialReading,
  questionKind,
  type OfficialProfile,
} from "./profile/rules";
import { readingLine, type ImageKind } from "./drafting/image-reading";
import { LlmService } from "./drafting/llm.service";
import { statementAppears } from "./evidence/attribution";
import { acceptedStatutes, statuteQuery } from "./evidence/statutes";

@Injectable()
export class VerifyClaimHandler implements OnModuleInit {
  private readonly logger = new Logger(VerifyClaimHandler.name);
  private graph: ReturnType<typeof buildGraph> | null = null;
  private checkpointer: BaseCheckpointSaver | null = null;
  checkpoint: "postgres" | "memory" = "memory";

  constructor(
    private readonly decisions: DecisionsService,
    private readonly llm: LlmService,
    private readonly jne: JneSearchService,
    private readonly vectors: VectorSearchService,
    private readonly web: WebSearchService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.checkpointer = await this.openCheckpointer();
    this.graph = buildGraph(this.deps(), this.checkpointer);
  }

  async execute(request: FactCheckRequest, hooks: StreamHooks): Promise<FactCheckResult> {
    if (!this.graph || !this.checkpointer) throw new Error("El grafo todavía no está listo");
    const sessionId = request.sessionId;
    if (!sessionId) throw new Error("Falta la sesión");

    if (request.hojaVidaId) {
      const profile = await loadProfile(request.hojaVidaId);
      if (!profile) throw new NotFoundException("Candidato no encontrado");
      const reading = await this.queryFrom(request, `${profile.name}, ${profile.office} por ${profile.party}`, hooks);
      const query = reading.query;
      if (reading.line) hooks.onToken(`${reading.line}\n\n`);
      if (reading.imageKind === "statement" && reading.claims.length > 0) {
        return this.save(
          sessionId,
          withReading(await this.fromStatements(sessionId, query, reading.claims, profile, hooks), reading.line),
        );
      }
      const focus = await this.llm.focusContrast(query, profile.name);
      const result = await buildGraph(this.deps(profile, focus), this.checkpointer).invoke(
        {
          query,
          sessionId,
          consultaId: sessionId,
          degraded: !this.decisions.enabled(),
        },
        { configurable: { thread_id: sessionId, hooks } },
      );
      return this.save(sessionId, withReading(this.fromGraph(sessionId, query, result), reading.line));
    }

    const result = await this.graph.invoke(
      {
        query: request.query,
        sessionId,
        consultaId: sessionId,
        degraded: !this.decisions.enabled(),
      },
      { configurable: { thread_id: sessionId, hooks } },
    );
    return this.save(sessionId, this.fromGraph(sessionId, request.query, result));
  }

  private async queryFrom(
    request: FactCheckRequest,
    candidate: string,
    hooks: StreamHooks,
  ): Promise<{ query: string; line: string; imageKind: ImageKind | null; claims: string[] }> {
    const written = request.query.trim();
    if (!request.image) return { query: written, line: "", imageKind: null, claims: [] };
    hooks.onNode("lectura", "start");
    try {
      const reading = await this.llm.readClaim(request.image, candidate);
      const claims = reading.claims.join("\n");
      return {
        query: written.length >= 3 ? `${written}\n${claims}` : claims,
        line: readingLine(reading.kind),
        imageKind: reading.kind,
        claims: reading.claims,
      };
    } finally {
      hooks.onNode("lectura", "done");
    }
  }

  private async fromStatements(
    sessionId: string,
    query: string,
    claims: string[],
    profile: OfficialProfile,
    hooks: StreamHooks,
  ): Promise<FactCheckResult> {
    const entity = entityOf(profile);
    hooks.onNode("atribucion", "start");
    const found: string[] = [];
    const said: ClaimVerdict[] = [];
    try {
      for (const claim of claims) {
        const source = await this.whereSaid(claim, profile);
        said.push(saidVerdict(claim, source));
        if (source) found.push(claim);
      }
    } finally {
      hooks.onNode("atribucion", "done");
    }
    if (found.length === 0) {
      const conclusion = "Se contrastó con el plan, la hoja de vida y las redes. No aparece.";
      hooks.onToken(conclusion);
      return this.resultOf(sessionId, query, conclusion, said, [], [entity]);
    }
    const truthQuery = found.join("\n");
    const graph = await buildGraph(this.deps(profile, truthQuery), this.checkpointer!).invoke(
      {
        query: truthQuery,
        sessionId,
        consultaId: sessionId,
        degraded: !this.decisions.enabled(),
      },
      { configurable: { thread_id: sessionId, hooks } },
    );
    const truth = this.fromGraph(sessionId, truthQuery, graph);
    const verdicts = [
      ...said,
      ...truth.verdicts.map((verdict) => ({
        ...verdict,
        check: "truth" as const,
        sources: verdict.sources.map((source) =>
          isSocialUrl(source.url) ? { ...source, role: "contraste" as const } : source,
        ),
      })),
    ];
    const saidSources = said.flatMap((verdict) => verdict.sources.filter((source) => !isSocialUrl(source.url)));
    return this.resultOf(
      sessionId,
      query,
      truth.conclusion,
      verdicts,
      mergeSources([truth.sources, saidSources]),
      truth.entities.length > 0 ? truth.entities : [entity],
    );
  }

  private async whereSaid(statement: string, profile: OfficialProfile): Promise<SourceRef | null> {
    const identity = { name: profile.name, party: profile.party };
    let documents: EvidenceItem[] = [];
    try {
      documents = await this.vectors.search(statement, {
        codigoExpedientes: profile.codigoExpediente ? [profile.codigoExpediente] : ["__sin_expediente__"],
        hojaVidaIds: [profile.id],
        includePlan: true,
      });
    } catch (error) {
      this.logger.warn(`No se pudo buscar la declaración en el plan: ${error instanceof Error ? error.message : error}`);
    }
    const appears = (text: string) => statementAppears(statement, text, identity);
    const planPage = documents.find((item) => item.origin === "qdrant" && item.codigoExpediente && appears(item.snippet));
    if (planPage) return documentSource(planPage, "Plan de gobierno");
    const proposal = profile.proposals.find((item) => appears(item.text));
    if (proposal) return textSource(profile, "plan", proposal.text);
    const listed = documents.find((item) => item.origin === "jne" && appears(item.snippet));
    if (listed) return documentSource(listed, "Plan de gobierno");
    const row = profile.record.find((item) => appears(item.text)) ?? profile.sentences.find((item) => appears(item.text));
    if (row) return textSource(profile, "hoja", row.text);
    const uploaded = documents.find((item) => item.origin === "qdrant" && !item.codigoExpediente && appears(item.snippet));
    if (uploaded) return documentSource(uploaded, "Hoja de vida");
    const posts = await this.web.socialPosts(statement, identity);
    return posts[0] ?? null;
  }

  private resultOf(
    sessionId: string,
    query: string,
    conclusion: string,
    verdicts: ClaimVerdict[],
    sources: SourceRef[],
    entities: EntityRef[],
  ): FactCheckResult {
    return factCheckResultSchema.parse({
      id: sessionId,
      sessionId,
      query,
      conclusion,
      degraded: verdicts.some((verdict) => verdict.degraded),
      verdicts,
      sources,
      entities,
    });
  }

  private fromGraph(
    sessionId: string,
    query: string,
    result: TumiState,
  ): FactCheckResult {
    return factCheckResultSchema.parse({
      id: sessionId,
      sessionId,
      query,
      conclusion: result.conclusion,
      degraded: result.degraded,
      verdicts: result.verdicts,
      sources: uniqueSources(result),
      entities: result.entities,
    });
  }

  private async save(sessionId: string, payload: FactCheckResult): Promise<FactCheckResult> {
    const turn = await getPrisma().factTurn.create({
      data: {
        sessionId,
        role: "assistant",
        content: payload.conclusion,
        verdict: payload.verdicts[0]?.verdict ?? null,
        confidence: payload.verdicts[0]?.confidence,
        sources: JSON.parse(JSON.stringify(payload)),
        choices: JSON.parse(
          JSON.stringify(
            payload.verdicts.map((verdict) => ({
              claim: verdict.claim,
              decisions: verdict.decisions,
            })),
          ),
        ),
      },
    });
    return { ...payload, id: turn.id.toString() };
  }

  private deps(profile?: OfficialProfile, question = ""): AgentDeps {
    const pinned = profile ? entityOf(profile) : null;
    return {
      decisionsEnabled: () => this.decisions.enabled(),
      searchCandidates: (query) => (pinned ? Promise.resolve([pinned]) : this.searchByMention(query)),
      chooseCandidate: (query, entities) => this.decisions.chooseCandidate(query, entities),
      extractClaims: (query) => this.llm.extractClaims(query),
      planQueries: (kind, name, query) => this.llm.planQueries(kind, name || profile?.shortName || "", query),
      searchEvidence: async (query, claims, entities, sessionId, queries, statuteIds) => {
        const text = [query, ...claims].join(" ");
        const kind = questionKind(question || query);
        const includePlan = kind === "proposal";
        const codigoExpedientes = includePlan
          ? profile
            ? [profile.codigoExpediente ?? "__sin_expediente__"]
            : await this.vectors.expedientesDe(entities.map((entity) => entity.id))
          : [];
        const hojaVidaIds = profile ? [profile.id] : entities.map((entity) => entity.id);
        const name = profile?.shortName || entities[0]?.nombre || "";
        const focus = question || query;
        const searches = searchList(name, focus, queries);
        const identity = {
          name: profile?.name || entities[0]?.nombre || "",
          party: profile?.party || entities[0]?.partido || "",
        };
        const matched = acceptedStatutes(statuteIds);
        const legal = statuteQuery(focus, matched);
        const [local, remote, statutes] = await Promise.all([
          this.vectors.search(text, { codigoExpedientes, sessionId, hojaVidaIds, includePlan }),
          this.web.search(searches, identity),
          legal ? this.vectors.searchStatutes(legal, matched.map((statute) => statute.id)) : Promise.resolve([]),
        ]);
        const reference = statutes.map((item) => ({ ...item, role: "referencia" as const }));
        const official = profile ? officialEvidence(profile, focus) : [];
        const roster = profile && asksOtherOffice(focus, profile.office) ? rosterEvidence(profile) : [];
        return [...official, ...roster, ...reference, ...(profile ? resumeEvidence(profile) : []), ...local, ...remote];
      },
      rerank: async (claims, evidence) => {
        const pinnedItems = evidence.filter(
          (item) =>
            item.id.startsWith("oficial-") ||
            item.id.startsWith("padron-") ||
            item.origin === "tavily",
        );
        const rest = evidence.filter((item) => !pinnedItems.includes(item));
        const ranked = await this.decisions.rerank(claims, rest);
        return [...pinnedItems, ...ranked];
      },
      classifyCirculation: (claims, evidence) => this.decisions.classifyCirculation(claims, evidence),
      judgeClaim: (claim, evidence, entities) => this.decisions.judgeClaim(claim, evidence, entities),
      explain: (state, onToken) => this.llm.explain(state, onToken),
    };
  }

  private async searchByMention(query: string): Promise<TumiState["entities"]> {
    const clue = mentions(query);
    const name = clue.length > 0 ? clue : leadingNames(query);
    const direct = await this.jne.searchByNames(name);
    if (direct.length > 0) return markNickname(direct, clue);
    if (name.length === 0) return this.jne.search(query);
    const pages = await this.web.search(`${name.join(" ")} apodo candidato elecciones Perú`);
    const guesses = namesInText(
      pages.map((page) => `${page.title}. ${page.snippet}`).join("\n"),
      name,
    );
    const hits: Array<{ entity: TumiState["entities"][number]; tokens: string[] }> = [];
    for (const guess of guesses) {
      const tokens = guess.split(/\s+/);
      for (const entity of await this.jne.searchByNames(tokens)) {
        hits.push({ entity, tokens });
      }
    }
    const linked = bestMatch(hits).slice(0, 8);
    this.logger.log(
      `Apodo ${name.join(", ")} vinculado a ${linked.map((entity) => entity.nombre).join("; ") || "nadie en el padrón"}`,
    );
    return markNickname(linked, clue);
  }

  private async openCheckpointer(): Promise<BaseCheckpointSaver> {
    try {
      const connectionString =
        process.env.DATABASE_URL ?? "postgresql://tumi:tumi@localhost:5432/tumi";
      const saver = PostgresSaver.fromConnString(connectionString, { schema: "langgraph" });
      await saver.setup();
      this.checkpoint = "postgres";
      return saver;
    } catch (error) {
      this.logger.warn(
        `Checkpoint de Postgres no disponible, se usa memoria: ${error instanceof Error ? error.message : error}`,
      );
      this.checkpoint = "memory";
      return new MemorySaver();
    }
  }
}

function markNickname(entities: EntityRef[], alias: string[]): EntityRef[] {
  return entities.map((entity) => ({
    ...entity,
    alias: nicknameOutsideName(alias, entity.nombre),
  }));
}

function nicknameOutsideName(alias: string[], name: string): string | null {
  const folded = fold(name);
  const outside = alias.filter((word) => !folded.includes(fold(word)));
  return outside.length > 0 ? outside.join(" ") : null;
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function uniqueSources(state: TumiState) {
  const map = new Map<string, TumiState["evidence"][number]>();
  for (const item of state.evidence) map.set(item.id, item);
  return [...map.values()].map(({ id, title, url, snippet, origin, role, stance, pagina, codigoExpediente }) => ({
    id,
    title,
    url,
    snippet,
    origin,
    role,
    stance,
    pagina,
    codigoExpediente,
  }));
}

function rosterEvidence(profile: OfficialProfile): TumiState["evidence"] {
  return [
    {
      id: `padron-${profile.id}`,
      title: "Padrón",
      url: null,
      snippet: `${profile.name} postula a ${profile.office} por ${profile.party} en las Elecciones Regionales y Municipales de 2026.`,
      origin: "jne" as const,
      role: "prueba" as const,
      stance: null,
      pagina: null,
      codigoExpediente: profile.codigoExpediente,
    },
  ];
}

function officialEvidence(profile: OfficialProfile, query: string): TumiState["evidence"] {
  const official = officialReading(query, profile);
  if (!official) return [];
  return [
    {
      id: `oficial-${profile.id}`,
      title: official.source.title,
      url: null,
      snippet: official.source.snippet,
      origin: official.source.origin,
      role: "prueba" as const,
      stance: null,
      pagina: null,
      codigoExpediente: official.source.title === "Plan de gobierno" ? profile.codigoExpediente : null,
    },
  ];
}

function resumeEvidence(profile: OfficialProfile): TumiState["evidence"] {
  const sentences = profile.sentences.slice(0, 6).map((item, index) => ({
    id: `sentencia-${profile.id}-${index}`,
    title: "Hoja de vida",
    url: null,
    snippet: item.text,
    origin: "jne" as const,
    role: "prueba" as const,
    stance: null,
    pagina: null,
    codigoExpediente: null,
  }));
  const record = profile.record.slice(0, 12).map((item, index) => ({
    id: `hoja-${profile.id}-${index}`,
    title: "Hoja de vida",
    url: null,
    snippet: item.text,
    origin: "jne" as const,
    role: "prueba" as const,
    stance: null,
    pagina: null,
    codigoExpediente: profile.codigoExpediente,
  }));
  return [...sentences, ...record];
}

function saidVerdict(claim: string, source: SourceRef | null): ClaimVerdict {
  if (!source) {
    return {
      claim,
      verdict: "no_verificable",
      confidence: null,
      degraded: false,
      explanation: "Se contrastó con el plan, la hoja de vida y las redes. No aparece.",
      decisions: [],
      sources: [],
      check: "said",
    };
  }
  return {
    claim,
    verdict: "verdadero",
    confidence: 0.8,
    degraded: false,
    explanation: "",
    decisions: [],
    sources: [source],
    check: "said",
  };
}

function textSource(profile: OfficialProfile, kind: "plan" | "hoja", snippet: string): SourceRef {
  return {
    id: `dicho-${kind}-${profile.id}-${snippet.length}`,
    title: kind === "plan" ? "Plan de gobierno" : "Hoja de vida",
    url: null,
    snippet: snippet.slice(0, 700),
    origin: kind === "plan" ? "qdrant" : "jne",
    role: "prueba",
    stance: null,
    pagina: null,
    codigoExpediente: kind === "plan" ? profile.codigoExpediente : null,
  };
}

function documentSource(item: EvidenceItem, title: "Plan de gobierno" | "Hoja de vida"): SourceRef {
  return {
    id: item.id,
    title,
    url: item.url,
    snippet: item.snippet.slice(0, 700),
    origin: item.origin,
    role: "prueba",
    stance: null,
    pagina: item.pagina,
    codigoExpediente: item.codigoExpediente,
  };
}

function mergeSources(groups: SourceRef[][]): SourceRef[] {
  const map = new Map<string, SourceRef>();
  for (const source of groups.flat()) map.set(source.url ?? source.id, source);
  return [...map.values()];
}

function withReading(result: FactCheckResult, line: string): FactCheckResult {
  if (!line || result.conclusion.startsWith(line)) return result;
  return { ...result, conclusion: `${line}\n\n${result.conclusion}` };
}

function entityOf(profile: OfficialProfile): EntityRef {
  return {
    id: profile.id,
    nombre: profile.name,
    cargo: profile.office,
    partido: profile.party,
    fotoUrl: profile.fotoUrl,
    alias: null,
  };
}
