import { Controller, Get, Query } from "@nestjs/common";
import type { HistoryItem } from "@tumi/contracts";
import { ConsultHistoryHandler } from "./consult-history.handler";

@Controller(["history", "consultar-historial"])
export class ConsultHistoryController {
  constructor(private readonly historial: ConsultHistoryHandler) {}

  @Get()
  list(@Query("sessionId") sessionId?: string): Promise<HistoryItem[]> {
    return this.historial.execute(sessionId);
  }
}
