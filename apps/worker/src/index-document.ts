import { readFile } from "node:fs/promises";
import { getPrisma, documentPath } from "@tumi/database";
import { extractText, getDocumentProxy } from "unpdf";
import OpenAI from "openai";
import { deleteDocumentPoints, upsertDocumentChunks } from "./qdrant-store";

export async function indexUploadedDocument(documentId: string): Promise<void> {
  const prisma = getPrisma();
  const doc = await prisma.candidateDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) return;
  try {
    const bytes = new Uint8Array(await readFile(documentPath(doc.storageName)));
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
      throw new Error("El archivo no es un PDF");
    }
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
    const chunks = pages.flatMap((page, pageIndex) =>
      splitPage(page).map((texto, chunkIndex) => ({
        id: `${documentId}-p${pageIndex + 1}-c${chunkIndex}`,
        texto,
        titulo: doc.originalName,
        pagina: pageIndex + 1,
        hojaVidaId: doc.hojaVidaId,
        documentId,
      })),
    );
    if (chunks.length === 0 || !process.env.OPENAI_API_KEY) {
      await prisma.candidateDocument.update({
        where: { id: documentId },
        data: { status: "failed", pageCount: pages.length },
      });
      if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY para indexar el documento");
      return;
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await deleteDocumentPoints(documentId);
    for (let offset = 0; offset < chunks.length; offset += 16) {
      const group = chunks.slice(offset, offset + 16);
      const embedded = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
        input: group.map((chunk) => chunk.texto),
      });
      await upsertDocumentChunks(
        group,
        embedded.data.map((item) => item.embedding),
      );
    }
    await prisma.candidateDocument.update({
      where: { id: documentId },
      data: { status: "ready", pageCount: pages.length },
    });
  } catch (error) {
    await prisma.candidateDocument.update({
      where: { id: documentId },
      data: { status: "failed" },
    }).catch(() => undefined);
    throw error;
  }
}

function splitPage(page: string): string[] {
  const clean = page.replace(/\s+/g, " ").trim();
  if (clean.length < 40) return [];
  const parts: string[] = [];
  for (let start = 0; start < clean.length && parts.length < 12; start += 1000) {
    parts.push(clean.slice(start, start + 1200));
  }
  return parts;
}
