import { BadRequestException, Injectable } from "@nestjs/common";
import type { HistoryItem } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";

@Injectable()
export class ConsultarHistorialHandler {
  async execute(sessionId: string | undefined): Promise<HistoryItem[]> {
    if (!sessionId) throw new BadRequestException("Falta sessionId");
    const rows = await getPrisma().factTurn.findMany({
      where: { sessionId, role: "assistant" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => {
      const saved = isRecord(row.sources) ? row.sources : null;
      return {
        id: row.id.toString(),
        query: typeof saved?.query === "string" ? saved.query : row.content,
        conclusion: typeof saved?.conclusion === "string" ? saved.conclusion : row.content,
        degraded: saved?.degraded === true,
        createdAt: row.createdAt.toISOString(),
        inicioSeg: numberOrNull(saved?.inicioSeg),
        finSeg: numberOrNull(saved?.finSeg),
      };
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
