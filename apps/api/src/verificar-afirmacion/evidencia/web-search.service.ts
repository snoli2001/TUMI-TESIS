import { Injectable, Logger } from "@nestjs/common";
import { tavily } from "@tavily/core";
import type { EvidenceItem } from "../grafo/state";

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  async search(query: string): Promise<EvidenceItem[]> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    const text = query.trim().slice(0, 400);
    if (text.length < 3) return [];
    try {
      const client = tavily(apiKey ? { apiKey } : {});
      const response = await client.search(text, {
        searchDepth: "advanced",
        topic: "general",
        maxResults: 5,
        chunksPerSource: 3,
        includeAnswer: false,
        country: "peru",
      });
      return response.results.flatMap((result) => {
        if (!result.content) return [];
        return [
          {
            id: result.id || `tavily-${hash(result.url)}`,
            title: result.title || result.url || "Resultado web",
            url: result.url || null,
            snippet: result.content.slice(0, 700),
            origin: "tavily" as const,
          },
        ];
      });
    } catch (error) {
      this.logger.warn(`Tavily no disponible: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}

function hash(value: string): string {
  let acc = 0;
  for (const char of value) acc = (acc * 31 + char.charCodeAt(0)) >>> 0;
  return acc.toString(16);
}
