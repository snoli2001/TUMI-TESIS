import { Injectable, Logger } from "@nestjs/common";
import type { EvidenceItem } from "../agents/state";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  async search(query: string): Promise<EvidenceItem[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          search_depth: "basic",
        }),
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as { results?: TavilyResult[] };
      return (payload.results ?? []).flatMap((result, index) => {
        if (!result.content) return [];
        return [
          {
            id: `tavily-${index}-${hash(result.url ?? result.title ?? String(index))}`,
            title: result.title || result.url || "Resultado web",
            url: result.url ?? null,
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
