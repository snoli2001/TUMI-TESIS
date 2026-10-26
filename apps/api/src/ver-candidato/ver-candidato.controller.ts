import { Controller, Get, Param } from "@nestjs/common";
import type { CandidateProfile } from "@tumi/contracts";
import { VerCandidatoHandler } from "./ver-candidato.handler";

@Controller("candidates")
export class VerCandidatoController {
  constructor(private readonly ver: VerCandidatoHandler) {}

  @Get(":id")
  detail(@Param("id") id: string): Promise<CandidateProfile> {
    return this.ver.execute(id);
  }
}
