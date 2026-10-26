export const VERDICTS = [
  "verdadero",
  "falso",
  "enganoso",
  "no_verificable",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const SOURCE_ORIGINS = ["jne", "qdrant", "tavily"] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

export interface SourceRef {
  id: string;
  title: string;
  url: string | null;
  snippet: string;
  origin: SourceOrigin;
}

export interface EntityRef {
  id: string;
  nombre: string;
  cargo: string;
  partido: string;
}

export interface ProbabilityValue {
  value: string;
  probability: number;
}

export interface ScoreProbability {
  label: string;
  value: number;
  probability: number;
}

export type DecisionAnswer =
  | { type: "predicate"; name: string; probability: number }
  | {
      type: "choice";
      name: string;
      choice: string;
      confidence: number;
      probabilities: ProbabilityValue[];
    }
  | {
      type: "score";
      name: string;
      score: number;
      confidence: number;
      probabilities: ScoreProbability[];
    }
  | { type: "refusal"; name: string };

export interface ClaimVerdict {
  claim: string;
  verdict: Verdict;
  confidence: number | null;
  degraded: boolean;
  explanation: string;
  decisions: DecisionAnswer[];
  sources: SourceRef[];
}

export interface FactCheckResult {
  id: string;
  sessionId: string;
  query: string;
  conclusion: string;
  degraded: boolean;
  verdicts: ClaimVerdict[];
  sources: SourceRef[];
  entities: EntityRef[];
}

export interface FactCheckRequest {
  query: string;
  sessionId?: string;
}

export interface VideoSegmento {
  texto: string;
  inicioSeg: number | null;
  finSeg: number | null;
}

export interface VerificarVideoRequest {
  transcripcion: string;
  sessionId?: string;
}

export interface AfirmacionDeVideo extends FactCheckResult {
  inicioSeg: number | null;
  finSeg: number | null;
}

export interface VerificarVideoResult {
  sessionId: string;
  afirmaciones: AfirmacionDeVideo[];
}

export interface CandidateSummary {
  id: string;
  nombre: string;
  cargo: string;
  partido: string;
  sigla: string | null;
  biografia: string;
  demostracion: boolean;
}

export interface CandidateProfile extends CandidateSummary {
  planes: Array<{ id: string; titulo: string; resumen: string }>;
  documentos: Array<{ id: string; titulo: string; url: string | null; origen: string }>;
}

export interface HistoryItem {
  id: string;
  query: string;
  conclusion: string;
  degraded: boolean;
  createdAt: string;
  inicioSeg: number | null;
  finSeg: number | null;
}

export interface ResolvedVerdict {
  verdict: Verdict;
  confidence: number | null;
}

const verdictSet = new Set<string>(VERDICTS);

export function isVerdict(value: string): value is Verdict {
  return verdictSet.has(value);
}

/**
 * Aplica el umbral de la aplicación sobre la respuesta `choice` de la Decisions API.
 * Un refusal o una confianza baja dejan el claim en no_verificable.
 * No inventa probabilidades cuando falta el veredicto.
 */
export function resolveVerdict(
  answers: DecisionAnswer[],
  minConfidence: number,
): ResolvedVerdict {
  const verdictAnswer = answers.find((answer) => answer.name === "veredicto");
  if (!verdictAnswer || verdictAnswer.type === "refusal") {
    return { verdict: "no_verificable", confidence: null };
  }
  if (verdictAnswer.type !== "choice" || !isVerdict(verdictAnswer.choice)) {
    return { verdict: "no_verificable", confidence: null };
  }
  if (verdictAnswer.confidence < minConfidence) {
    return { verdict: "no_verificable", confidence: verdictAnswer.confidence };
  }
  return {
    verdict: verdictAnswer.choice,
    confidence: verdictAnswer.confidence,
  };
}
