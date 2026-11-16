import type { RunnableConfig } from "@langchain/core/runnables";
import type { EntityRef } from "@tumi/contracts";
import { tipoDePregunta } from "../profile/reglas";
import type { AgentDeps, StreamHooks, TumiState } from "./state";
import { nombresAlInicio, pruebaSirve } from "./menciones";

function hooks(config: RunnableConfig): StreamHooks {
  return (
    (config.configurable?.hooks as StreamHooks | undefined) ?? {
      onNode: () => undefined,
      onDecision: () => undefined,
      onToken: () => undefined,
    }
  );
}

export async function identify(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("identificacion", "start");
  const found = await deps.searchCandidates(state.query);
  let entities: EntityRef[] = found;
  if (found.length > 1 && deps.decisionsEnabled()) {
    const chosen = await deps.chooseCandidate(state.query, found);
    if (chosen) {
      const match = found.filter((entity) => entity.id === chosen);
      if (match.length > 0) entities = match;
    }
  } else if (found.length > 1) {
    entities = [found[0]];
  }
  stream.onNode("identificacion", "done");
  return { entities };
}

export async function extractClaims(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("extraccion", "start");
  const claims = await deps.extractClaims(state.query);
  stream.onNode("extraccion", "done");
  return { claims: claims.length > 0 ? claims : [state.query] };
}

export async function investigate(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("investigacion", "start");
  const nombre = state.entities[0]?.nombre ?? "";
  const consultas = await deps.planQueries(tipoDePregunta(state.query), nombre, state.query);
  stream.onNode("investigacion", "done");
  return { consultas };
}

export async function retrieve(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("recuperacion", "start");
  const found = await deps.searchEvidence(
    state.query,
    state.claims,
    state.entities,
    state.sessionId,
    state.consultas,
  );
  const nombres = [
    ...state.entities.flatMap((entity) => entity.nombre.split(/\s+/)),
    ...state.claims.flatMap(nombresAlInicio),
  ];
  const prueba = found.filter((item) => item.role !== "contraste" && pruebaSirve(state.claims, item, nombres));
  const contraste = found.filter((item) => !prueba.includes(item));
  const ranked = await deps.rerank(state.claims, prueba);
  const circulacion = await deps.clasificarCirculacion(state.claims, contraste);
  stream.onNode("recuperacion", "done");
  return { evidence: [...ranked, ...circulacion] };
}

export async function verify(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("verificacion", "start");
  const verdicts = [];
  let degraded = false;
  for (const claim of state.claims) {
    const prueba = state.evidence.filter((item) => item.role !== "contraste");
    const judged = await deps.judgeClaim(claim, prueba, state.entities);
    degraded = degraded || judged.degraded;
    const verdict = {
      claim,
      ...judged,
      sources: prueba,
    };
    verdicts.push(verdict);
    stream.onDecision({
      claim,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      degraded: verdict.degraded,
      decisions: verdict.decisions,
    });
  }
  stream.onNode("verificacion", "done");
  return { verdicts, degraded };
}

export async function explain(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("explicacion", "start");
  const conclusion = await deps.explain(
    { ...state, verdicts: state.verdicts },
    stream.onToken,
  );
  stream.onNode("explicacion", "done");
  return { conclusion };
}
