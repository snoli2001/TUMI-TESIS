import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import type { CandidateProfile, CandidateSummary } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { tokens } from "../text";

@Controller("candidates")
export class CandidatesController {
  @Get()
  async list(@Query("q") q?: string): Promise<CandidateSummary[]> {
    const words = tokens(q ?? "").slice(0, 4);
    if (words.length === 0) return [];
    const rows = await getPrisma().candidate.findMany({
      where: { AND: words.map((word) => ({ OR: nameFilters(word) })) },
      include: { list: { include: { organization: true } } },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.hojaVidaId,
      nombre: fullName(row),
      cargo: row.cargoEleccion,
      partido: row.list.organization.name,
      sigla: null,
      biografia: "",
      demostracion: false,
    }));
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<CandidateProfile> {
    const row = await getPrisma().candidate.findUnique({
      where: { hojaVidaId: id },
      include: {
        list: { include: { organization: true, plan: { include: { dimensions: { include: { proposals: true } } } } } },
        resume: { include: { work: true, education: true } },
      },
    });
    if (!row) throw new NotFoundException("Candidato no encontrado");
    const plan = row.list.plan;
    return {
      id: row.hojaVidaId,
      nombre: fullName(row),
      cargo: row.cargoEleccion,
      partido: row.list.organization.name,
      sigla: null,
      biografia: biography(row.resume),
      demostracion: false,
      planes: (plan?.dimensions ?? []).slice(0, 8).map((dimension) => ({
        id: dimension.id.toString(),
        titulo: dimension.name,
        resumen: dimension.proposals
          .slice(0, 4)
          .map((proposal) => [proposal.problema, proposal.objetivo, proposal.meta].filter(Boolean).join(" "))
          .filter((text) => text.length > 0)
          .join(" "),
      })),
      documentos: [
        ...(plan?.fullPdfSourceUrl
          ? [{ id: `${plan.codigoExpediente}-full`, titulo: "Plan de gobierno", url: plan.fullPdfSourceUrl, origen: "jne" }]
          : []),
        ...(plan?.summaryPdfSourceUrl
          ? [{ id: `${plan.codigoExpediente}-summary`, titulo: "Resumen del plan", url: plan.summaryPdfSourceUrl, origen: "jne" }]
          : []),
      ],
    };
  }
}

function nameFilters(word: string) {
  return [
    { nombres: { contains: word, mode: "insensitive" as const } },
    { apellidoPaterno: { contains: word, mode: "insensitive" as const } },
    { apellidoMaterno: { contains: word, mode: "insensitive" as const } },
    { cargoEleccion: { contains: word, mode: "insensitive" as const } },
    { list: { organization: { name: { contains: word, mode: "insensitive" as const } } } },
  ];
}

function fullName(row: { nombres: string; apellidoPaterno: string; apellidoMaterno: string }): string {
  return [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" ");
}

function biography(
  resume: {
    cargo: string | null;
    work: Array<{ centroTrabajo: string | null; ocupacionProfesion: string | null }>;
    education: Array<{ universidad: string | null; carrera: string | null }>;
  } | null,
): string {
  if (!resume) return "Sin hoja de vida cargada en el padrón.";
  const work = resume.work
    .slice(0, 3)
    .map((item) => [item.ocupacionProfesion, item.centroTrabajo].filter(Boolean).join(" en "))
    .filter(Boolean);
  const study = resume.education
    .slice(0, 3)
    .map((item) => [item.carrera, item.universidad].filter(Boolean).join(", "))
    .filter(Boolean);
  return [resume.cargo, work.length ? `Trabajo: ${work.join("; ")}` : "", study.length ? `Estudios: ${study.join("; ")}` : ""]
    .filter(Boolean)
    .join(". ");
}
