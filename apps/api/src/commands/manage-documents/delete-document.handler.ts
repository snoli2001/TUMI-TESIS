import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getPrisma, removeStoredDocument } from "@tumi/database";
import { VectorSearchService } from "../verify-claim/evidence/vector-search.service";

@Injectable()
export class DeleteDocumentHandler {
  constructor(private readonly vectors: VectorSearchService) {}

  async execute(documentId: string): Promise<{ id: string; status: "deleted" }> {
    const removed = await removeStoredDocument(documentId, (id) => this.vectors.deleteByDocument(id));
    if (!removed) throw new NotFoundException("Documento no encontrado");
    return { id: documentId, status: "deleted" };
  }
}

export async function listDocuments(hojaVidaId: string | undefined) {
  const id = hojaVidaId?.trim() ?? "";
  if (!id) throw new BadRequestException("Falta el candidato");
  const rows = await getPrisma().candidateDocument.findMany({
    where: { hojaVidaId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDocument);
}

export async function documentStatus(documentId: string) {
  const row = await getPrisma().candidateDocument.findUnique({ where: { id: documentId } });
  if (!row || row.deletedAt) throw new NotFoundException("Documento no encontrado");
  return toDocument(row);
}

function toDocument(row: {
  id: string;
  hojaVidaId: string;
  originalName: string;
  status: string;
  pageCount: number | null;
}) {
  return {
    id: row.id,
    hojaVidaId: row.hojaVidaId,
    originalName: row.originalName,
    status: row.status,
    pageCount: row.pageCount,
    available: row.status === "ready",
  };
}
