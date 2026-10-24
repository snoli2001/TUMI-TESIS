import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const QUEUE = "tumi-jobs";

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
    this.logger.log("El padrón se lee de la base goberlab. Este worker no carga candidatos.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }

  private async handle(name: string): Promise<void> {
    this.logger.log(`Job ${name} omitido: el catálogo vive en el esquema tumi de QAS.`);
  }
}
