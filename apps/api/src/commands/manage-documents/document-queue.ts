import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import Redis from "ioredis";

const QUEUE = "tumi-jobs";

@Injectable()
export class DocumentQueue implements OnModuleDestroy {
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  async enqueue(documentId: string): Promise<void> {
    const queue = await this.open();
    await queue.add(
      "indexar-documento",
      { documentId },
      {
        jobId: `indexar-documento-${documentId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private async open(): Promise<Queue> {
    if (this.queue) return this.queue;
    const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
    this.connection = connection;
    this.queue = new Queue(QUEUE, { connection });
    return this.queue;
  }
}
