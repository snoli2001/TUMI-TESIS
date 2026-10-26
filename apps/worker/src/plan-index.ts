import { getPrisma } from "@tumi/database";
import { extractText, getDocumentProxy } from "unpdf";
import OpenAI from "openai";
import { planAlreadyIndexed, upsertChunks, type PlanChunk } from "./qdrant-store";

const BATCH = 4;

export interface IndexBatchResult {
  next: string | null;
  indexed: number;
  skipped: number;
  failed: number;
  chunks: number;
}

export async function indexNextBatch(after?: string): Promise<IndexBatchResult> {
  const plans = await getPrisma().plan.findMany({
    where: {
      AND: [
        { summaryPdfSourceUrl: { not: null } },
        { NOT: { summaryPdfSourceUrl: "" } },
        ...(after ? [{ codigoExpediente: { gt: after } }] : []),
      ],
    },
    orderBy: { codigoExpediente: "asc" },
    take: BATCH,
    select: { codigoExpediente: true, summaryPdfSourceUrl: true },
  });
  const result: IndexBatchResult = {
    next: plans.at(-1)?.codigoExpediente ?? null,
    indexed: 0,
    skipped: 0,
    failed: 0,
    chunks: 0,
  };
  const outcomes = [];
  for (const plan of plans) {
    if (!plan.summaryPdfSourceUrl) {
      outcomes.push({ skipped: false, chunks: 0, failed: false });
      continue;
    }
    try {
      const saved = await indexSummaryPlan(plan.codigoExpediente, plan.summaryPdfSourceUrl);
      outcomes.push({ skipped: saved.skipped, chunks: saved.chunks, failed: false });
      if (!saved.skipped) await sleep(800);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("OPENAI_API_KEY") || message.includes("invalid_api_key") || message.includes("401")) {
        throw error;
      }
      console.warn(`plan ${plan.codigoExpediente} no se indexó: ${message}`);
      outcomes.push({ skipped: false, chunks: 0, failed: true });
    }
  }
  for (const outcome of outcomes) {
    if (outcome.failed) result.failed += 1;
    else if (outcome.skipped) result.skipped += 1;
    else result.indexed += 1;
    result.chunks += outcome.chunks;
  }
  if (plans.length < BATCH) result.next = null;
  return result;
}

export async function indexSummaryPlan(
  codigoExpediente: string,
  url: string,
): Promise<{ skipped: boolean; chunks: number }> {
  if (await planAlreadyIndexed(codigoExpediente)) return { skipped: true, chunks: 0 };
  const chunks = await chunksFromPdf(codigoExpediente, url);
  if (chunks.length === 0) return { skipped: false, chunks: 0 };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY para indexar los planes");
  for (let offset = 0; offset < chunks.length; offset += 16) {
    const group = chunks.slice(offset, offset + 16);
    const embedded = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
      input: group.map((chunk) => chunk.texto),
    });
    await upsertChunks(
      group,
      embedded.data.map((item) => item.embedding),
    );
  }
  return { skipped: false, chunks: chunks.length };
}

async function chunksFromPdf(codigoExpediente: string, url: string): Promise<PlanChunk[]> {
  const bytes = await downloadPdf(url);
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("La URL no devolvió un PDF");
  }
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  const chunks: PlanChunk[] = [];
  pages.forEach((page, pageIndex) => {
    splitPage(page).forEach((texto, chunkIndex) => {
      chunks.push({
        id: `${codigoExpediente}-p${pageIndex + 1}-c${chunkIndex}`,
        texto,
        titulo: "Plan de gobierno",
        url,
        codigoExpediente,
        pagina: pageIndex + 1,
      });
    });
  });
  return chunks.slice(0, 120);
}

async function downloadPdf(url: string): Promise<Uint8Array> {
  let waitMs = 2000;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: "follow" });
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 6) throw new Error(`PDF respondió ${response.status}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
    await sleep(Math.min(delay, 60_000));
    waitMs = Math.min(waitMs * 2, 30_000);
  }
  throw new Error("PDF respondió 429");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
