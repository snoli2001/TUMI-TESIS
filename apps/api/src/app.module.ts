import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { CandidatesController } from "./candidates/candidates.controller";
import { DecisionsService } from "./decisions/decisions.service";
import { FactCheckController } from "./fact-check/fact-check.controller";
import { FactCheckService } from "./fact-check/fact-check.service";
import { HealthController } from "./health/health.controller";
import { HistoryController } from "./history/history.controller";
import { LlmService } from "./llm/llm.service";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";
import { RedisService } from "./redis/redis.service";
import { JneSearchService } from "./tools/jne-search.service";
import { VectorSearchService } from "./tools/vector-search.service";
import { WebSearchService } from "./tools/web-search.service";

@Module({
  controllers: [
    HealthController,
    FactCheckController,
    CandidatesController,
    HistoryController,
  ],
  providers: [
    RedisService,
    DecisionsService,
    LlmService,
    JneSearchService,
    VectorSearchService,
    WebSearchService,
    FactCheckService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
