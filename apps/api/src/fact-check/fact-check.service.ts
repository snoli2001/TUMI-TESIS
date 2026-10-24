import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { FactCheckRequest, FactCheckResult } from "@tumi/contracts";
import { factCheckResultSchema } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { buildGraph } from "../agents/fact-check.graph";
import type { AgentDeps, StreamHooks, TumiState } from "../agents/state";
import { DecisionsService } from "../decisions/decisions.service";
import { LlmService } from "../llm/llm.service";
import { JneSearchService } from "../tools/jne-search.service";
import { VectorSearchService } from "../tools/vector-search.service";
import { WebSearchService } from "../tools/web-search.service";

@Injectable()
export class FactCheckService implements OnModuleInit {
  private readonly logger = new Logger(FactCheckService.name);
  private graph: ReturnType<typeof buildGraph> | null = null;
  checkpoint: "postgres" | "memory" = "memory";

  constructor(
    private readonly decisions: DecisionsService,
    private readonly llm: LlmService,
    private readonly jne: JneSearchService,
    private readonly vectors: VectorSearchService,
    private readonly web: WebSearchService,
  ) {}

  async onModuleInit(): Promise<void> {
    const checkpointer = await this.openCheckpointer();
    this.graph = buildGraph(this.deps(), checkpointer);
  }

  async run(request: FactCheckRequest, hooks: StreamHooks): Promise<FactCheckResult> {
    if (!this.graph) throw new Error("El grafo todavía no está listo");
    const prisma = getPrisma();
    const sessionId = normalizeSessionId(request.sessionId);
    await prisma.factSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId },
      update: {},
    });

    const result = await this.graph.invoke(
      {
        query: request.query,
        sessionId,
        consultaId: sessionId,
        degraded: !this.decisions.enabled(),
      },
      { configurable: { thread_id: sessionId, hooks } },
    );

    const payload: FactCheckResult = factCheckResultSchema.parse({
      id: sessionId,
      sessionId,
      query: request.query,
      conclusion: result.conclusion,
      degraded: result.degraded,
      verdicts: result.verdicts,
      sources: uniqueSources(result),
      entities: result.entities,
    });

    const turn = await prisma.factTurn.create({
      data: {
        sessionId,
        role: "assistant",
        content: payload.conclusion,
        verdict: payload.verdicts[0]?.verdict ?? null,
        confidence: payload.verdicts[0]?.confidence,
        sources: JSON.parse(JSON.stringify(payload)),
        choices: JSON.parse(
          JSON.stringify(
            result.verdicts.map((verdict) => ({
              claim: verdict.claim,
              decisions: verdict.decisions,
            })),
          ),
        ),
      },
    });
    return { ...payload, id: turn.id.toString() };
  }

  private deps(): AgentDeps {
    return {
      decisionsEnabled: () => this.decisions.enabled(),
      searchCandidates: (query) => this.jne.search(query),
      chooseCandidate: (query, entities) => this.decisions.chooseCandidate(query, entities),
      extractClaims: (query) => this.llm.extractClaims(query),
      searchEvidence: async (query, claims) => {
        const text = [query, ...claims].join(" ");
        const [local, remote] = await Promise.all([
          this.vectors.search(text),
          this.web.search(text),
        ]);
        return [...local, ...remote];
      },
      rerank: (claims, evidence) => this.decisions.rerank(claims, evidence),
      judgeClaim: (claim, evidence, entities) =>
        this.decisions.judgeClaim(claim, evidence, entities),
      explain: (state, onToken) => this.llm.explain(state, onToken),
    };
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

function normalizeSessionId(value: string | undefined): string {
  if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return crypto.randomUUID();
}

function uniqueSources(state: TumiState) {
  const map = new Map<string, TumiState["evidence"][number]>();
  for (const item of state.evidence) map.set(item.id, item);
  return [...map.values()].map(({ id, title, url, snippet, origin }) => ({
    id,
    title,
    url,
    snippet,
    origin,
  }));
}
