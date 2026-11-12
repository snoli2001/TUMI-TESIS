import type { ClaimVerdict, DecisionAnswer, SourceRef } from "@tumi/contracts";

const PASOS: Record<string, string> = {
  transcripcion: "Transcripción",
  identificacion: "Identificación",
  extraccion: "Extracción",
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

export function etiquetaPaso(node: string): string {
  if (PASOS[node]) return PASOS[node];
  return node.replace(/^afirmacion/, "Afirmación");
}

export function etiquetaEstado(status: string): string {
  return ESTADOS[status] ?? status;
}

export function etiquetaTipo(type: string): string {
  return TIPOS[type] ?? type;
}

export function etiquetaOrigen(origin: string): string {
  return ORIGENES[origin] ?? origin;
}

export function etiquetaPostura(stance: string | null): string {
  if (stance === "afirma") return "La da por cierta";
  if (stance === "desacredita") return "La desacredita";
  if (stance === "menciona") return "Solo la menciona";
  return "Circula, sin clasificar";
}

export function fuentesDePrueba(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role !== "contraste");
}

export function fuentesDeContraste(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role === "contraste");
}

export function citaDelPlan(sources: SourceRef[]): SourceRef | null {
  return (
    sources.find((source) => source.pagina !== null && source.codigoExpediente) ??
    sources.find((source) => source.origin === "qdrant") ??
    null
  );
}

export interface LecturaClasificador {
  respalda: number | null;
  niega: number | null;
  solidez: number | null;
  solidezTexto: string | null;
}

export function lecturaClasificador(decisions: DecisionAnswer[]): LecturaClasificador {
  const respalda = decisions.find((item) => item.type === "predicate" && item.name === "apoya");
  const niega = decisions.find((item) => item.type === "predicate" && item.name === "contradice");
  const solidez = decisions.find((item) => item.type === "score" && item.name === "solidez");
  const mejor =
    solidez?.type === "score"
      ? [...solidez.probabilities].sort((left, right) => right.probability - left.probability)[0]
      : undefined;
  return {
    respalda: respalda?.type === "predicate" ? respalda.probability : null,
    niega: niega?.type === "predicate" ? niega.probability : null,
    solidez: mejor?.probability ?? (solidez?.type === "score" ? solidez.confidence : null),
    solidezTexto: etiquetaSolidez(mejor?.label ?? null),
  };
}

export function tieneLectura(verdict: ClaimVerdict): boolean {
  const lectura = lecturaClasificador(verdict.decisions);
  return lectura.respalda !== null || lectura.niega !== null || lectura.solidez !== null;
}

function etiquetaSolidez(label: string | null): string | null {
  if (label === "debil") return "débil";
  if (label === "media") return "media";
  if (label === "alta") return "alta";
  return null;
}
