import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getPrisma, seedIfEmpty, upsertDemoCorpus } from "@tumi/database";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import OpenAI from "openai";

const QUEUE = "tumi-jobs";
const COLLECTION = "tumi_evidence";
const EMBEDDING_SIZE = 3072;

@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connections: Redis[] = [];

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    const queueConnection = new Redis(url, { maxRetriesPerRequest: null });
    const workerConnection = new Redis(url, { maxRetriesPerRequest: null });
    this.connections = [queueConnection, workerConnection];
    this.queue = new Queue(QUEUE, { connection: queueConnection });
    this.worker = new Worker(QUEUE, (job) => this.handle(job.name), {
      connection: workerConnection,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name} falló: ${error.message}`);
    });
    await this.queue.add("seed-if-empty", {}, { removeOnComplete: 20, removeOnFail: 20 });
    await this.queue.add(
      "ingest",
      {},
      { repeat: { pattern: "0 3 * * *" }, removeOnComplete: 20, removeOnFail: 20 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }

  private async handle(name: string): Promise<void> {
    if (name === "ingest") {
      await upsertDemoCorpus();
      await this.resetCollection();
    } else {
      await seedIfEmpty();
    }
    await this.embedPending();
  }

  private async resetCollection(): Promise<void> {
    try {
      const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? "http://localhost:6333" });
      const collections = await qdrant.getCollections();
      if (collections.collections.some((collection) => collection.name === COLLECTION)) {
        await qdrant.deleteCollection(COLLECTION);
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo reiniciar Qdrant: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async embedPending(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      this.logger.log("Sin OPENAI_API_KEY: los fragmentos quedan solo en Postgres.");
      return;
    }
    const prisma = getPrisma();
    const pending = await prisma.fragmento.findMany({
      where: { qdrantPointId: null },
      include: { documento: true },
      take: 32,
    });
    if (pending.length === 0) return;

    const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? "http://localhost:6333" });
    const collections = await qdrant.getCollections();
    if (!collections.collections.some((collection) => collection.name === COLLECTION)) {
      await qdrant.createCollection(COLLECTION, {
        vectors: { size: EMBEDDING_SIZE, distance: "Cosine" },
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embedded = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
      input: pending.map((row) => row.texto),
    });

    const points = pending.map((row, index) => {
      const id = randomUUID();
      return {
        id,
        fragmentoId: row.id,
        vector: embedded.data[index]?.embedding ?? [],
        payload: {
          fragmentoId: row.id,
          documentoId: row.documentoId,
          candidatoId: row.documento.candidatoId,
          titulo: row.documento.titulo,
          texto: row.texto,
        },
      };
    });

    await qdrant.upsert(COLLECTION, {
      wait: true,
      points: points.map(({ id, vector, payload }) => ({ id, vector, payload })),
    });

    for (const point of points) {
      await prisma.fragmento.update({
        where: { id: point.fragmentoId },
        data: { qdrantPointId: point.id },
      });
    }
    this.logger.log(`Embeddings cargados: ${points.length}`);
  }
}
