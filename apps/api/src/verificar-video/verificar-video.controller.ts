import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { verificarVideoRequestSchema } from "@tumi/contracts";
import { VerificarVideoHandler } from "./verificar-video.handler";

@Controller("verificar-video")
export class VerificarVideoController {
  constructor(private readonly video: VerificarVideoHandler) {}

  @Post("stream")
  async stream(@Body() body: unknown, @Res() response: Response): Promise<void> {
    const parsed = verificarVideoRequestSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Transcripción inválida",
      });
      return;
    }

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const send = (event: string, data: unknown) => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.video.execute(parsed.data, {
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
