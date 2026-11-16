import type { ClaimVerdict, DecisionAnswer, SourceRef } from "@tumi/contracts";

const PASOS: Record<string, string> = {
  transcripcion: "Transcripción",
  identificacion: "Identificación",
  extraccion: "Extracción",
  investigacion: "Investigación",
  recuperacion: "Recuperación",
  verificacion: "Verificación",
  explicacion: "Explicación",
};

const ESTADOS: Record<string, string> = {
  start: "en curso",
  done: "listo",
};

const TIPOS: Record<string, string> = {
  refusal: "sin respuesta",
  predicate: "probabilidad",
  choice: "elección",
  score: "puntaje",
};

const ORIGENES: Record<string, string> = {
  jne: "padrón",
  tavily: "web",
  plan: "plan",
  adjunto: "adjunto",
  cdn: "plan",
};

export function stepLabel(node: string): string {
  if (PASOS[node]) return PASOS[node];
  return node.replace(/^afirmacion/, "Afirmación");
}

export function statusLabel(status: string): string {
  return ESTADOS[status] ?? status;
}

export function typeLabel(type: string): string {
  return TIPOS[type] ?? type;
}

export function originLabel(origin: string): string {
  return ORIGENES[origin] ?? origin;
}

export function stanceLabel(stance: string | null): string {
  if (stance === "afirma") return "La da por cierta";
  if (stance === "desacredita") return "La desacredita";
  if (stance === "menciona") return "Solo la menciona";
  return "Circula, sin clasificar";
}

export function proofSources(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role !== "contraste");
}

export function contrastSources(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role === "contraste");
}

export function citationLabel(source: SourceRef): string {
  if (source.origin === "tavily") return "Medio";
  if (source.title === "Hoja de vida") return "Hoja de vida";
  if (source.title === "Plan de gobierno" || source.origin === "qdrant" || source.pagina !== null) {
    return "Plan de gobierno";
  }
  return "Padrón";
}

export function primaryCitation(sources: SourceRef[]): SourceRef | null {
  const proof = proofSources(sources);
  return (
    proof.find((source) => source.id.startsWith("oficial-")) ??
    proof.find((source) => source.title === "Hoja de vida") ??
    proof.find((source) => source.pagina !== null && source.codigoExpediente) ??
    proof.find((source) => source.origin === "qdrant") ??
    proof[0] ??
    null
  );
}

export interface ClassifierReading {
  supports: number | null;
  denies: number | null;
  strength: number | null;
  strengthText: string | null;
}

export function classifierReading(decisions: DecisionAnswer[]): ClassifierReading {
  const supports = decisions.find((item) => item.type === "predicate" && item.name === "apoya");
  const denies = decisions.find((item) => item.type === "predicate" && item.name === "contradice");
  const strength = decisions.find((item) => item.type === "score" && item.name === "solidez");
  const best =
    strength?.type === "score"
      ? [...strength.probabilities].sort((left, right) => right.probability - left.probability)[0]
      : undefined;
  return {
    supports: supports?.type === "predicate" ? supports.probability : null,
    denies: denies?.type === "predicate" ? denies.probability : null,
    strength: best?.probability ?? (strength?.type === "score" ? strength.confidence : null),
    strengthText: strengthLabel(best?.label ?? null),
  };
}

export function hasReading(verdict: ClaimVerdict): boolean {
  const reading = classifierReading(verdict.decisions);
  return reading.supports !== null || reading.denies !== null || reading.strength !== null;
}

function strengthLabel(label: string | null): string | null {
  if (label === "debil") return "débil";
  if (label === "media") return "media";
  if (label === "alta") return "alta";
  return null;
}
