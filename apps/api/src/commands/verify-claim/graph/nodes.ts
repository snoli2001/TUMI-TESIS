import type { RunnableConfig } from "@langchain/core/runnables";
import type { EntityRef } from "@tumi/contracts";
import { statePortal, trustedOutlet } from "../evidence/outlets";
import { claimsToJudge, countsAsProof, questionKind } from "../profile/rules";
import type { AgentDeps, EvidenceItem, StreamHooks, TumiState } from "./state";
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
  if (claimsToJudge(state.query, state.claims).length > 1) {
    stream.onNode("investigacion", "done");
    return { queries: [], stateQueries: [], statutes: [], legalQuery: "" };
  }
  const name = state.entities[0]?.nombre ?? "";
  const subject = state.focus.trim() || state.query;
  const [press, plan] = await Promise.all([
    deps.pressQueries(name, subject),
    deps.planQueries(questionKind(subject), name, subject),
  ]);
  stream.onNode("investigacion", "done");
  return {
    queries: press,
    stateQueries: plan.stateQueries,
    statutes: plan.statutes,
    legalQuery: plan.legalQuery,
  };
}

export async function retrieve(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("recuperacion", "start");
  if (claimsToJudge(state.query, state.claims).length > 1) {
    stream.onNode("recuperacion", "done");
    return { evidence: [], trace: { press: [], state: [], urls: [] } };
  }
  const found = await deps.searchEvidence(
    state.query,
    state.claims,
    state.entities,
    state.sessionId,
    state.queries,
    state.statutes,
    state.focus,
    state.stateQueries,
    state.legalQuery,
  );
  const subject = state.focus.trim() || state.query;
  const fitClaims = state.focus.trim() ? [subject] : state.claims;
  const packed = packEvidence(state, found, subject, fitClaims);
  const ranked = await deps.rerank(fitClaims, packed.proof);
  const kept = coverOutlets(ranked, packed.proof, (url) => trustedOutlet(url) ?? statePortal(url));
  const circulation = await deps.classifyCirculation(state.claims, packed.contrast);
  const urls = packed.urls;
  stream.onNode("recuperacion", "done");
  return {
    evidence: [...kept, ...packed.reference, ...circulation],
    trace: { press: state.queries, state: state.stateQueries, urls },
  };
}

export async function verify(
  state: TumiState,
  deps: AgentDeps,
  config: RunnableConfig,
): Promise<Partial<TumiState>> {
  const stream = hooks(config);
  stream.onNode("verificacion", "start");
  const claims = claimsToJudge(state.query, state.claims);
  if (claims.length > 1) {
    const separated = await judgeSeparately(state, deps, claims, stream);
    stream.onNode("verificacion", "done");
    return separated;
  }
  const verdicts = [];
  let degraded = false;
  const referencia = state.evidence.filter((item) => item.role === "referencia");
  for (const claim of claims) {
    const prueba = state.evidence.filter((item) => item.role === "prueba");
    const judged = await deps.judgeClaim(claim, prueba, state.entities, referencia, state.focus.trim() || claim);
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

async function judgeSeparately(
  state: TumiState,
  deps: AgentDeps,
  claims: string[],
  stream: StreamHooks,
): Promise<Partial<TumiState>> {
  const verdicts = [];
  const evidence: EvidenceItem[] = [];
  const trace = { press: [] as string[], state: [] as string[], urls: [] as string[] };
  let degraded = false;
  const name = state.entities[0]?.nombre ?? "";
  for (const claim of claims) {
    const [press, plan] = await Promise.all([
      deps.pressQueries(name, claim),
      deps.planQueries(questionKind(claim), name, claim),
    ]);
    const found = await deps.searchEvidence(
      claim,
      [claim],
      state.entities,
      state.sessionId,
      press,
      plan.statutes,
      claim,
      plan.stateQueries,
      plan.legalQuery,
    );
    const packed = packEvidence(state, found, claim, [claim]);
    const ranked = await deps.rerank([claim], packed.proof);
    const prueba = coverOutlets(ranked, packed.proof, (url) => trustedOutlet(url) ?? statePortal(url));
    const circulation = await deps.classifyCirculation([claim], packed.contrast);
    evidence.push(...prueba, ...packed.reference, ...circulation);
    trace.press.push(...press);
    trace.state.push(...plan.stateQueries);
    for (const url of packed.urls) {
      if (!trace.urls.includes(url)) trace.urls.push(url);
    }
    const judged = await deps.judgeClaim(claim, prueba, state.entities, packed.reference, claim);
    degraded = degraded || judged.degraded;
    const verdict = { claim, ...judged, sources: prueba };
    verdicts.push(verdict);
    stream.onDecision({
      claim,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      degraded: verdict.degraded,
      decisions: verdict.decisions,
    });
  }
  return { verdicts, degraded, evidence, trace };
}

function packEvidence(state: TumiState, found: EvidenceItem[], subject: string, fitClaims: string[]) {
  const reference = found.filter((item) => item.role === "referencia");
  const caseItems = found.filter((item) => item.role !== "referencia");
  const names = [
    ...state.entities.flatMap((entity) => entity.nombre.split(/\s+/)),
    ...fitClaims.flatMap(leadingNames),
  ];
  const identity = state.entities[0];
  const proof = caseItems.filter((item) => {
    if (item.role === "contraste") return false;
    if (identity && !countsAsProof(item, subject, { name: identity.nombre, party: identity.partido })) return false;
    return evidenceFits(fitClaims, item, names);
  });
  const contrast = caseItems.filter((item) => !proof.includes(item));
  const urls = [...new Set(found.flatMap((item) => (item.url ? [item.url] : [])))];
  return { reference, proof, contrast, urls };
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
