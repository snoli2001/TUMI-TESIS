import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getPrisma } from "@tumi/database";
import OpenAI from "openai";
import type { EvidenceItem } from "../agents/state";
import { tokens } from "../text";

export const EVIDENCE_COLLECTION = "tumi_evidence";
export const EMBEDDING_SIZE = 3072;

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  client(): QdrantClient {
    return new QdrantClient({ url: process.env.QDRANT_URL ?? "http://localhost:6333" });
  }

  async search(query: string): Promise<EvidenceItem[]> {
    const lexical = await this.searchPostgres(query);
    const semantic = await this.searchQdrant(query);
    const merged = new Map<string, EvidenceItem>();
    for (const item of [...semantic, ...lexical]) merged.set(item.id, item);
    return [...merged.values()].slice(0, 12);
  }

  async healthy(): Promise<boolean> {
    try {
      await fetch(`${process.env.QDRANT_URL ?? "http://localhost:6333"}/readyz`, {
        signal: AbortSignal.timeout(2000),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async searchPostgres(query: string): Promise<EvidenceItem[]> {
    const words = tokens(query).slice(0, 8);
    if (words.length === 0) return [];
    const prisma = getPrisma();
    const proposals = await prisma.planProposal.findMany({
      where: {
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
        },
      ];
    });
  }

  private async searchQdrant(query: string): Promise<EvidenceItem[]> {
    if (!process.env.OPENAI_API_KEY) return [];
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embedded = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
        input: query,
      });
      const vector = embedded.data[0]?.embedding;
      if (!vector) return [];
      const results = await this.client().query(EVIDENCE_COLLECTION, {
        query: vector,
        limit: 6,
        with_payload: true,
      });
      return results.points.flatMap((point) => {
        const payload = point.payload ?? {};
        const id = String(payload.fragmentoId ?? point.id);
        const snippet = typeof payload.texto === "string" ? payload.texto : "";
        if (!snippet) return [];
        return [
          {
            id,
            title: typeof payload.titulo === "string" ? payload.titulo : "Fragmento",
            url: null,
            snippet,
            origin: "qdrant" as const,
            candidatoId: typeof payload.candidatoId === "string" ? payload.candidatoId : null,
          },
        ];
      });
    } catch (error) {
      this.logger.warn(`Qdrant no disponible: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}
