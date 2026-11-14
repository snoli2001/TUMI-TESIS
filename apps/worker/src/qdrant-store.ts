import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";

export const EVIDENCE_COLLECTION = "tumi_evidence";
const EMBEDDING_SIZE = 3072;
const INDEXES = [
  { field_name: "origen", field_schema: "keyword" },
  { field_name: "codigoExpediente", field_schema: "keyword" },
  { field_name: "sessionId", field_schema: "keyword" },
  { field_name: "hojaVidaId", field_schema: "keyword" },
  { field_name: "documentId", field_schema: "keyword" },
  { field_name: "pagina", field_schema: "integer" },
] as const;

export interface PlanChunk {
  id: string;
  texto: string;
  titulo: string;
  url: string;
  codigoExpediente: string;
  pagina: number;
}

let ready: Promise<void> | null = null;
let client: QdrantClient | null = null;

export function openQdrant(): QdrantClient {
  if (client) return client;
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";
  const parsed = new URL(url);
  const apiKey = process.env.QDRANT_API_KEY || undefined;
  client = new QdrantClient({
    url,
    apiKey,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
    checkCompatibility: false,
  });
  return client;
}

export async function ensureCollection(): Promise<void> {
  if (!ready) {
    ready = prepare().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

export async function planAlreadyIndexed(codigoExpediente: string): Promise<boolean> {
  await ensureCollection();
  const found = await openQdrant().scroll(EVIDENCE_COLLECTION, {
    filter: {
      must: [
        { key: "origen", match: { value: "plan" } },
        { key: "codigoExpediente", match: { value: codigoExpediente } },
      ],
    },
    limit: 1,
    with_payload: false,
    with_vector: false,
  });
  return found.points.length > 0;
}

export async function deleteDocumentPoints(documentId: string): Promise<void> {
  await ensureCollection();
  await openQdrant().delete(EVIDENCE_COLLECTION, {
    wait: true,
    filter: { must: [{ key: "documentId", match: { value: documentId } }] },
  });
}

export async function upsertDocumentChunks(
  chunks: Array<{ id: string; texto: string; titulo: string; pagina: number; hojaVidaId: string; documentId: string }>,
  vectors: number[][],
): Promise<void> {
  await ensureCollection();
  await openQdrant().upsert(EVIDENCE_COLLECTION, {
    wait: true,
    points: chunks.map((chunk, index) => ({
      id: pointId(chunk.id),
      vector: vectors[index] ?? [],
      payload: {
        fragmentoId: chunk.id,
        texto: chunk.texto,
        titulo: chunk.titulo,
        origen: "documento",
        pagina: chunk.pagina,
        hojaVidaId: chunk.hojaVidaId,
        documentId: chunk.documentId,
      },
    })),
  });
}

export async function upsertChunks(chunks: PlanChunk[], vectors: number[][]): Promise<void> {
  await ensureCollection();
  await openQdrant().upsert(EVIDENCE_COLLECTION, {
    wait: true,
    points: chunks.map((chunk, index) => ({
      id: pointId(chunk.id),
      vector: vectors[index] ?? [],
      payload: {
        fragmentoId: chunk.id,
        texto: chunk.texto,
        titulo: chunk.titulo,
        url: chunk.url,
        origen: "plan",
        codigoExpediente: chunk.codigoExpediente,
        pagina: chunk.pagina,
      },
    })),
  });
}

async function prepare(): Promise<void> {
  const client = openQdrant();
  const existing = await client.collectionExists(EVIDENCE_COLLECTION);
  if (!existing.exists) {
    await client.createCollection(EVIDENCE_COLLECTION, {
      vectors: { size: EMBEDDING_SIZE, distance: "Cosine" },
    });
  }
  for (const index of INDEXES) {
    await client
      .createPayloadIndex(EVIDENCE_COLLECTION, {
        wait: true,
        field_name: index.field_name,
        field_schema: index.field_schema,
      })
      .catch(() => undefined);
  }
}

function pointId(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
  const hash = createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
