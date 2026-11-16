import { Injectable } from "@nestjs/common";
import type { HistoryItem } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";
import { readSession } from "../../shared/session/session-access";

@Injectable()
export class ConsultHistoryHandler {
  async execute(sessionId: string | undefined, accessKey: string | undefined): Promise<HistoryItem[]> {
    const id = await readSession(sessionId, accessKey);
    if (!id) return [];
    const rows = await getPrisma().factTurn.findMany({
      where: { sessionId: id, role: "assistant" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => {
      const saved = isRecord(row.sources) ? row.sources : null;
      const verdicts = Array.isArray(saved?.verdicts) ? saved.verdicts : [];
      let storedVerdict: string | null = null;
      for (const item of verdicts) {
        if (!isRecord(item)) continue;
        storedVerdict = textOf(item.verdict);
        break;
      }
      return {
        id: row.id.toString(),
        query: typeof saved?.query === "string" ? saved.query : row.content,
        conclusion: typeof saved?.conclusion === "string" ? saved.conclusion : row.content,
        verdict: typeof row.verdict === "string" ? row.verdict : storedVerdict,
        candidate: candidateOf(saved?.entities),
        degraded: saved?.degraded === true,
        createdAt: row.createdAt.toISOString(),
        inicioSeg: numberOrNull(saved?.inicioSeg),
        finSeg: numberOrNull(saved?.finSeg),
      };
    });
  }
}

function candidateOf(value: unknown): HistoryItem["candidate"] {
  if (!Array.isArray(value)) return null;
  const entity = value.find(isRecord);
  if (!entity || typeof entity.id !== "string" || typeof entity.nombre !== "string") return null;
  return {
    id: entity.id,
    nombre: entity.nombre,
    cargo: typeof entity.cargo === "string" ? entity.cargo : "",
    partido: typeof entity.partido === "string" ? entity.partido : "",
    fotoUrl: typeof entity.fotoUrl === "string" ? entity.fotoUrl : null,
  };
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
