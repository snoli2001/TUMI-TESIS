const PASOS: Record<string, string> = {
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
