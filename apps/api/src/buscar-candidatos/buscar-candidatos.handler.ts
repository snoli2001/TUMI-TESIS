import { Injectable } from "@nestjs/common";
import type { CandidateSummary } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { tokens } from "../compartido/texto";

@Injectable()
export class BuscarCandidatosHandler {
  async execute(q: string | undefined): Promise<CandidateSummary[]> {
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
