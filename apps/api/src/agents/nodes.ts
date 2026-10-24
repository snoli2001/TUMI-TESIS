import type { RunnableConfig } from "@langchain/core/runnables";
import type { EntityRef } from "@tumi/contracts";
import type { AgentDeps, StreamHooks, TumiState } from "./state";

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

export async function retrieve(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("recuperacion", "start");
  const found = await deps.searchEvidence(state.query, state.claims, state.entities);
  const evidence = await deps.rerank(state.claims, found);
  stream.onNode("recuperacion", "done");
  return { evidence };
}

export async function verify(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("verificacion", "start");
  const verdicts = [];
  let degraded = !deps.decisionsEnabled();
  for (const claim of state.claims) {
    const judged = await deps.judgeClaim(claim, state.evidence, state.entities);
    degraded = degraded || judged.degraded;
    const verdict = {
      claim,
      ...judged,
      sources: state.evidence,
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
