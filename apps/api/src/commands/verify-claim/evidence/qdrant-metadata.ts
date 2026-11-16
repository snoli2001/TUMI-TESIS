export const EVIDENCE_ORIGINS = ["plan", "adjunto", "documento"] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export interface EvidenceChunk {
  id: string;
  texto: string;
  titulo: string;
  url: string | null;
  origen: EvidenceOrigin;
  codigoExpediente: string | null;
  pagina: number | null;
  sessionId: string | null;
  hojaVidaId?: string | null;
  documentId?: string | null;
}

export interface EvidenceScope {
  codigoExpedientes: string[];
  sessionId?: string;
  hojaVidaIds?: string[];
  incluirPlan?: boolean;
}

export const PAYLOAD_INDEXES = [
  { field_name: "origen", field_schema: "keyword" },
  { field_name: "codigoExpediente", field_schema: "keyword" },
  { field_name: "sessionId", field_schema: "keyword" },
  { field_name: "hojaVidaId", field_schema: "keyword" },
  { field_name: "documentId", field_schema: "keyword" },
  { field_name: "pagina", field_schema: "integer" },
] as const;

export interface EvidenceFilter {
  should: Array<{ must: Array<{ key: string; match: { value: string } | { any: string[] } }> }>;
}

export function evidenceFilter(scope: EvidenceScope): EvidenceFilter | null {
  const should: EvidenceFilter["should"] = [];
  const expedientes = scope.codigoExpedientes.filter((value) => value.length > 0);
  if (scope.incluirPlan !== false && expedientes.length > 0) {
    should.push({
      must: [
        { key: "origen", match: { value: "plan" } },
        { key: "codigoExpediente", match: { any: expedientes } },
      ],
    });
  }
  if (scope.sessionId) {
    should.push({
      must: [
        { key: "origen", match: { value: "adjunto" } },
        { key: "sessionId", match: { value: scope.sessionId } },
      ],
    });
  }
  const hojas = (scope.hojaVidaIds ?? []).filter((value) => value.length > 0);
  if (hojas.length > 0) {
    should.push({
      must: [
        { key: "origen", match: { value: "documento" } },
        { key: "hojaVidaId", match: { any: hojas } },
      ],
    });
  }
  return should.length > 0 ? { should } : null;
}

export function chunkPayload(chunk: EvidenceChunk): Record<string, string | number> {
  if (chunk.origen === "plan" && !chunk.codigoExpediente) {
    throw new Error("Un fragmento de plan necesita codigoExpediente");
  }
  if (chunk.origen === "adjunto" && !chunk.sessionId) {
    throw new Error("Un fragmento adjunto necesita sessionId");
  }
  if (chunk.origen === "documento" && (!chunk.hojaVidaId || !chunk.documentId)) {
    throw new Error("Un fragmento de documento necesita hojaVidaId y documentId");
  }
  const payload: Record<string, string | number> = {
    fragmentoId: chunk.id,
    texto: chunk.texto,
    titulo: chunk.titulo,
    origen: chunk.origen,
  };
  if (chunk.url) payload.url = chunk.url;
  if (chunk.codigoExpediente) payload.codigoExpediente = chunk.codigoExpediente;
  if (chunk.pagina !== null) payload.pagina = chunk.pagina;
  if (chunk.sessionId) payload.sessionId = chunk.sessionId;
  if (chunk.hojaVidaId) payload.hojaVidaId = chunk.hojaVidaId;
  if (chunk.documentId) payload.documentId = chunk.documentId;
  return payload;
}
