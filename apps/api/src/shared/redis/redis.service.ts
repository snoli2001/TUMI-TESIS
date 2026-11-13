import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    this.redis.on("error", () => undefined);
  }

  async healthy(): Promise<boolean> {
    try {
      if (this.redis.status === "wait") await this.redis.connect();
      const reply = await this.redis.ping();
      return reply === "PONG";
    } catch {
      return false;
    }
  }

  async hit(key: string, windowSeconds: number): Promise<number | null> {
    try {
      if (this.redis.status === "wait") await this.redis.connect();
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds);
      return count;
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
