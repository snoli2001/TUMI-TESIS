import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import type { CandidateProfile, CandidateSummary } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";

@Controller("candidates")
export class CandidatesController {
  @Get()
  async list(): Promise<CandidateSummary[]> {
    const rows = await getPrisma().candidato.findMany({
      include: { partido: true },
      orderBy: { nombre: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      cargo: row.cargo,
      partido: row.partido.nombre,
      sigla: row.partido.sigla,
      biografia: row.biografia,
      demostracion: row.demostracion,
    }));
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<CandidateProfile> {
    const row = await getPrisma().candidato.findUnique({
      where: { id },
      include: { partido: true, planes: true, documentos: true },
    });
    if (!row) throw new NotFoundException("Candidato no encontrado");
    return {
      id: row.id,
      nombre: row.nombre,
      cargo: row.cargo,
      partido: row.partido.nombre,
      sigla: row.partido.sigla,
      biografia: row.biografia,
      demostracion: row.demostracion,
      planes: row.planes.map((plan) => ({
        id: plan.id,
        titulo: plan.titulo,
        resumen: plan.resumen,
      })),
      documentos: row.documentos.map((documento) => ({
        id: documento.id,
        titulo: documento.titulo,
        url: documento.url,
        origen: documento.origen,
      })),
    };
  }
}
