import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { HistoryItem } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";

@Controller("history")
export class HistoryController {
  @Get()
  async list(@Query("sessionId") sessionId?: string): Promise<HistoryItem[]> {
    if (!sessionId) throw new BadRequestException("Falta sessionId");
    const rows = await getPrisma().consulta.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => {
      const respuesta = row.respuesta as { conclusion?: string } | null;
      return {
        id: row.id,
        query: row.pregunta,
        conclusion: respuesta?.conclusion ?? "",
        degraded: row.degraded,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
