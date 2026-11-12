import { Injectable } from "@nestjs/common";
import type { CandidateSearchFilters, CandidateSearchResult, CandidateSummary } from "@tumi/contracts";
import { getPrisma, mediaUrl } from "@tumi/database";
import { tokens } from "../compartido/texto";

const RESULT_LIMIT = 20;

@Injectable()
export class BuscarCandidatosHandler {
  async execute(q: string | undefined, filters: CandidateSearchFilters = {}): Promise<CandidateSearchResult> {
    const words = tokens(q ?? "").slice(0, 4);
    const scope = scopeClause(filters);
    if (words.length === 0 && !scope) return { resultados: [], total: 0, organizaciones: [], sexos: [] };

    const prisma = getPrisma();
    const nameWhere = words.length > 0 ? { AND: words.map((word) => ({ OR: nameFilters(word) })) } : null;
    const base = { AND: [nameWhere, scope].filter((clause) => clause !== null) };
    const where = { AND: [...base.AND, ...filterClauses(filters)] };
    const catalogo = words.length === 0 && Boolean(filters.distrito?.trim());
    const [total, rows, organizations, sexes] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        include: { list: { include: { organization: true } } },
        orderBy: catalogo
          ? [{ cargoEleccion: "asc" }, { nombres: "asc" }, { apellidoPaterno: "asc" }, { apellidoMaterno: "asc" }]
          : orderBy(filters.orden),
        take: catalogo ? 240 : RESULT_LIMIT,
      }),
      prisma.organization.findMany({
        where: { lists: { some: { candidates: { some: base } } } },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.resume.findMany({
        where: { sexo: { not: null }, candidate: base },
        distinct: ["sexo"],
        select: { sexo: true },
      }),
    ]);

    return {
      resultados: rows.map(toSummary),
      total,
      organizaciones: [...new Set(organizations.map((org) => org.name))].sort(bySpanish),
      sexos: [...new Set(sexes.map((row) => row.sexo).filter((sexo): sexo is string => Boolean(sexo?.trim())))].sort(bySpanish),
    };
  }
}

function toSummary(row: {
  hojaVidaId: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  cargoEleccion: string;
  photoR2Key: string | null;
  photoSourceUrl: string | null;
  list: { organization: { name: string; logoR2Key: string | null; logoSourceUrl: string | null } };
}): CandidateSummary {
  return {
    id: row.hojaVidaId,
    nombre: fullName(row),
    cargo: row.cargoEleccion,
    partido: row.list.organization.name,
    sigla: null,
    fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
    logoUrl: mediaUrl(row.list.organization.logoR2Key) ?? row.list.organization.logoSourceUrl,
    demostracion: false,
  };
}

function scopeClause(filters: CandidateSearchFilters): object | null {
  const distrito = filters.distrito?.trim();
  const provincia = filters.provincia?.trim();
  const departamento = filters.departamento?.trim();
  if (distrito) return { list: { districtCode: distrito } };
  if (provincia) return { list: { provinceCode: provincia } };
  if (departamento) return { list: { departmentCode: departamento } };
  return null;
}

function filterClauses(filters: CandidateSearchFilters): object[] {
  const clauses: object[] = [];
  const organizacion = filters.organizacion?.trim();
  const sexo = filters.sexo?.trim();
  if (organizacion) clauses.push({ list: { organization: { name: organizacion } } });
  if (sexo) clauses.push({ resume: { is: { sexo } } });
  if (filters.experienciaElectoral) clauses.push({ resume: { is: { elected: { some: {} } } } });
  if (filters.sinSentencias) {
    clauses.push({
      NOT: {
        OR: [
          { resume: { is: { criminal: { some: {} } } } },
          { resume: { is: { obligation: { some: {} } } } },
        ],
      },
    });
  }
  if (filters.primaria) clauses.push({ resume: { is: { primaryCompleted: true } } });
  if (filters.secundaria) clauses.push({ resume: { is: { secondaryCompleted: true } } });
  if (filters.superiores) clauses.push({ resume: { is: { education: { some: {} } } } });
  if (filters.trabajo) clauses.push({ resume: { is: { work: { some: {} } } } });
  return clauses;
}

function orderBy(orden: CandidateSearchFilters["orden"]) {
  const byName = [{ nombres: "asc" as const }, { apellidoPaterno: "asc" as const }, { apellidoMaterno: "asc" as const }];
  if (orden === "organizacion") return [{ list: { organization: { name: "asc" as const } } }, ...byName];
  return byName;
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

function bySpanish(left: string, right: string): number {
  return left.localeCompare(right, "es", { sensitivity: "base" });
}
