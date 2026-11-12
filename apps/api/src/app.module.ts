import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { BuscarCandidatosController } from "./buscar-candidatos/buscar-candidatos.controller";
import { BuscarCandidatosHandler } from "./buscar-candidatos/buscar-candidatos.handler";
import { GeoController } from "./geo/geo.controller";
import { AuthGuard } from "./compartido/auth/auth.guard";
import { RateLimitGuard } from "./compartido/rate-limit/rate-limit.guard";
import { RedisService } from "./compartido/redis/redis.service";
import { HealthController } from "./compartido/salud/health.controller";
import { ConsultarHistorialController } from "./consultar-historial/consultar-historial.controller";
import { ConsultarHistorialHandler } from "./consultar-historial/consultar-historial.handler";
import { VerCandidatoController } from "./ver-candidato/ver-candidato.controller";
import { VerCandidatoHandler } from "./ver-candidato/ver-candidato.handler";
import { DecisionsService } from "./verificar-afirmacion/decisiones/decisions.service";
import { JneSearchService } from "./verificar-afirmacion/evidencia/jne-search.service";
import { VectorSearchService } from "./verificar-afirmacion/evidencia/vector-search.service";
import { WebSearchService } from "./verificar-afirmacion/evidencia/web-search.service";
import { LlmService } from "./verificar-afirmacion/redaccion/llm.service";
import { VerificarAfirmacionController } from "./verificar-afirmacion/verificar-afirmacion.controller";
import { VerificarAfirmacionHandler } from "./verificar-afirmacion/verificar-afirmacion.handler";
import { VerificarVideoController } from "./verificar-video/verificar-video.controller";
import { VerificarVideoHandler } from "./verificar-video/verificar-video.handler";
import { ColaVideo } from "./verificar-video/cola-video";

@Module({
  controllers: [
    HealthController,
    VerificarAfirmacionController,
    VerificarVideoController,
    BuscarCandidatosController,
    GeoController,
    VerCandidatoController,
    ConsultarHistorialController,
  ],
  providers: [
    RedisService,
    DecisionsService,
    LlmService,
    JneSearchService,
    VectorSearchService,
    WebSearchService,
    VerificarAfirmacionHandler,
    ColaVideo,
    VerificarVideoHandler,
    BuscarCandidatosHandler,
    VerCandidatoHandler,
    ConsultarHistorialHandler,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
