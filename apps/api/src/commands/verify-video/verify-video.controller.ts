import { Body, Controller, Headers, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { verificarVideoRequestSchema } from "@tumi/contracts";
import { sendHttpError } from "../../shared/http-error";
import { openSession } from "../../shared/session/session-access";
import { VerifyVideoHandler } from "./verify-video.handler";

@Controller("verificar-video")
export class VerifyVideoController {
  constructor(private readonly video: VerifyVideoHandler) {}

  @Post("stream")
  async stream(
    @Body() body: unknown,
    @Headers("x-session-key") accessKey: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = verificarVideoRequestSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Transcripción inválida",
      });
      return;
    }
    let sessionId: string;
    try {
      sessionId = await openSession(parsed.data.sessionId, accessKey);
    } catch (error) {
      if (sendHttpError(response, error)) return;
      throw error;
    }

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const send = (event: string, data: unknown) => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.video.execute({ ...parsed.data, sessionId }, {
        onNode: (node, status) => send("node", { node, status }),
        onDecision: (payload) => send("decision", payload),
        onToken: (text) => send("token", { text }),
      });
      send("result", result);
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : "No se pudo verificar el video",
      });
    } finally {
      response.end();
    }
  }
}
