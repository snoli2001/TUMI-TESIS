import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { factCheckRequestSchema } from "@tumi/contracts";
import { VerifyClaimHandler } from "./verify-claim.handler";

@Controller(["fact-check", "verificar-afirmacion"])
export class VerifyClaimController {
  constructor(private readonly afirmacion: VerifyClaimHandler) {}

  @Post("stream")
  async stream(@Body() body: unknown, @Res() response: Response): Promise<void> {
    const parsed = factCheckRequestSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Consulta inválida",
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
      const result = await this.afirmacion.execute(parsed.data, {
        onNode: (node, status) => send("node", { node, status }),
        onDecision: (payload) => send("decision", payload),
        onToken: (text) => send("token", { text }),
      });
      send("result", result);
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : "No se pudo verificar la consulta",
      });
    } finally {
      response.end();
    }
  }
}
