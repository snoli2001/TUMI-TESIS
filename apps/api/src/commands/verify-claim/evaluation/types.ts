import type { SystemVerdict } from "./cases";

export const EVAL_CONCURRENCY = 1;
export const EVAL_TIMEOUT_MS = 180_000;

export type CaseStatus = "coincide" | "difiere" | "sin_candidato" | "timeout" | "error";

export type PassageSupport = "suficiente" | "insuficiente" | "no_aplica";

export interface CitedSource {
  id: string;
  title: string;
  url: string | null;
  snippet: string;
  origin: string;
  role: string;
}

export interface ExplanationSentence {
  id: string;
  text: string;
}

export interface ReturnedEntity {
  id: string;
  nombre: string;
  cargo: string;
}

export interface CaseReport {
  id: string;
  person: string;
  claim: string;
  expectedLabel: string;
  verdicts: SystemVerdict[];
  evaluates: string;
  criterion: string;
  status: CaseStatus;
  actual: string | null;
  explanation: string | null;
  conclusion: string | null;
  sentences: ExplanationSentence[];
  citedReference: boolean | null;
  sources: CitedSource[];
  entity: ReturnedEntity | null;
  firstEventMs: number | null;
  resultMs: number | null;
  error: string | null;
}

export interface RunSummary {
  concurrency: number;
  timeoutMs: number;
  total: number;
  scored: number;
  hits: number;
  skipped: number;
  errors: number;
  timeouts: number;
  firstEventMs: { p50: number | null; p95: number | null; n: number };
  resultMs: { p50: number | null; p95: number | null; n: number };
  cases: CaseReport[];
}

export interface CitationMark {
  id: string;
  supportsExplanation: boolean | null;
}

export interface SentenceMark {
  id: string;
  needsSupport: boolean | null;
  supported: boolean | null;
}

export interface ReviewerPass {
  reviewer: string;
  candidateOk: boolean | null;
  periodOk: boolean | null;
  passageSupports: PassageSupport | null;
  abstainsProperly: boolean | null;
  proposedVerdict: SystemVerdict | null;
  citations: CitationMark[];
  sentences: SentenceMark[];
}

export interface AdjudicatedCitation {
  id: string;
  supportsExplanation: boolean;
}

export interface AdjudicatedSentence {
  id: string;
  needsSupport: boolean;
  supported: boolean;
}

export interface CaseReview {
  id: string;
  passes: ReviewerPass[];
  adjudicatedVerdict: SystemVerdict | null;
  adjudicatedPassage: PassageSupport | null;
  adjudicatedAbstains: boolean | null;
  adjudicatedCitations: AdjudicatedCitation[];
  adjudicatedSentences: AdjudicatedSentence[];
}

export interface ReviewsFile {
  note?: string;
  cases: CaseReview[];
}
