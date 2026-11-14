import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { VerifyClaimController } from "./commands/verify-claim/verify-claim.controller";
import { VerifyClaimHandler } from "./commands/verify-claim/verify-claim.handler";
import { DecisionsService } from "./commands/verify-claim/decisions/decisions.service";
import { JneSearchService } from "./commands/verify-claim/evidence/jne-search.service";
import { VectorSearchService } from "./commands/verify-claim/evidence/vector-search.service";
import { WebSearchService } from "./commands/verify-claim/evidence/web-search.service";
import { LlmService } from "./commands/verify-claim/drafting/llm.service";
import { VerifyVideoController } from "./commands/verify-video/verify-video.controller";
import { VerifyVideoHandler } from "./commands/verify-video/verify-video.handler";
import { ColaVideo } from "./commands/verify-video/video-queue";
import { SearchCandidatesController } from "./queries/search-candidates/search-candidates.controller";
import { SearchCandidatesHandler } from "./queries/search-candidates/search-candidates.handler";
import { GeoController } from "./queries/geo/geo.controller";
import { ViewCandidateController } from "./queries/view-candidate/view-candidate.controller";
import { ViewCandidateHandler } from "./queries/view-candidate/view-candidate.handler";
import { ConsultHistoryController } from "./queries/consult-history/consult-history.controller";
import { ConsultHistoryHandler } from "./queries/consult-history/consult-history.handler";
import { GestorDocumentsController } from "./commands/manage-documents/gestor-documents.controller";
import { GestorAuthController } from "./commands/manage-documents/gestor-auth.controller";
import { UploadDocumentHandler } from "./commands/manage-documents/upload-document.handler";
import { DeleteDocumentHandler } from "./commands/manage-documents/delete-document.handler";
import { ApplyRetentionHandler } from "./commands/manage-documents/apply-retention.handler";
import { DocumentQueue } from "./commands/manage-documents/document-queue";
import { AuthGuard } from "./shared/auth/auth.guard";
import { GestorAccounts } from "./shared/auth/gestor-accounts";
import { GestorGuard } from "./shared/auth/gestor.guard";
import { RateLimitGuard } from "./shared/rate-limit/rate-limit.guard";
import { RedisService } from "./shared/redis/redis.service";
import { HealthController } from "./shared/health/health.controller";

@Module({
  controllers: [
    HealthController,
    VerifyClaimController,
    VerifyVideoController,
    SearchCandidatesController,
    GeoController,
    ViewCandidateController,
    ConsultHistoryController,
    GestorAuthController,
    GestorDocumentsController,
  ],
  providers: [
    RedisService,
    DecisionsService,
    LlmService,
    JneSearchService,
    VectorSearchService,
    WebSearchService,
    VerifyClaimHandler,
    ColaVideo,
    VerifyVideoHandler,
    SearchCandidatesHandler,
    ViewCandidateHandler,
    ConsultHistoryHandler,
    DocumentQueue,
    UploadDocumentHandler,
    DeleteDocumentHandler,
    ApplyRetentionHandler,
    GestorAccounts,
    GestorGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
