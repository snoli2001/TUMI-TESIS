import { Controller, Get, Query } from "@nestjs/common";
import type { CandidateSummary } from "@tumi/contracts";
import { BuscarCandidatosHandler } from "./buscar-candidatos.handler";

@Controller("candidates")
export class BuscarCandidatosController {
  constructor(private readonly buscar: BuscarCandidatosHandler) {}

  @Get()
  list(@Query("q") q?: string): Promise<CandidateSummary[]> {
    return this.buscar.execute(q);
  }
}
