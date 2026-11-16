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
import { WebSearchService } from "./evidence/web-search.service";
import { buildGraph } from "./graph/fact-check.graph";
import { bestMatch, leadingNames, mentions, namesInText } from "./graph/mentions";
import type { AgentDeps, StreamHooks, TumiState } from "./graph/state";
import { loadProfile } from "./profile/load-profile";
import {
  decide,
  officialReading,
  questionKind,
  searchQueries,
  webQuery,
  type OfficialProfile,
  type ProfileRule,
} from "./profile/rules";
import { LlmService } from "./drafting/llm.service";

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
      const query = await this.queryFrom(request, `${profile.name}, ${profile.office} por ${profile.party}`, hooks);
      const rule = decide(query, profile);
      const kind = questionKind(query);
      if (rule && kind !== "criminal" && kind !== "proposal") {
        return this.save(sessionId, await this.fromRule(sessionId, query, profile, rule, hooks));
      }
      const result = await buildGraph(this.deps(profile, query), this.checkpointer).invoke(
        {
          query,
          sessionId,
          consultaId: sessionId,
          degraded: officialReading(query, profile) ? false : !this.decisions.enabled(),
        },
        { configurable: { thread_id: sessionId, hooks } },
      );
      return this.save(sessionId, this.fromGraph(sessionId, query, result));
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
  ): Promise<string> {
    const written = request.query.trim();
    if (!request.image) return written;
    hooks.onNode("lectura", "start");
    try {
      const claim = await this.llm.readClaim(request.image, candidate);
      return written.length >= 3 ? `${written}. ${claim}` : claim;
    } finally {
      hooks.onNode("lectura", "done");
    }
  }

  private async fromRule(
    sessionId: string,
    query: string,
    profile: OfficialProfile,
    rule: ProfileRule,
    hooks: StreamHooks,
  ): Promise<FactCheckResult> {
    const entity = entityOf(profile);
    if (rule.kind === "outside") {
      hooks.onToken(rule.message);
      return this.toResult(sessionId, query, rule.message, "no_verificable", null, [], [entity]);
    }
    const source = sourceOf(profile, rule);
    const verdict: ClaimVerdict = {
      claim: query,
      verdict: rule.verdict,
      confidence: rule.confidence,
      degraded: false,
      explanation: "",
      decisions: [],
      sources: [source],
    };
    const state: TumiState = {
      query,
      sessionId,
      consultaId: sessionId,
      entities: [entity],
      claims: [query],
      queries: [],
      evidence: [source],
      verdicts: [verdict],
      conclusion: "",
      degraded: false,
    };
    hooks.onNode("explicacion", "start");
    let conclusion = rule.explanation;
    if (this.llm.enabled()) {
      try {
        conclusion = await this.llm.explain(state, hooks.onToken);
      } catch (error) {
        this.logger.warn(`El redactor no explicó la regla: ${error instanceof Error ? error.message : error}`);
        hooks.onToken(conclusion);
      }
    } else {
      hooks.onToken(conclusion);
    }
    hooks.onNode("explicacion", "done");
    return this.toResult(sessionId, query, conclusion, rule.verdict, rule.confidence, [source], [entity]);
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

  private toResult(
    sessionId: string,
    query: string,
    conclusion: string,
    verdict: ClaimVerdict["verdict"],
    confidence: number | null,
    sources: SourceRef[],
    entities: EntityRef[],
  ): FactCheckResult {
    return factCheckResultSchema.parse({
      id: sessionId,
      sessionId,
      query,
      conclusion,
      degraded: false,
      verdicts: [
        {
          claim: query,
          verdict,
          confidence,
          degraded: false,
          explanation: "",
          decisions: [],
          sources,
        },
      ],
      sources,
      entities,
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
      searchEvidence: async (query, claims, entities, sessionId, queries) => {
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
        const fact = profile ? webQuery(profile.shortName, text, profile.name) : text;
        const searches = queries.length > 0 ? queries : searchQueries(kind, name, fact);
        const identity = {
          name: profile?.name || entities[0]?.nombre || "",
          party: profile?.party || entities[0]?.partido || "",
        };
        const [local, remote] = await Promise.all([
          this.vectors.search(text, { codigoExpedientes, sessionId, hojaVidaIds, includePlan }),
          this.web.search(searches, identity),
        ]);
        const official = profile ? officialEvidence(profile, question || query) : [];
        return [...official, ...(profile ? resumeEvidence(profile) : []), ...local, ...remote];
      },
      rerank: async (claims, evidence) => {
        const pinnedItems = evidence.filter((item) => item.id.startsWith("oficial-") || item.origin === "tavily");
        const rest = evidence.filter((item) => !pinnedItems.includes(item));
        const ranked = await this.decisions.rerank(claims, rest);
        return [...pinnedItems, ...ranked];
      },
      classifyCirculation: (claims, evidence) => this.decisions.classifyCirculation(claims, evidence),
      judgeClaim: (claim, evidence, entities) => {
        if (profile) {
          const official = officialReading(question || claim, profile);
          if (official) {
            return Promise.resolve({
              verdict: official.verdict,
              confidence: official.confidence,
              degraded: false,
              decisions: [],
              explanation: official.explanation,
            });
          }
        }
        return this.decisions.judgeClaim(claim, evidence, entities);
      },
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

function sourceOf(profile: OfficialProfile, rule: Extract<ProfileRule, { kind: "verdict" }>): SourceRef {
  return {
    id: `ficha-${profile.id}`,
    title: rule.source.title,
    url: null,
    snippet: rule.source.snippet,
    origin: rule.source.origin,
    role: "prueba",
    stance: null,
    pagina: null,
    codigoExpediente: profile.codigoExpediente,
  };
}
