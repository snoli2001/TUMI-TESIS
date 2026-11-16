import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getPrisma, mediaUrl } from "@tumi/database";
import OpenAI from "openai";
import { tokens } from "../../../shared/text";
import type { EvidenceItem } from "../graph/state";
import {
  PAYLOAD_INDEXES,
  chunkPayload,
  evidenceFilter,
  type EvidenceChunk,
  type EvidenceScope,
} from "./qdrant-metadata";

export const EVIDENCE_COLLECTION = "tumi_evidence";
export const EMBEDDING_SIZE = 3072;

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private ready: Promise<void> | null = null;

  client(): QdrantClient {
    return openQdrant();
  }

  private async readyDocumentOwners(hojaVidaIds: string[]): Promise<string[]> {
    const ids = [...new Set(hojaVidaIds.filter((id) => id.length > 0))];
    if (ids.length === 0) return [];
    const rows = await getPrisma().candidateDocument.findMany({
      where: { hojaVidaId: { in: ids }, status: "ready", deletedAt: null },
      select: { hojaVidaId: true },
      distinct: ["hojaVidaId"],
    });
    return rows.map((row) => row.hojaVidaId);
  }

  async expedientesDe(hojaVidaIds: string[]): Promise<string[]> {
    const ids = [...new Set(hojaVidaIds.filter((id) => id.length > 0))];
    if (ids.length === 0) return [];
    const rows = await getPrisma().candidate.findMany({
      where: { hojaVidaId: { in: ids } },
      select: { list: { select: { codigoExpediente: true } } },
    });
    return [...new Set(rows.map((row) => row.list.codigoExpediente))];
  }

  async index(chunks: EvidenceChunk[]): Promise<number> {
    const usable = chunks.filter((chunk) => chunk.texto.trim().length > 0);
    if (usable.length === 0) return 0;
    if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY para indexar evidencia");
    await this.ensureCollection();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embedded = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
      input: usable.map((chunk) => chunk.texto),
    });
    await this.client().upsert(EVIDENCE_COLLECTION, {
      wait: true,
      points: usable.map((chunk, index) => ({
        id: pointId(chunk.id),
        vector: embedded.data[index]?.embedding ?? [],
        payload: chunkPayload(chunk),
      })),
    });
    return usable.length;
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.ensureCollection();
    await this.client().delete(EVIDENCE_COLLECTION, {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    });
  }

  async search(query: string, scope: EvidenceScope): Promise<EvidenceItem[]> {
    const hojaVidaIds = await this.readyDocumentOwners(scope.hojaVidaIds ?? []);
    const narrowed = { ...scope, hojaVidaIds };
    const lexical =
      scope.incluirPlan === false ? [] : await this.searchPostgres(query, narrowed.codigoExpedientes);
    const semantic = await this.searchQdrant(query, narrowed);
    const merged = new Map<string, EvidenceItem>();
    for (const item of [...semantic, ...lexical]) merged.set(item.id, item);
    return this.conEnlace([...merged.values()].slice(0, 12));
  }

  private async conEnlace(items: EvidenceItem[]): Promise<EvidenceItem[]> {
    const codigos = [...new Set(items.flatMap((item) => (item.codigoExpediente ? [item.codigoExpediente] : [])))];
    if (codigos.length === 0) return items;
    const plans = await getPrisma().plan.findMany({
      where: { codigoExpediente: { in: codigos } },
      select: { codigoExpediente: true, summaryPdfR2Key: true, summaryPdfSourceUrl: true },
    });
    const bases = new Map(
      plans.map((plan) => [plan.codigoExpediente, mediaUrl(plan.summaryPdfR2Key) ?? plan.summaryPdfSourceUrl]),
    );
    return items.map((item) => {
      const base = item.codigoExpediente ? bases.get(item.codigoExpediente) ?? item.url : item.url;
      return { ...item, url: conPagina(base, item.pagina) };
    });
  }

  async healthy(): Promise<boolean> {
    try {
      const apiKey = process.env.QDRANT_API_KEY;
      await fetch(`${process.env.QDRANT_URL ?? "http://localhost:6333"}/readyz`, {
        headers: apiKey ? { "api-key": apiKey } : {},
        signal: AbortSignal.timeout(2000),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureCollection(): Promise<void> {
    if (!this.ready) {
      this.ready = this.prepareCollection().catch((error: unknown) => {
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
  }

  private async prepareCollection(): Promise<void> {
    const client = this.client();
    const existing = await client.collectionExists(EVIDENCE_COLLECTION);
    if (!existing.exists) {
      await client.createCollection(EVIDENCE_COLLECTION, {
        vectors: { size: EMBEDDING_SIZE, distance: "Cosine" },
      });
    }
    for (const index of PAYLOAD_INDEXES) {
      await client
        .createPayloadIndex(EVIDENCE_COLLECTION, {
          wait: true,
          field_name: index.field_name,
          field_schema: index.field_schema,
        })
        .catch(() => undefined);
    }
  }

  private async searchPostgres(query: string, codigoExpedientes: string[]): Promise<EvidenceItem[]> {
    const words = tokens(query).slice(0, 8);
    if (words.length === 0) return [];
    const prisma = getPrisma();
    const proposals = await prisma.planProposal.findMany({
      where: {
        ...(codigoExpedientes.length > 0
          ? { dimension: { codigoExpediente: { in: codigoExpedientes } } }
          : {}),
        OR: words.flatMap((word) => [
          { problema: { contains: word, mode: "insensitive" } },
          { objetivo: { contains: word, mode: "insensitive" } },
          { meta: { contains: word, mode: "insensitive" } },
        ]),
      },
      include: { dimension: true },
      take: 8,
    });
    return proposals.flatMap((proposal) => {
      const snippet = [proposal.problema, proposal.objetivo, proposal.meta].filter(Boolean).join(" ");
      if (!snippet) return [];
      return [
        {
          id: proposal.id.toString(),
          title: proposal.dimension.name,
          url: null,
          snippet,
          origin: "jne" as const,
          role: "prueba" as const,
          stance: null,
          pagina: null,
          codigoExpediente: proposal.dimension.codigoExpediente,
        },
      ];
    });
  }

  private async searchQdrant(query: string, scope: EvidenceScope): Promise<EvidenceItem[]> {
    const filter = evidenceFilter(scope);
    if (!filter || !process.env.OPENAI_API_KEY) return [];
    try {
      await this.ensureCollection();
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embedded = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
        input: query,
      });
      const vector = embedded.data[0]?.embedding;
      if (!vector) return [];
      const results = await this.client().query(EVIDENCE_COLLECTION, {
        query: vector,
        filter,
        limit: 6,
        with_payload: true,
      });
      return results.points.flatMap((point) => toEvidence(point.payload ?? {}, String(point.id)));
    } catch (error) {
      this.logger.warn(`Qdrant no disponible: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}

function toEvidence(payload: Record<string, unknown>, fallbackId: string): EvidenceItem[] {
  const snippet = typeof payload.texto === "string" ? payload.texto : "";
  if (!snippet) return [];
  const pagina = typeof payload.pagina === "number" ? payload.pagina : null;
  const titulo = typeof payload.titulo === "string" ? payload.titulo : "Fragmento";
  return [
    {
      id: typeof payload.fragmentoId === "string" ? payload.fragmentoId : fallbackId,
      title: pagina === null ? titulo : `${titulo}, p. ${pagina}`,
      url: typeof payload.url === "string" ? payload.url : null,
      snippet,
      origin: "qdrant",
      role: "prueba",
      stance: null,
      pagina,
      codigoExpediente: typeof payload.codigoExpediente === "string" ? payload.codigoExpediente : null,
    },
  ];
}

function conPagina(url: string | null | undefined, pagina: number | null): string | null {
  if (!url) return null;
  const limpia = url.split("#")[0];
  return pagina ? `${limpia}#page=${pagina}` : limpia;
}

export function openQdrant(): QdrantClient {
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";
  const parsed = new URL(url);
  const apiKey = process.env.QDRANT_API_KEY || undefined;
  return new QdrantClient({
    url,
    apiKey,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
    checkCompatibility: false,
  });
}

function pointId(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  const hash = createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
