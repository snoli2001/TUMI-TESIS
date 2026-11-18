import type { RunnableConfig } from "@langchain/core/runnables";
import type { EntityRef } from "@tumi/contracts";
import { trustedOutlet } from "../evidence/outlets";
import { claimsToJudge, mentionsClaim, questionKind, sameCandidate } from "../profile/rules";
import type { AgentDeps, StreamHooks, TumiState } from "./state";
import { coverOutlets, evidenceFits, leadingNames } from "./mentions";

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
  const name = state.entities[0]?.nombre ?? "";
  const plan = await deps.planQueries(questionKind(state.query), name, state.query);
  stream.onNode("investigacion", "done");
  return { queries: plan.queries, statutes: plan.statutes };
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
    state.queries,
    state.statutes,
  );
  const reference = found.filter((item) => item.role === "referencia");
  const caseItems = found.filter((item) => item.role !== "referencia");
  const names = [
    ...state.entities.flatMap((entity) => entity.nombre.split(/\s+/)),
    ...state.claims.flatMap(leadingNames),
  ];
  const identity = state.entities[0];
  const proof = caseItems.filter((item) => {
    if (item.role === "contraste") return false;
    if (item.origin === "tavily" && identity) {
      const named = sameCandidate(item.title, item.snippet, { name: identity.nombre, party: identity.partido });
      const onClaim =
        Boolean(trustedOutlet(item.url)) &&
        mentionsClaim(item.title, item.snippet, `${state.query} ${state.claims.join(" ")}`, identity.nombre);
      if (!named && !onClaim) return false;
    }
    return evidenceFits(state.claims, item, names);
  });
  const contrast = caseItems.filter((item) => !proof.includes(item));
  const ranked = await deps.rerank(state.claims, proof);
  const kept = coverOutlets(ranked, proof, trustedOutlet);
  const circulation = await deps.classifyCirculation(state.claims, contrast);
  stream.onNode("recuperacion", "done");
  return { evidence: [...kept, ...reference, ...circulation] };
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
  for (const claim of claimsToJudge(state.query, state.claims)) {
    const prueba = state.evidence.filter((item) => item.role === "prueba");
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
