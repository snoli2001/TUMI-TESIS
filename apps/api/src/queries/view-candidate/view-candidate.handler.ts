import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CandidateProfile,
  HojaVida,
  HojaVidaSentencia,
  PlanGobierno,
} from "@tumi/contracts";
import { getPrisma, mediaUrl } from "@tumi/database";

@Injectable()
export class ViewCandidateHandler {
  async execute(id: string): Promise<CandidateProfile> {
    const row = await getPrisma().candidate.findUnique({
      where: { hojaVidaId: id },
      include: {
        list: {
          include: {
            organization: true,
            plan: {
              include: {
                dimensions: {
                  orderBy: { id: "asc" },
                  include: { proposals: { orderBy: { itemIndex: "asc" } } },
                },
              },
            },
          },
        },
        resume: {
          include: {
            work: true,
            education: true,
            elected: true,
            resignations: true,
            income: true,
            properties: true,
            vehicles: true,
            criminal: true,
            obligation: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Candidato no encontrado");
    return {
      id: row.hojaVidaId,
      nombre: fullName(row),
      cargo: row.cargoEleccion,
      partido: row.list.organization.name,
      sigla: null,
      fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
      logoUrl: mediaUrl(row.list.organization.logoR2Key) ?? row.list.organization.logoSourceUrl,
      demostracion: false,
      hojaVida: row.resume ? toHojaVida(row.resume) : null,
      plan: row.list.plan ? toPlan(row.list.plan) : null,
    };
  }
}

function toHojaVida(resume: {
  sexo: string | null;
  fechaNacimiento: string | null;
  cargo: string | null;
  primaryCompleted: boolean | null;
  secondaryCompleted: boolean | null;
  education: Array<{ universidad: string | null; carrera: string | null; anioBachiller: string | null }>;
  work: Array<{
    ocupacionProfesion: string | null;
    centroTrabajo: string | null;
    departamento: string | null;
    provincia: string | null;
    distrito: string | null;
    anioDesde: string | null;
    anioHasta: string | null;
  }>;
  elected: Array<{ orgPolitica: string | null; cargo: string | null; anioDesde: string | null; anioHasta: string | null }>;
  resignations: Array<{ orgPolitica: string | null; anio: string | null }>;
  income: Array<{ anio: string | null; total: string | null }>;
  properties: Array<{ tipo: string | null; direccion: string | null; autovaluo: string | null }>;
  vehicles: Array<{ placa: string | null; valor: string | null }>;
  criminal: Array<{ materia: string | null; expediente: string | null; fechaSentencia: string | null; fallo: string | null }>;
  obligation: Array<{ materia: string | null; expediente: string | null; fechaSentencia: string | null; fallo: string | null }>;
}): HojaVida {
  return {
    sexo: text(resume.sexo),
    fechaNacimiento: text(resume.fechaNacimiento),
    cargo: text(resume.cargo),
    primariaCompleta: resume.primaryCompleted,
    secundariaCompleta: resume.secondaryCompleted,
    estudios: resume.education.map((item) => ({
      universidad: text(item.universidad),
      carrera: text(item.carrera),
      anio: text(item.anioBachiller),
    })),
    trabajo: [...resume.work]
      .sort((left, right) => year(right.anioDesde) - year(left.anioDesde))
      .map((item) => ({
        ocupacion: text(item.ocupacionProfesion),
        centro: text(item.centroTrabajo),
        lugar: [item.distrito, item.provincia, item.departamento].map(text).filter(Boolean).join(", ") || null,
        desde: text(item.anioDesde),
        hasta: text(item.anioHasta),
      })),
    cargosElectos: resume.elected.map((item) => ({
      organizacion: text(item.orgPolitica),
      cargo: text(item.cargo),
      desde: text(item.anioDesde),
      hasta: text(item.anioHasta),
    })),
    renuncias: resume.resignations.map((item) => ({
      organizacion: text(item.orgPolitica),
      anio: text(item.anio),
    })),
    ingresos: resume.income.map((item) => ({ anio: text(item.anio), total: text(item.total) })),
    inmuebles: resume.properties.map((item) => ({
      tipo: text(item.tipo),
      direccion: text(item.direccion),
      autovaluo: text(item.autovaluo),
    })),
    vehiculos: resume.vehicles.map((item) => ({ placa: text(item.placa), valor: text(item.valor) })),
    sentenciasPenales: resume.criminal.map(toSentencia),
    sentenciasObligacion: resume.obligation.map(toSentencia),
  };
}

function toPlan(plan: {
  ideario: string | null;
  vision: string | null;
  fullPdfR2Key: string | null;
  summaryPdfR2Key: string | null;
  fullPdfSourceUrl: string | null;
  summaryPdfSourceUrl: string | null;
  dimensions: Array<{
    id: bigint;
    name: string;
    proposals: Array<{ problema: string | null; objetivo: string | null; indicador: string | null; meta: string | null }>;
  }>;
}): PlanGobierno {
  return {
    ideario: text(plan.ideario),
    vision: text(plan.vision),
    pdfCompleto: mediaUrl(plan.fullPdfR2Key) ?? text(plan.fullPdfSourceUrl),
    pdfResumen: mediaUrl(plan.summaryPdfR2Key) ?? text(plan.summaryPdfSourceUrl),
    dimensiones: plan.dimensions.map((dimension) => ({
      id: dimension.id.toString(),
      nombre: dimension.name,
      propuestas: dimension.proposals.map((proposal) => ({
        problema: text(proposal.problema),
        objetivo: text(proposal.objetivo),
        indicador: text(proposal.indicador),
        meta: text(proposal.meta),
      })),
    })),
  };
}

function toSentencia(item: {
  materia: string | null;
  expediente: string | null;
  fechaSentencia: string | null;
  fallo: string | null;
}): HojaVidaSentencia {
  return {
    materia: text(item.materia),
    expediente: text(item.expediente),
    fecha: text(item.fechaSentencia),
    fallo: text(item.fallo),
  };
}

function fullName(row: { nombres: string; apellidoPaterno: string; apellidoMaterno: string }): string {
  return [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" ");
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function year(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
