import { Controller, Get } from "@nestjs/common";
import { getPrisma } from "@tumi/database";
import { RedisService } from "../redis/redis.service";
import { VectorSearchService } from "../../verificar-afirmacion/evidencia/vector-search.service";
import { VerificarAfirmacionHandler } from "../../verificar-afirmacion/verificar-afirmacion.handler";

@Controller("health")
export class HealthController {
  constructor(
    private readonly redis: RedisService,
    private readonly vectors: VectorSearchService,
    private readonly afirmacion: VerificarAfirmacionHandler,
  ) {}

  @Get()
  async check() {
    const [postgres, redis, qdrant] = await Promise.all([
      pingPostgres(),
      this.redis.healthy(),
      this.vectors.healthy(),
    ]);
    const checks = {
      postgres,
      redis,
      qdrant,
      checkpoint: this.afirmacion.checkpoint,
    };
    const ready = postgres && redis && qdrant;
    return { status: ready ? "ok" : "degraded", checks };
  }
}

async function pingPostgres(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
