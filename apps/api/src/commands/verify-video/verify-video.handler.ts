import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  idDeYoutube,
  mensajeNoVerificable,
  type AfirmacionDeVideo,
  type VerificarVideoRequest,
  type VerificarVideoResult,
  type VideoSegmento,
} from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import type { StreamHooks } from "../verify-claim/graph/state";
import { VerifyClaimHandler } from "../verify-claim/verify-claim.handler";
import { agrupar, aLineas } from "./group";
import { ColaVideo } from "./video-queue";
import { segmentar } from "./segment";

@Injectable()
export class VerifyVideoHandler {
  constructor(
    private readonly afirmacion: VerifyClaimHandler,
    private readonly cola: ColaVideo,
  ) {}

  async execute(request: VerificarVideoRequest, hooks: StreamHooks): Promise<VerificarVideoResult> {
    let videoId: string | null = request.url ? idDeYoutube(request.url) : null;
    let titulo: string | null = null;
    let transcripcion = request.transcripcion?.trim() ?? "";

    if (request.url?.trim()) {
      hooks.onNode("transcripcion", "start");
      try {
        const spoken = await this.cola.transcribir(request.url);
        videoId = spoken.videoId;
        titulo = spoken.titulo;
        transcripcion = aLineas(agrupar(spoken.segmentos));
      } catch (error) {
        const mensaje = mensajeNoVerificable(error);
        hooks.onNode("transcripcion", "done");
        if (mensaje) return this.degradado(request.sessionId, request.url, mensaje, videoId);
        throw new Error("No se pudo transcribir el video. Inténtalo de nuevo.");
      }
      hooks.onNode("transcripcion", "done");
    }

    if (transcripcion.length < 3) {
      return this.degradado(
        request.sessionId,
        request.url ?? transcripcion,
        "No se pudo extraer voz de este video.",
        videoId,
      );
    }

    const segmentos = segmentar(transcripcion);
    const afirmaciones: AfirmacionDeVideo[] = [];
    let sessionId = request.sessionId;

    for (const [index, segmento] of segmentos.entries()) {
      hooks.onNode(`afirmacion ${index + 1}`, "start");
      const result = await this.afirmacion.execute({ query: segmento.texto, sessionId }, hooks);
      sessionId = result.sessionId;
      await anclarTurno(result.id, segmento);
      afirmaciones.push({
        ...result,
        inicioSeg: segmento.inicioSeg,
        finSeg: segmento.finSeg,
      });
      hooks.onNode(`afirmacion ${index + 1}`, "done");
    }

    return { sessionId: sessionId ?? "", videoId, titulo, afirmaciones };
  }

  private async degradado(
    sessionId: string | undefined,
    consulta: string,
    mensaje: string,
    videoId: string | null,
  ): Promise<VerificarVideoResult> {
    const id = normalizeSessionId(sessionId);
    const prisma = getPrisma();
    await prisma.factSession.upsert({
      where: { id },
      create: { id },
      update: {},
    });
    const turn = await prisma.factTurn.create({
      data: {
        sessionId: id,
        role: "assistant",
        content: mensaje,
        verdict: "no_verificable",
        sources: { query: consulta, conclusion: mensaje, degraded: true, videoId },
        choices: [],
      },
    });
    return {
      sessionId: id,
      videoId,
      titulo: null,
      afirmaciones: [
        {
          id: turn.id.toString(),
          sessionId: id,
          query: consulta,
          conclusion: mensaje,
          degraded: true,
          verdicts: [
            {
              claim: consulta,
              verdict: "no_verificable",
              confidence: null,
              degraded: true,
              explanation: mensaje,
              decisions: [],
              sources: [],
            },
          ],
          sources: [],
          entities: [],
          inicioSeg: null,
          finSeg: null,
        },
      ],
    };
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

function normalizeSessionId(value: string | undefined): string {
  if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
