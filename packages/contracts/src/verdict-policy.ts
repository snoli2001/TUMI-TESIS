export const VERDICTS = [
  "verdadero",
  "falso",
  "enganoso",
  "no_verificable",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const SOURCE_ORIGINS = ["jne", "qdrant", "tavily"] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

export const SOURCE_ROLES = ["prueba", "contraste"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const SOURCE_STANCES = ["afirma", "desacredita", "menciona"] as const;
export type SourceStance = (typeof SOURCE_STANCES)[number];

export interface SourceRef {
  id: string;
  title: string;
  url: string | null;
  snippet: string;
  origin: SourceOrigin;
  role: SourceRole;
  stance: SourceStance | null;
  pagina: number | null;
  codigoExpediente: string | null;
}

export interface EntityRef {
  id: string;
  nombre: string;
  cargo: string;
  partido: string;
  fotoUrl: string | null;
  alias: string | null;
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
  hojaVidaId?: string;
}

export interface VideoSegmento {
  texto: string;
  inicioSeg: number | null;
  finSeg: number | null;
}

export interface VerificarVideoRequest {
  transcripcion?: string;
  url?: string;
  sessionId?: string;
}

export interface AfirmacionDeVideo extends FactCheckResult {
  inicioSeg: number | null;
  finSeg: number | null;
}

export interface VerificarVideoResult {
  sessionId: string;
  videoId: string | null;
  titulo: string | null;
  afirmaciones: AfirmacionDeVideo[];
}

export interface CandidateSummary {
  id: string;
  nombre: string;
  cargo: string;
  partido: string;
  sigla: string | null;
  fotoUrl: string | null;
  logoUrl: string | null;
  demostracion: boolean;
}

export interface HojaVidaEstudio {
  universidad: string | null;
  carrera: string | null;
  anio: string | null;
}

export interface HojaVidaTrabajo {
  ocupacion: string | null;
  centro: string | null;
  lugar: string | null;
  desde: string | null;
  hasta: string | null;
}

export interface HojaVidaCargo {
  organizacion: string | null;
  cargo: string | null;
  desde: string | null;
  hasta: string | null;
}

export interface HojaVidaRenuncia {
  organizacion: string | null;
  anio: string | null;
}

export interface HojaVidaIngreso {
  anio: string | null;
  total: string | null;
}

export interface HojaVidaInmueble {
  tipo: string | null;
  direccion: string | null;
  autovaluo: string | null;
}

export interface HojaVidaVehiculo {
  placa: string | null;
  valor: string | null;
}

export interface HojaVidaSentencia {
  materia: string | null;
  expediente: string | null;
  fecha: string | null;
  fallo: string | null;
}

export interface HojaVida {
  sexo: string | null;
  fechaNacimiento: string | null;
  cargo: string | null;
  primariaCompleta: boolean | null;
  secundariaCompleta: boolean | null;
  estudios: HojaVidaEstudio[];
  trabajo: HojaVidaTrabajo[];
  cargosElectos: HojaVidaCargo[];
  renuncias: HojaVidaRenuncia[];
  ingresos: HojaVidaIngreso[];
  inmuebles: HojaVidaInmueble[];
  vehiculos: HojaVidaVehiculo[];
  sentenciasPenales: HojaVidaSentencia[];
  sentenciasObligacion: HojaVidaSentencia[];
}

export interface PlanPropuesta {
  problema: string | null;
  objetivo: string | null;
  indicador: string | null;
  meta: string | null;
}

export interface PlanDimension {
  id: string;
  nombre: string;
  propuestas: PlanPropuesta[];
}

export interface PlanGobierno {
  ideario: string | null;
  vision: string | null;
  pdfCompleto: string | null;
  pdfResumen: string | null;
  dimensiones: PlanDimension[];
}

export interface CandidateProfile extends CandidateSummary {
  hojaVida: HojaVida | null;
  plan: PlanGobierno | null;
}

export interface CandidateSearchResult {
  resultados: CandidateSummary[];
  total: number;
  organizaciones: string[];
  sexos: string[];
}

export interface GeoItem {
  code: string;
  name: string;
}

export interface CandidateSearchFilters {
  departamento?: string;
  provincia?: string;
  distrito?: string;
  organizacion?: string;
  sexo?: string;
  orden?: "nombre" | "organizacion";
  experienciaElectoral?: boolean;
  sinSentencias?: boolean;
  primaria?: boolean;
  secundaria?: boolean;
  superiores?: boolean;
  trabajo?: boolean;
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
