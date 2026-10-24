export interface DemoPartido {
  id: string;
  nombre: string;
  sigla: string;
}

export interface DemoCandidato {
  id: string;
  nombre: string;
  cargo: string;
  biografia: string;
  partidoId: string;
}

export interface DemoPlan {
  id: string;
  titulo: string;
  resumen: string;
  candidatoId: string;
}

export interface DemoDocumento {
  id: string;
  titulo: string;
  contenido: string;
  candidatoId: string;
}

export const demoPartidos: DemoPartido[] = [
  {
    id: "demo-partido-sol",
    nombre: "Movimiento Demostración del Sol",
    sigla: "MDS",
  },
  {
    id: "demo-partido-rio",
    nombre: "Alianza Demostración del Río",
    sigla: "ADR",
  },
];

export const demoCandidatos: DemoCandidato[] = [
  {
    id: "demo-aurora",
    nombre: "Aurora Quispe Demo",
    cargo: "Presidencia",
    partidoId: "demo-partido-sol",
    biografia:
      "Candidata ficticia de demostración. Su hoja de vida de ejemplo registra como propuesta bandera un tren eléctrico entre Lima y el Callao.",
  },
  {
    id: "demo-mateo",
    nombre: "Mateo Rivas Demo",
    cargo: "Presidencia",
    partidoId: "demo-partido-rio",
    biografia:
      "Candidato ficticio de demostración. Su hoja de vida de ejemplo prioriza atención primaria de salud y no menciona un tren al Callao.",
  },
];

export const demoPlanes: DemoPlan[] = [
  {
    id: "demo-plan-aurora",
    candidatoId: "demo-aurora",
    titulo: "Plan de gobierno de demostración del Sol",
    resumen:
      "El plan de demostración promete construir un tren eléctrico Lima–Callao en cuatro años. No propone eliminar el IGV.",
  },
  {
    id: "demo-plan-mateo",
    candidatoId: "demo-mateo",
    titulo: "Plan de gobierno de demostración del Río",
    resumen:
      "El plan de demostración promete duplicar el presupuesto de atención primaria de salud. No menciona un tren hacia el Callao.",
  },
];

export const demoDocumentos: DemoDocumento[] = [
  {
    id: "demo-doc-aurora-hv",
    candidatoId: "demo-aurora",
    titulo: "Hoja de vida de demostración — Aurora Quispe Demo",
    contenido:
      "Hoja de vida de demostración, no es un registro del JNE. Aurora Quispe Demo postula a la presidencia por el Movimiento Demostración del Sol. La hoja registra como propuesta bandera un tren eléctrico entre Lima y el Callao.",
  },
  {
    id: "demo-doc-aurora-plan",
    candidatoId: "demo-aurora",
    titulo: "Plan de demostración — Movimiento Demostración del Sol",
    contenido:
      "Documento de demostración. El plan promete construir un tren eléctrico Lima–Callao en cuatro años. No propone eliminar el IGV. Los datos no provienen de una publicación oficial.",
  },
  {
    id: "demo-doc-mateo-plan",
    candidatoId: "demo-mateo",
    titulo: "Plan de demostración — Alianza Demostración del Río",
    contenido:
      "Documento de demostración. Mateo Rivas Demo promete duplicar el presupuesto de atención primaria de salud. El texto no menciona un tren hacia el Callao ni una eliminación del IGV.",
  },
];

export function splitFragmentos(contenido: string): string[] {
  const parts = contenido
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [contenido];
}
