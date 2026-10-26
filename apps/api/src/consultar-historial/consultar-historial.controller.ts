import { Controller, Get, Query } from "@nestjs/common";
import type { HistoryItem } from "@tumi/contracts";
import { ConsultarHistorialHandler } from "./consultar-historial.handler";

@Controller(["history", "consultar-historial"])
export class ConsultarHistorialController {
  constructor(private readonly historial: ConsultarHistorialHandler) {}

  @Get()
  list(@Query("sessionId") sessionId?: string): Promise<HistoryItem[]> {
    return this.historial.execute(sessionId);
  }
}
