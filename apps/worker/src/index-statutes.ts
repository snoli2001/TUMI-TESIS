import { extractText, getDocumentProxy } from "unpdf";
import OpenAI from "openai";
import { loadEnv } from "./load-env";
import { downloadPdf, splitPage } from "./plan-index";
import { deleteDocumentPoints, upsertStatuteChunks } from "./qdrant-store";
import { STATUTE_DOCUMENTS, type StatuteDocument } from "./statutes";

loadEnv();

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY para indexar las normas");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let failed = 0;
  for (const statute of STATUTE_DOCUMENTS) {
    try {
      console.log(JSON.stringify({ id: statute.id, status: "reading" }));
      const chunks = await chunksOf(statute);
      const vectors: number[][] = [];
      for (let offset = 0; offset < chunks.length; offset += 16) {
        const group = chunks.slice(offset, offset + 16);
        vectors.push(...(await embed(openai, group.map((chunk) => chunk.texto))));
        console.log(JSON.stringify({ id: statute.id, embedded: Math.min(offset + group.length, chunks.length), chunks: chunks.length }));
      }
      await deleteDocumentPoints(statute.id);
      for (let offset = 0; offset < chunks.length; offset += 16) {
        const group = chunks.slice(offset, offset + 16);
        await upsertStatuteChunks(group, vectors.slice(offset, offset + group.length));
      }
      console.log(JSON.stringify({ id: statute.id, chunks: chunks.length }));
    } catch (error) {
      failed += 1;
      console.error(`${statute.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failed > 0) process.exit(1);
}

async function embed(openai: OpenAI, input: string[]): Promise<number[][]> {
  let waitMs = 2000;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const embedded = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
        input,
      });
      return embedded.data.map((item) => item.embedding);
    } catch (error) {
      const status = error instanceof OpenAI.APIError ? error.status : 0;
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt === 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      waitMs = Math.min(waitMs * 2, 30_000);
    }
  }
  throw new Error("No se pudo calcular los embeddings");
}

async function chunksOf(statute: StatuteDocument) {
  const bytes = await downloadPdf(statute.url, 180_000);
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("La URL no devolvió un PDF");
  }
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  const chunks = pages.flatMap((page, pageIndex) =>
    splitPage(page).map((texto, chunkIndex) => ({
      id: `norma-${statute.id}-p${pageIndex + 1}-c${chunkIndex}`,
      texto,
      titulo: statute.title,
      url: statute.url,
      pagina: pageIndex + 1,
      documentId: statute.id,
      edicion: statute.edition,
    })),
  );
  if (chunks.length === 0) throw new Error("El PDF no tiene texto para indexar");
  return chunks;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
