import { Injectable, NotFoundException } from "@nestjs/common";
import type { CandidateProfile } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";

@Injectable()
export class VerCandidatoHandler {
  async execute(id: string): Promise<CandidateProfile> {
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
