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
import { mejorCoincidencia, menciones, nombresAlInicio, nombresEnTexto } from "./graph/menciones";
import type { AgentDeps, StreamHooks, TumiState } from "./graph/state";
import { cargarFicha } from "./profile/cargar";
import {
  apellidoDe,
  consultaWeb,
  consultasDe,
  decidir,
  lecturaOficial,
  tipoDePregunta,
  type FichaOficial,
  type Regla,
} from "./profile/reglas";
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
      const ficha = await cargarFicha(request.hojaVidaId);
      if (!ficha) throw new NotFoundException("Candidato no encontrado");
      const regla = decidir(request.query, ficha);
      const tipo = tipoDePregunta(request.query);
      if (regla && tipo !== "penal" && tipo !== "propuesta") {
        return this.guardar(sessionId, await this.desdeRegla(sessionId, request.query, ficha, regla, hooks));
      }
      const result = await buildGraph(this.deps(ficha, request.query), this.checkpointer).invoke(
        {
          query: request.query,
          sessionId,
          consultaId: sessionId,
          degraded: lecturaOficial(request.query, ficha) ? false : !this.decisions.enabled(),
        },
        { configurable: { thread_id: sessionId, hooks } },
      );
      return this.guardar(sessionId, this.desdeGrafo(sessionId, request.query, result));
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
    return this.guardar(sessionId, this.desdeGrafo(sessionId, request.query, result));
  }

  private async desdeRegla(
    sessionId: string,
    query: string,
    ficha: FichaOficial,
    regla: Regla,
    hooks: StreamHooks,
  ): Promise<FactCheckResult> {
    const entity = entidadDe(ficha);
    if (regla.tipo === "fuera") {
      hooks.onToken(regla.mensaje);
      return this.resultado(sessionId, query, regla.mensaje, "no_verificable", null, [], [entity]);
    }
    const source = fuenteDe(ficha, regla);
    const verdict: ClaimVerdict = {
      claim: query,
      verdict: regla.verdict,
      confidence: regla.confianza,
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
      consultas: [],
      evidence: [source],
      verdicts: [verdict],
      conclusion: "",
      degraded: false,
    };
    hooks.onNode("explicacion", "start");
    let conclusion = regla.explicacion;
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
    return this.resultado(sessionId, query, conclusion, regla.verdict, regla.confianza, [source], [entity]);
  }

  private desdeGrafo(
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

  private resultado(
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

  private async guardar(sessionId: string, payload: FactCheckResult): Promise<FactCheckResult> {
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

  private deps(ficha?: FichaOficial, pregunta = ""): AgentDeps {
    const elegido = ficha ? entidadDe(ficha) : null;
    return {
      decisionsEnabled: () => this.decisions.enabled(),
      searchCandidates: (query) => (elegido ? Promise.resolve([elegido]) : this.buscarPorMencion(query)),
      chooseCandidate: (query, entities) => this.decisions.chooseCandidate(query, entities),
      extractClaims: (query) => this.llm.extractClaims(query),
      planQueries: (tipo, nombre, query) => this.llm.planQueries(tipo, nombre || ficha?.nombreCorto || "", query),
      searchEvidence: async (query, claims, entities, sessionId, consultas) => {
        const text = [query, ...claims].join(" ");
        const tipo = tipoDePregunta(pregunta || query);
        const incluirPlan = tipo === "propuesta";
        const codigoExpedientes = incluirPlan
          ? ficha
            ? [ficha.codigoExpediente ?? "__sin_expediente__"]
            : await this.vectors.expedientesDe(entities.map((entity) => entity.id))
          : [];
        const hojaVidaIds = ficha ? [ficha.id] : entities.map((entity) => entity.id);
        const nombre = ficha?.nombreCorto || entities[0]?.nombre || "";
        const hecho = ficha ? consultaWeb(ficha.nombreCorto, text, ficha.nombre) : text;
        const busquedas = consultas.length > 0 ? consultas : consultasDe(tipo, nombre, hecho);
        const apellido = apellidoDe(ficha?.nombre || entities[0]?.nombre || "");
        const [local, remote] = await Promise.all([
          this.vectors.search(text, { codigoExpedientes, sessionId, hojaVidaIds, incluirPlan }),
          this.web.search(busquedas, apellido),
        ]);
        const oficial = ficha ? fuenteOficial(ficha, pregunta || query) : [];
        return [...oficial, ...(ficha ? hojaDe(ficha) : []), ...local, ...remote];
      },
      rerank: async (claims, evidence) => {
        const fijos = evidence.filter((item) => item.id.startsWith("oficial-") || item.origin === "tavily");
        const resto = evidence.filter((item) => !fijos.includes(item));
        const ranked = await this.decisions.rerank(claims, resto);
        return [...fijos, ...ranked];
      },
      clasificarCirculacion: (claims, evidence) => this.decisions.clasificarCirculacion(claims, evidence),
      judgeClaim: (claim, evidence, entities) => {
        if (ficha) {
          const oficial = lecturaOficial(pregunta || claim, ficha);
          if (oficial) {
            return Promise.resolve({
              verdict: oficial.verdict,
              confidence: oficial.confianza,
              degraded: false,
              decisions: [],
              explanation: oficial.explicacion,
            });
          }
        }
        return this.decisions.judgeClaim(claim, evidence, entities);
      },
      explain: (state, onToken) => this.llm.explain(state, onToken),
    };
  }

  private async buscarPorMencion(query: string): Promise<TumiState["entities"]> {
    const pista = menciones(query);
    const nombre = pista.length > 0 ? pista : nombresAlInicio(query);
    const direct = await this.jne.searchByNames(nombre);
    if (direct.length > 0) return marcarApodo(direct, pista);
    if (nombre.length === 0) return this.jne.search(query);
    const pages = await this.web.search(`${nombre.join(" ")} apodo candidato elecciones Perú`);
    const guesses = nombresEnTexto(
      pages.map((page) => `${page.title}. ${page.snippet}`).join("\n"),
      nombre,
    );
    const hits: Array<{ entity: TumiState["entities"][number]; tokens: string[] }> = [];
    for (const guess of guesses) {
      const tokens = guess.split(/\s+/);
      for (const entity of await this.jne.searchByNames(tokens)) {
        hits.push({ entity, tokens });
      }
    }
    const linked = mejorCoincidencia(hits).slice(0, 8);
    this.logger.log(
      `Apodo ${nombre.join(", ")} vinculado a ${linked.map((entity) => entity.nombre).join("; ") || "nadie en el padrón"}`,
    );
    return marcarApodo(linked, pista);
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

function marcarApodo(entities: EntityRef[], alias: string[]): EntityRef[] {
  return entities.map((entity) => ({
    ...entity,
    alias: apodoFueraDelNombre(alias, entity.nombre),
  }));
}

function apodoFueraDelNombre(alias: string[], nombre: string): string | null {
  const plano = plegar(nombre);
  const fuera = alias.filter((word) => !plano.includes(plegar(word)));
  return fuera.length > 0 ? fuera.join(" ") : null;
}

function plegar(value: string): string {
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

function fuenteOficial(ficha: FichaOficial, query: string): TumiState["evidence"] {
  const oficial = lecturaOficial(query, ficha);
  if (!oficial) return [];
  return [
    {
      id: `oficial-${ficha.id}`,
      title: oficial.fuente.titulo,
      url: null,
      snippet: oficial.fuente.snippet,
      origin: oficial.fuente.origin,
      role: "prueba" as const,
      stance: null,
      pagina: null,
      codigoExpediente: oficial.fuente.titulo === "Plan de gobierno" ? ficha.codigoExpediente : null,
    },
  ];
}

function hojaDe(ficha: FichaOficial): TumiState["evidence"] {
  const sentencias = ficha.sentencias.slice(0, 6).map((item, index) => ({
    id: `sentencia-${ficha.id}-${index}`,
    title: "Hoja de vida",
    url: null,
    snippet: item.texto,
    origin: "jne" as const,
    role: "prueba" as const,
    stance: null,
    pagina: null,
    codigoExpediente: null,
  }));
  const trayectoria = ficha.trayectoria.slice(0, 12).map((item, index) => ({
    id: `hoja-${ficha.id}-${index}`,
    title: "Hoja de vida",
    url: null,
    snippet: item.texto,
    origin: "jne" as const,
    role: "prueba" as const,
    stance: null,
    pagina: null,
    codigoExpediente: ficha.codigoExpediente,
  }));
  return [...sentencias, ...trayectoria];
}

function entidadDe(ficha: FichaOficial): EntityRef {
  return {
    id: ficha.id,
    nombre: ficha.nombre,
    cargo: ficha.cargo,
    partido: ficha.partido,
    fotoUrl: ficha.fotoUrl,
    alias: null,
  };
}

function fuenteDe(ficha: FichaOficial, regla: Extract<Regla, { tipo: "veredicto" }>): SourceRef {
  return {
    id: `ficha-${ficha.id}`,
    title: regla.fuente.titulo,
    url: null,
    snippet: regla.fuente.snippet,
    origin: regla.fuente.origin,
    role: "prueba",
    stance: null,
    pagina: null,
    codigoExpediente: ficha.codigoExpediente,
  };
}
