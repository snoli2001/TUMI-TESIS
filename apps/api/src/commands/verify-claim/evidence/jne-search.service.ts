import { Injectable, Logger } from "@nestjs/common";
import type { EntityRef } from "@tumi/contracts";
import { getPrisma, mediaUrl } from "@tumi/database";
import { tokens } from "../../../shared/text";

interface RemoteCandidate {
  id?: unknown;
  nombre?: unknown;
  cargo?: unknown;
  partido?: unknown;
}

@Injectable()
export class JneSearchService {
  private readonly logger = new Logger(JneSearchService.name);

  async searchByNames(words: string[]): Promise<EntityRef[]> {
    const clean = [...new Set(words.map((word) => sinAcento(word.trim())).filter((word) => word.length > 2))].slice(
      0,
      4,
    );
    if (clean.length === 0) return [];
    const where = clean
      .map((_, index) => {
        const slot = `$${index + 1}`;
        return `(${plegado("c.nombres")} LIKE ${slot} OR ${plegado("c.apellido_paterno")} LIKE ${slot} OR ${plegado("c.apellido_materno")} LIKE ${slot})`;
      })
      .join(" AND ");
    const rows = await getPrisma().$queryRawUnsafe<CandidateRow[]>(
      `SELECT c.hoja_vida_id AS id, c.nombres, c.apellido_paterno AS paterno,
              c.apellido_materno AS materno, c.cargo_eleccion AS cargo, o.name AS partido,
              c.photo_r2_key AS "fotoKey", c.photo_source_url AS "fotoUrl"
       FROM tumi.candidates c
       JOIN tumi.lists l ON l.source_id = c.list_source_id
       JOIN tumi.organizations o ON o.source_id = l.organization_source_id
       WHERE ${where}
       LIMIT 8`,
      ...clean.map((word) => `%${word.replaceAll("%", "").replaceAll("_", "")}%`),
    );
    return rows.map(presentar);
  }

  async search(query: string): Promise<EntityRef[]> {
    const local = await this.searchPostgres(query);
    const remote = await this.searchHttp(query);
    const merged = new Map<string, EntityRef>();
    for (const entity of [...remote, ...local]) merged.set(entity.id, entity);
    return [...merged.values()].slice(0, 8);
  }

  private async searchPostgres(query: string): Promise<EntityRef[]> {
    const words = tokens(query).slice(0, 4);
    if (words.length === 0) return [];
    const rows = await getPrisma().candidate.findMany({
      where: {
        AND: words.map((word) => ({
          OR: [
            { nombres: { contains: word, mode: "insensitive" as const } },
            { apellidoPaterno: { contains: word, mode: "insensitive" as const } },
            { apellidoMaterno: { contains: word, mode: "insensitive" as const } },
            { cargoEleccion: { contains: word, mode: "insensitive" as const } },
            { list: { organization: { name: { contains: word, mode: "insensitive" as const } } } },
          ],
        })),
      },
      include: { list: { include: { organization: true } } },
      take: 12,
    });
    return rows
      .map((row) => {
        const nombre = [row.nombres, row.apellidoPaterno, row.apellidoMaterno].join(" ");
        const partido = row.list.organization.name;
        const score = words.filter((word) =>
          `${nombre} ${partido} ${row.cargoEleccion}`.toLowerCase().includes(word),
        ).length;
        return {
          score,
          entity: {
            id: row.hojaVidaId,
            nombre: nombrePropio(nombre),
            cargo: frase(row.cargoEleccion),
            partido: nombrePropio(partido),
            fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
            alias: null,
          } satisfies EntityRef,
        };
      })
      .sort((left, right) => right.score - left.score)
      .map((row) => row.entity);
  }

  private async searchHttp(query: string): Promise<EntityRef[]> {
    const base = process.env.JNE_API_BASE_URL;
    if (!base) return [];
    try {
      const url = new URL("/candidatos", base.endsWith("/") ? base : `${base}/`);
      url.searchParams.set("q", query);
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return [];
      const payload = (await response.json()) as unknown;
      const rows = Array.isArray(payload) ? payload : [];
      return rows.flatMap((row) => normalizeRemote(row as RemoteCandidate));
    } catch (error) {
      this.logger.warn(`JNE HTTP no disponible: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}

interface CandidateRow {
  id: string;
  nombres: string;
  paterno: string;
  materno: string;
  cargo: string;
  partido: string;
  fotoKey: string | null;
  fotoUrl: string | null;
}

function presentar(row: CandidateRow): EntityRef {
  return {
    id: row.id,
    nombre: nombrePropio([row.nombres, row.paterno, row.materno].filter(Boolean).join(" ")),
    cargo: frase(row.cargo),
    partido: nombrePropio(row.partido),
    fotoUrl: mediaUrl(row.fotoKey) ?? row.fotoUrl,
    alias: null,
  };
}

function plegado(column: string): string {
  return `translate(lower(${column}), 'áéíóúüñ', 'aeiouun')`;
}

function sinAcento(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function nombrePropio(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .replace(/\p{L}+/gu, (word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1));
}

function frase(value: string): string {
  const lower = value.toLocaleLowerCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

function normalizeRemote(row: RemoteCandidate): EntityRef[] {
  if (typeof row.nombre !== "string" || typeof row.id !== "string") return [];
  return [
    {
      id: row.id,
      nombre: row.nombre,
      cargo: typeof row.cargo === "string" ? row.cargo : "No indicado",
      partido: typeof row.partido === "string" ? row.partido : "No indicado",
      fotoUrl: null,
      alias: null,
    },
  ];
}
