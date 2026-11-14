import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "./generated/prisma/client.js";
import { getPrisma } from "./client.js";
import { markWithdrawnPayload, retentionCutoff, retentionDays } from "./retention-policy.js";

const STORAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

export function documentDirectory(): string {
  const configured = process.env.DOCUMENT_DIR?.trim();
  return configured || path.join(process.cwd(), "data", "documents");
}

export function documentMaxBytes(): number {
  const parsed = Number(process.env.DOCUMENT_MAX_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 15 * 1024 * 1024;
}

export function documentPath(storageName: string): string {
  if (!STORAGE_NAME.test(storageName)) throw new Error("Nombre de archivo inválido");
  return path.join(documentDirectory(), storageName);
}

export async function saveDocumentFile(storageName: string, bytes: Buffer): Promise<void> {
  await mkdir(documentDirectory(), { recursive: true });
  await writeFile(documentPath(storageName), bytes);
}

export async function removeStoredDocument(
  documentId: string,
  deleteVectors: (documentId: string) => Promise<void>,
): Promise<boolean> {
  const prisma = getPrisma();
  const doc = await prisma.candidateDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) return false;
  await deleteVectors(doc.id);
  await rm(documentPath(doc.storageName), { force: true });
  await markWithdrawnSources(doc.id);
  await prisma.candidateDocument.update({
    where: { id: doc.id },
    data: { deletedAt: new Date(), status: "deleted" },
  });
  return true;
}

export async function sweepRetention(
  deleteVectors: (documentId: string) => Promise<void>,
  now = new Date(),
): Promise<{ sessions: number; documents: number }> {
  const prisma = getPrisma();
  const documents = await prisma.candidateDocument.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: retentionCutoff(retentionDays("DOCUMENT_RETENTION_DAYS", 365), now) },
    },
    select: { id: true },
  });
  let removed = 0;
  for (const document of documents) {
    if (await removeStoredDocument(document.id, deleteVectors)) removed += 1;
  }
  const sessionCutoff = retentionCutoff(retentionDays("CONSULTA_RETENTION_DAYS", 30), now);
  const expired = await prisma.factSession.findMany({
    where: { createdAt: { lt: sessionCutoff } },
    select: { id: true },
  });
  if (expired.length > 0) {
    await prisma.factTurn.deleteMany({ where: { sessionId: { in: expired.map((session) => session.id) } } });
  }
  const sessions = await prisma.factSession.deleteMany({ where: { createdAt: { lt: sessionCutoff } } });
  return { sessions: sessions.count, documents: removed };
}

async function markWithdrawnSources(documentId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return;
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(
    Prisma.sql`SELECT id FROM tumi.fact_turns WHERE sources::text LIKE ${`%${documentId}%`}`,
  );
  for (const row of rows) {
    const turn = await prisma.factTurn.findUnique({ where: { id: row.id } });
    if (!turn) continue;
    await prisma.factTurn.update({
      where: { id: row.id },
      data: { sources: markWithdrawnPayload(turn.sources, documentId) as Prisma.InputJsonValue },
    });
  }
}
