import { Controller, Get, Query } from "@nestjs/common";
import type { CandidateSearchFilters, CandidateSearchResult } from "@tumi/contracts";
import { SearchCandidatesHandler } from "./search-candidates.handler";

@Controller("candidates")
export class SearchCandidatesController {
  constructor(private readonly buscar: SearchCandidatesHandler) {}

  @Get()
  list(
    @Query("q") q?: string,
    @Query("departamento") departamento?: string,
    @Query("provincia") provincia?: string,
    @Query("distrito") distrito?: string,
    @Query("organizacion") organizacion?: string,
    @Query("sexo") sexo?: string,
    @Query("orden") orden?: string,
    @Query("experienciaElectoral") experienciaElectoral?: string,
    @Query("sinSentencias") sinSentencias?: string,
    @Query("primaria") primaria?: string,
    @Query("secundaria") secundaria?: string,
    @Query("superiores") superiores?: string,
    @Query("trabajo") trabajo?: string,
  ): Promise<CandidateSearchResult> {
    const filters: CandidateSearchFilters = {
      departamento,
      provincia,
      distrito,
      organizacion,
      sexo,
      orden: orden === "organizacion" ? "organizacion" : "nombre",
      experienciaElectoral: flag(experienciaElectoral),
      sinSentencias: flag(sinSentencias),
      primaria: flag(primaria),
      secundaria: flag(secundaria),
      superiores: flag(superiores),
      trabajo: flag(trabajo),
    };
    return this.buscar.execute(q, filters);
  }
}

function flag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}
