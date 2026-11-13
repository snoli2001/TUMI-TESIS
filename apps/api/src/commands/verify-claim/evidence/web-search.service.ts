import { Injectable, Logger } from "@nestjs/common";
import { tavily, type TavilySearchOptions } from "@tavily/core";
import type { EvidenceItem } from "../graph/state";
import { DOMINIOS_MEDIO, rolDeUrl } from "./medios";

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  async search(query: string): Promise<EvidenceItem[]> {
    const text = query.trim().slice(0, 400);
    if (text.length < 3) return [];
    const [medios, circulacion] = await Promise.all([
      this.consultar(text, {
        topic: "news",
        searchDepth: "advanced",
        maxResults: 4,
        includeDomains: DOMINIOS_MEDIO,
        includeDomainsMode: "restrict",
      }),
      this.consultar(text, {
        topic: "general",
        searchDepth: "basic",
        maxResults: 4,
        excludeDomains: DOMINIOS_MEDIO,
      }),
    ]);
    return unicos([...medios, ...circulacion]);
  }

  private async consultar(query: string, opciones: TavilySearchOptions): Promise<EvidenceItem[]> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    try {
      const client = tavily(apiKey ? { apiKey } : {});
      const response = await client.search(query, {
        chunksPerSource: 2,
        includeAnswer: false,
        country: "peru",
        ...opciones,
      });
      return response.results.flatMap((result) => {
        if (!result.content || !result.url) return [];
        const role = rolDeUrl(result.url);
        return [
          {
            id: result.id || `tavily-${hash(result.url)}`,
            title: result.title || result.url,
            url: result.url,
            snippet: result.content.slice(0, 700),
            origin: "tavily" as const,
            role,
            stance: null,
            pagina: null,
            codigoExpediente: null,
          },
        ];
      });
    } catch (error) {
      this.logger.warn(`Tavily no disponible: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}

function unicos(items: EvidenceItem[]): EvidenceItem[] {
  const map = new Map<string, EvidenceItem>();
  for (const item of items) map.set(item.url ?? item.id, item);
  return [...map.values()];
}

function hash(value: string): string {
  let acc = 0;
  for (const char of value) acc = (acc * 31 + char.charCodeAt(0)) >>> 0;
  return acc.toString(16);
}
