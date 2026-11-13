import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { TranscripcionYoutube } from "@tumi/contracts";
import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";

const QUEUE = "tumi-jobs";

@Injectable()
export class ColaVideo implements OnModuleDestroy {
  private queue: Queue | null = null;
  private events: QueueEvents | null = null;
  private connections: Redis[] = [];

  async transcribir(url: string): Promise<TranscripcionYoutube> {
    const queue = await this.open();
    const job = await queue.add(
      "transcribir-youtube",
      { url },
      { removeOnComplete: { age: 3600, count: 20 }, removeOnFail: { age: 3600, count: 20 } },
    );
    return job.waitUntilFinished(this.events!, 240_000);
  }

  async onModuleDestroy(): Promise<void> {
    await this.events?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }

  private async open(): Promise<Queue> {
    if (this.queue && this.events) return this.queue;
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    const connection = new Redis(url, { maxRetriesPerRequest: null });
    const eventsConnection = new Redis(url, { maxRetriesPerRequest: null });
    this.connections = [connection, eventsConnection];
    this.queue = new Queue(QUEUE, { connection });
    this.events = new QueueEvents(QUEUE, { connection: eventsConnection });
    await this.events.waitUntilReady();
    return this.queue;
  }
}
