import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { sweepRetention } from "@tumi/database";
import { indexUploadedDocument } from "./index-document";
import { indexNextBatch } from "./plan-index";
import { deleteDocumentPoints } from "./qdrant-store";
import { transcribirYoutube } from "./transcribir-youtube";

const QUEUE = "tumi-jobs";

@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connections: Redis[] = [];
  private retentionTimer: ReturnType<typeof setInterval> | null = null;

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    const queueConnection = new Redis(url, { maxRetriesPerRequest: null });
    const workerConnection = new Redis(url, { maxRetriesPerRequest: null });
    this.connections = [queueConnection, workerConnection];
    this.queue = new Queue(QUEUE, { connection: queueConnection });
    this.worker = new Worker(QUEUE, (job) => this.handle(job.name, job.data), {
      connection: workerConnection,
      concurrency: 1,
      lockDuration: 300_000,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name} falló: ${error.message}`);
    });
    await this.queue.add(
      "indexar-planes",
      {},
      { jobId: "indexar-planes", removeOnComplete: true, removeOnFail: 20 },
    );
    void this.retain();
    this.retentionTimer = setInterval(() => void this.retain(), 60 * 60 * 1000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.worker?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }

  private async handle(name: string, data: unknown): Promise<unknown> {
    if (name === "transcribir-youtube") {
      const url = isRecord(data) && typeof data.url === "string" ? data.url : "";
      return transcribirYoutube(url);
    }
    if (name === "indexar-documento") {
      const documentId = isRecord(data) && typeof data.documentId === "string" ? data.documentId : "";
      if (documentId) await indexUploadedDocument(documentId);
      return undefined;
    }
    if (name !== "indexar-planes") return undefined;
    const after = isRecord(data) && typeof data.after === "string" ? data.after : undefined;
    const batch = await indexNextBatch(after);
    this.logger.log(
      `Planes indexados ${batch.indexed}, omitidos ${batch.skipped}, fallidos ${batch.failed}, fragmentos ${batch.chunks}`,
    );
    if (batch.next) {
      await this.queue?.add(
        "indexar-planes",
        { after: batch.next },
        { removeOnComplete: true, removeOnFail: 20 },
      );
    }
  }

  private async retain(): Promise<void> {
    try {
      const result = await sweepRetention(deleteDocumentPoints);
      this.logger.log(`Retención: ${result.sessions} sesiones, ${result.documents} documentos`);
    } catch (error) {
      this.logger.error(`Retención falló: ${error instanceof Error ? error.message : error}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
