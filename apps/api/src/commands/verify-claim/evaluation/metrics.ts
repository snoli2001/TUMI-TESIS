import { SYSTEM_VERDICTS, type SystemVerdict } from "./cases";
import type { CaseReport, CaseReview, PassageSupport, ReviewsFile } from "./types";

export interface ClassScore {
  label: SystemVerdict;
  support: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface Confusion {
  labels: readonly SystemVerdict[];
  matrix: number[][];
  perClass: ClassScore[];
  macroF1: number | null;
  excluded: SystemVerdict[];
}

export interface LatencyStats {
  p50: number | null;
  p95: number | null;
  n: number;
}

export interface CitationScore {
  precision: number | null;
  coverage: number | null;
  citations: number;
  sentencesNeedingSupport: number;
}

export interface PilotScore {
  acceptedHits: number;
  scored: number;
  referenceCited: number;
  referenceTotal: number;
  firstEvent: LatencyStats;
  result: LatencyStats;
  errors: number;
  timeouts: number;
  kappaLabel: { value: number; n: number } | null;
  kappaPassage: { value: number; n: number } | null;
  supported: { supported: number; total: number; rate: number } | null;
  confusion: Confusion | null;
  citations: CitationScore | null;
  pending: string[];
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function latencyStats(values: Array<number | null>): LatencyStats {
  const samples = values.filter((value): value is number => value !== null);
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), n: samples.length };
}

export function cohenKappa(left: string[], right: string[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  const total = left.length;
  let matches = 0;
  for (let index = 0; index < total; index += 1) {
    if (left[index] === right[index]) matches += 1;
  }
  const observed = matches / total;
  const labels = new Set([...left, ...right]);
  let chance = 0;
  for (const label of labels) {
    const leftShare = left.filter((value) => value === label).length / total;
    const rightShare = right.filter((value) => value === label).length / total;
    chance += leftShare * rightShare;
  }
  if (chance === 1) return observed === 1 ? 1 : 0;
  return (observed - chance) / (1 - chance);
}

export function confusion(pairs: Array<{ gold: string; predicted: string }>): Confusion {
  const labels = SYSTEM_VERDICTS;
  const matrix = labels.map(() => labels.map(() => 0));
  for (const pair of pairs) {
    const gold = labels.indexOf(pair.gold as SystemVerdict);
    const predicted = labels.indexOf(pair.predicted as SystemVerdict);
    if (gold < 0 || predicted < 0) continue;
    matrix[gold][predicted] += 1;
  }
  const perClass = labels.map((label, row) => {
    const support = matrix[row].reduce((sum, count) => sum + count, 0);
    const predictedCount = matrix.reduce((sum, counts) => sum + counts[row], 0);
    const truePositive = matrix[row][row];
    if (support === 0) {
      return { label, support, precision: null, recall: null, f1: null };
    }
    const precision = predictedCount === 0 ? 0 : truePositive / predictedCount;
    const recall = truePositive / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, support, precision, recall, f1 };
  });
  const included = perClass.filter((item) => item.support > 0 && item.f1 !== null);
  const macroF1 = included.length === 0 ? null : included.reduce((sum, item) => sum + (item.f1 ?? 0), 0) / included.length;
  return {
    labels,
    matrix,
    perClass,
    macroF1,
    excluded: perClass.filter((item) => item.support === 0).map((item) => item.label),
  };
}

export function isSupported(input: {
  actual: string | null;
  adjudicatedVerdict: SystemVerdict;
  passageSupports: PassageSupport;
  abstainsProperly: boolean | null;
}): boolean {
  if (input.adjudicatedVerdict === "no_verificable") {
    return input.actual === "no_verificable" && input.abstainsProperly === true;
  }
  return input.actual === input.adjudicatedVerdict && input.passageSupports === "suficiente";
}

export function citationScores(
  citations: Array<{ supports: boolean }>,
  sentences: Array<{ needsSupport: boolean; supported: boolean }>,
): CitationScore {
  const needing = sentences.filter((sentence) => sentence.needsSupport);
  const precision = citations.length === 0 ? null : citations.filter((citation) => citation.supports).length / citations.length;
  const coverage = needing.length === 0 ? null : needing.filter((sentence) => sentence.supported).length / needing.length;
  return { precision, coverage, citations: citations.length, sentencesNeedingSupport: needing.length };
}

