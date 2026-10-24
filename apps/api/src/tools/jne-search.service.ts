import { Injectable, Logger } from "@nestjs/common";
import type { EntityRef } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { tokens } from "../text";

interface RemoteCandidate {
  id?: unknown;
  nombre?: unknown;
  cargo?: unknown;
  partido?: unknown;
}

@Injectable()
export class JneSearchService {
  private readonly logger = new Logger(JneSearchService.name);

  async search(query: string): Promise<EntityRef[]> {
    const local = await this.searchPostgres(query);
    const remote = await this.searchHttp(query);
    const merged = new Map<string, EntityRef>();
    for (const entity of [...remote, ...local]) merged.set(entity.id, entity);
    return [...merged.values()].slice(0, 8);
  }

  private async searchPostgres(query: string): Promise<EntityRef[]> {
    const words = tokens(query).slice(0, 8);
    if (words.length === 0) return [];
    const prisma = getPrisma();
    const rows = await prisma.candidato.findMany({
      where: {
        OR: words.flatMap((word) => [
          { nombre: { contains: word, mode: "insensitive" } },
          { cargo: { contains: word, mode: "insensitive" } },
          { partido: { nombre: { contains: word, mode: "insensitive" } } },
          { partido: { sigla: { contains: word, mode: "insensitive" } } },
        ]),
      },
      include: { partido: true },
      take: 8,
    });
    return rows
      .map((row) => ({
        score: words.filter((word) =>
          `${row.nombre} ${row.partido.nombre} ${row.partido.sigla ?? ""}`
            .toLowerCase()
            .includes(word),
        ).length,
        entity: {
          id: row.id,
          nombre: row.nombre,
          cargo: row.cargo,
          partido: row.partido.nombre,
        } satisfies EntityRef,
      }))
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

function normalizeRemote(row: RemoteCandidate): EntityRef[] {
  if (typeof row.nombre !== "string" || typeof row.id !== "string") return [];
  return [
    {
      id: row.id,
      nombre: row.nombre,
      cargo: typeof row.cargo === "string" ? row.cargo : "No indicado",
      partido: typeof row.partido === "string" ? row.partido : "No indicado",
    },
  ];
}
