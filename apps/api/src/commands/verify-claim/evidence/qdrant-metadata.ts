export const EVIDENCE_ORIGINS = ["plan", "adjunto"] as const;
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
}

export interface EvidenceScope {
  codigoExpedientes: string[];
  sessionId?: string;
}

export const PAYLOAD_INDEXES = [
  { field_name: "origen", field_schema: "keyword" },
  { field_name: "codigoExpediente", field_schema: "keyword" },
  { field_name: "sessionId", field_schema: "keyword" },
  { field_name: "pagina", field_schema: "integer" },
] as const;

export interface EvidenceFilter {
  should: Array<{ must: Array<{ key: string; match: { value: string } | { any: string[] } }> }>;
}

export function evidenceFilter(scope: EvidenceScope): EvidenceFilter | null {
  const should: EvidenceFilter["should"] = [];
  const expedientes = scope.codigoExpedientes.filter((value) => value.length > 0);
  if (expedientes.length > 0) {
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
  return should.length > 0 ? { should } : null;
}

export function chunkPayload(chunk: EvidenceChunk): Record<string, string | number> {
  if (chunk.origen === "plan" && !chunk.codigoExpediente) {
    throw new Error("Un fragmento de plan necesita codigoExpediente");
  }
  if (chunk.origen === "adjunto" && !chunk.sessionId) {
    throw new Error("Un fragmento adjunto necesita sessionId");
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
  return payload;
}
