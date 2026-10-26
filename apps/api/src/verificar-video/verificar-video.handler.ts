import { Injectable } from "@nestjs/common";
import type { VerificarVideoRequest, VerificarVideoResult, VideoSegmento } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import type { StreamHooks } from "../verificar-afirmacion/grafo/state";
import { VerificarAfirmacionHandler } from "../verificar-afirmacion/verificar-afirmacion.handler";
import { segmentar } from "./segmentar";

@Injectable()
export class VerificarVideoHandler {
  constructor(private readonly afirmacion: VerificarAfirmacionHandler) {}

  async execute(request: VerificarVideoRequest, hooks: StreamHooks): Promise<VerificarVideoResult> {
    const segmentos = segmentar(request.transcripcion);
    const afirmaciones: VerificarVideoResult["afirmaciones"] = [];
    let sessionId = request.sessionId;

    for (const [index, segmento] of segmentos.entries()) {
      hooks.onNode(`afirmacion ${index + 1}`, "start");
      const result = await this.afirmacion.execute(
        { query: segmento.texto, sessionId },
        hooks,
      );
      sessionId = result.sessionId;
      await anclarTurno(result.id, segmento);
      afirmaciones.push({
        ...result,
        inicioSeg: segmento.inicioSeg,
        finSeg: segmento.finSeg,
      });
      hooks.onNode(`afirmacion ${index + 1}`, "done");
    }

    return { sessionId: sessionId ?? "", afirmaciones };
  }
}

async function anclarTurno(turnId: string, segmento: VideoSegmento): Promise<void> {
  const id = BigInt(turnId);
  const row = await getPrisma().factTurn.findUnique({ where: { id } });
  if (!row || !isRecord(row.sources)) return;
  await getPrisma().factTurn.update({
    where: { id },
    data: {
      sources: JSON.parse(
        JSON.stringify({
          ...row.sources,
          inicioSeg: segmento.inicioSeg,
          finSeg: segmento.finSeg,
        }),
      ),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