export function splitSentences(text: string): Array<{ id: string; text: string }> {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.map((sentence, index) => ({ id: `o${index + 1}`, text: sentence }));
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function scorePilot(cases: CaseReport[], reviews: ReviewsFile | null): PilotScore {
  const scored = cases.filter((item) => item.status === "coincide" || item.status === "difiere");
  const withReference = cases.filter((item) => item.citedReference !== null);
  const pending: string[] = [];
  const byId = new Map((reviews?.cases ?? []).map((review) => [review.id, review]));

  let kappaLabel: PilotScore["kappaLabel"] = null;
  let kappaPassage: PilotScore["kappaPassage"] = null;
  if (!reviews) {
    pending.push("Falta reviews.json. La hoja en blanco está en evaluation-output.");
  } else {
    kappaLabel = kappaOf(scored, byId, (pass) => pass.proposedVerdict);
    kappaPassage = kappaOf(scored, byId, (pass) => pass.passageSupports);
  }

  const verdictsReady = reviews ? missingVerdicts(scored, byId) : scored.map((item) => item.id);
  const passagesReady = reviews ? unresolvedPassages(scored, byId) : scored.map((item) => item.id);
  const citationsReady = reviews ? unresolvedCitations(scored, byId) : scored.map((item) => item.id);

  if (reviews && verdictsReady.length > 0) {
    pending.push(`Falta la etiqueta adjudicada de ${verdictsReady.join(", ")}.`);
  }
  if (reviews && passagesReady.length > 0) {
    pending.push(`Falta acuerdo sobre el pasaje o la abstención de ${passagesReady.join(", ")}.`);
  }
  if (reviews && citationsReady.length > 0) {
    pending.push(`Falta el marcado de citas u oraciones de ${citationsReady.join(", ")}.`);
  }

  const supported = reviews && verdictsReady.length === 0 && passagesReady.length === 0 ? supportedRate(scored, byId) : null;
  const matrix = reviews && verdictsReady.length === 0 ? confusion(verdictPairs(scored, byId)) : null;
  const citations = reviews && citationsReady.length === 0 ? pooledCitations(scored, byId) : null;

  return {
    acceptedHits: scored.filter((item) => item.status === "coincide").length,
    scored: scored.length,
    referenceCited: withReference.filter((item) => item.citedReference).length,
    referenceTotal: withReference.length,
    firstEvent: latencyStats(cases.map((item) => item.firstEventMs)),
    result: latencyStats(cases.map((item) => item.resultMs)),
    errors: cases.filter((item) => item.status === "error").length,
    timeouts: cases.filter((item) => item.status === "timeout").length,
    kappaLabel,
    kappaPassage,
    supported,
    confusion: matrix,
    citations,
    pending,
  };
}

function kappaOf(
  cases: CaseReport[],
  reviews: Map<string, CaseReview>,
  read: (pass: CaseReview["passes"][number]) => string | null,
): { value: number; n: number } | null {
  const left: string[] = [];
  const right: string[] = [];
  for (const item of cases) {
    const review = reviews.get(item.id);
    const first = review?.passes[0];
    const second = review?.passes[1];
    const leftValue = first ? read(first) : null;
    const rightValue = second ? read(second) : null;
    if (!leftValue || !rightValue) continue;
    left.push(leftValue);
    right.push(rightValue);
  }
  const value = cohenKappa(left, right);
  if (value === null) return null;
  return { value, n: left.length };
}

function missingVerdicts(cases: CaseReport[], reviews: Map<string, CaseReview>): string[] {
  return cases.filter((item) => !isVerdict(reviews.get(item.id)?.adjudicatedVerdict)).map((item) => item.id);
}

function unresolvedPassages(cases: CaseReport[], reviews: Map<string, CaseReview>): string[] {
  return cases.filter((item) => !passageDecision(reviews.get(item.id))).map((item) => item.id);
}

function unresolvedCitations(cases: CaseReport[], reviews: Map<string, CaseReview>): string[] {
  return cases.filter((item) => !citationDecision(item, reviews.get(item.id))).map((item) => item.id);
}

function passageDecision(review: CaseReview | undefined): { passage: PassageSupport; abstains: boolean | null } | null {
  if (!review || !isVerdict(review.adjudicatedVerdict)) return null;
  const passage = review.adjudicatedPassage ?? agreed(review.passes[0]?.passageSupports ?? null, review.passes[1]?.passageSupports ?? null);
  const abstains = review.adjudicatedAbstains ?? agreed(review.passes[0]?.abstainsProperly ?? null, review.passes[1]?.abstainsProperly ?? null);
  if (!passage) return null;
  if (review.adjudicatedVerdict === "no_verificable" && abstains === null) return null;
  return { passage, abstains };
}

function citationDecision(
  item: CaseReport,
  review: CaseReview | undefined,
): { citations: Array<{ supports: boolean }>; sentences: Array<{ needsSupport: boolean; supported: boolean }> } | null {
  if (!review) return null;
  const citations = item.sources.map((source) => {
    const adjudicated = review.adjudicatedCitations.find((mark) => mark.id === source.id);
    if (adjudicated) return { supports: adjudicated.supportsExplanation };
    const left = review.passes[0]?.citations.find((mark) => mark.id === source.id)?.supportsExplanation ?? null;
    const right = review.passes[1]?.citations.find((mark) => mark.id === source.id)?.supportsExplanation ?? null;
    const agreedMark = agreed(left, right);
    return agreedMark === null ? null : { supports: agreedMark };
  });
  const sentences = item.sentences.map((sentence) => {
    const adjudicated = review.adjudicatedSentences.find((mark) => mark.id === sentence.id);
    if (adjudicated) return { needsSupport: adjudicated.needsSupport, supported: adjudicated.supported };
    const left = review.passes[0]?.sentences.find((mark) => mark.id === sentence.id);
    const right = review.passes[1]?.sentences.find((mark) => mark.id === sentence.id);
    const needsSupport = agreed(left?.needsSupport ?? null, right?.needsSupport ?? null);
    const supported = agreed(left?.supported ?? null, right?.supported ?? null);
    if (needsSupport === null || supported === null) return null;
    return { needsSupport, supported };
  });
  if (citations.some((mark) => mark === null) || sentences.some((mark) => mark === null)) return null;
  return {
    citations: citations.filter((mark): mark is { supports: boolean } => mark !== null),
    sentences: sentences.filter((mark): mark is { needsSupport: boolean; supported: boolean } => mark !== null),
  };
}

function supportedRate(cases: CaseReport[], reviews: Map<string, CaseReview>): { supported: number; total: number; rate: number } {
  let supported = 0;
  for (const item of cases) {
    const review = reviews.get(item.id);
    const decision = passageDecision(review);
    if (!review?.adjudicatedVerdict || !decision) continue;
    if (
      isSupported({
        actual: item.actual,
        adjudicatedVerdict: review.adjudicatedVerdict,
        passageSupports: decision.passage,
        abstainsProperly: decision.abstains,
      })
    ) {
      supported += 1;
    }
  }
  return { supported, total: cases.length, rate: cases.length === 0 ? 0 : supported / cases.length };
}

function verdictPairs(cases: CaseReport[], reviews: Map<string, CaseReview>): Array<{ gold: string; predicted: string }> {
  return cases.flatMap((item) => {
    const gold = reviews.get(item.id)?.adjudicatedVerdict;
    if (!gold || !item.actual) return [];
    return [{ gold, predicted: item.actual }];
  });
}

function pooledCitations(cases: CaseReport[], reviews: Map<string, CaseReview>): CitationScore {
  const citations: Array<{ supports: boolean }> = [];
  const sentences: Array<{ needsSupport: boolean; supported: boolean }> = [];
  for (const item of cases) {
    const decision = citationDecision(item, reviews.get(item.id));
    if (!decision) continue;
    citations.push(...decision.citations);
    sentences.push(...decision.sentences);
  }
  return citationScores(citations, sentences);
}

function agreed<T>(left: T | null, right: T | null): T | null {
  if (left === null || right === null || left !== right) return null;
  return left;
}

function isVerdict(value: string | null | undefined): value is SystemVerdict {
  return SYSTEM_VERDICTS.some((verdict) => verdict === value);
}
