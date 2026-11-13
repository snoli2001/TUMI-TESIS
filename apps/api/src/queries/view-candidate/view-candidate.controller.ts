import { Controller, Get, Param } from "@nestjs/common";
import type { CandidateProfile } from "@tumi/contracts";
import { ViewCandidateHandler } from "./view-candidate.handler";

@Controller("candidates")
export class ViewCandidateController {
  constructor(private readonly ver: ViewCandidateHandler) {}

  @Get(":id")
  detail(@Param("id") id: string): Promise<CandidateProfile> {
    return this.ver.execute(id);
  }
}
