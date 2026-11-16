import { Injectable, Logger } from "@nestjs/common";
import { tavily, type TavilySearchOptions } from "@tavily/core";
import type { EvidenceItem } from "../graph/state";
import { sameCandidate } from "../profile/rules";
import { isFactCheckUrl, NEWS_DOMAINS, roleForUrl } from "./outlets";

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  async search(
    query: string | string[],
    identity?: { name: string; party?: string },
  ): Promise<EvidenceItem[]> {
    const queries = (Array.isArray(query) ? query : [query])
      .map((item) => item.trim().slice(0, 400))
      .filter((item) => item.length >= 3)
      .slice(0, 3);
    if (queries.length === 0) return [];
    const [lists, checks] = await Promise.all([
      Promise.all(queries.map((text) => this.one(text))),
      this.factChecks(queries[0]),
    ]);
    const notes = unique([...checks, ...lists.flat()]);
    if (!identity?.name.trim()) return notes;
    return notes.filter((item) => sameCandidate(item.title, item.snippet, identity));
  }

  private async factChecks(text: string): Promise<EvidenceItem[]> {
    const found = await this.ask(`${text} verificador La República`, {
      topic: "general",
      searchDepth: "advanced",
      maxResults: 3,
      includeDomains: ["larepublica.pe"],
      includeDomainsMode: "restrict",
    });
    return found.filter((item) => isFactCheckUrl(item.url));
  }

  private async one(text: string): Promise<EvidenceItem[]> {
    const [news, circulation] = await Promise.all([
      this.ask(text, {
        topic: "news",
        searchDepth: "advanced",
        maxResults: 4,
        includeDomains: NEWS_DOMAINS,
        includeDomainsMode: "restrict",
      }),
      this.ask(text, {
        topic: "general",
        searchDepth: "basic",
        maxResults: 4,
        excludeDomains: NEWS_DOMAINS,
      }),
    ]);
    return [...news, ...circulation];
  }

  private async ask(query: string, options: TavilySearchOptions): Promise<EvidenceItem[]> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    try {
      const client = tavily(apiKey ? { apiKey } : {});
      const response = await client.search(query, {
        chunksPerSource: 2,
        includeAnswer: false,
        country: "peru",
        ...options,
      });
      return response.results.flatMap((result) => {
        if (!result.content || !result.url) return [];
        const role = roleForUrl(result.url);
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

function unique(items: EvidenceItem[]): EvidenceItem[] {
  const map = new Map<string, EvidenceItem>();
  for (const item of items) map.set(item.url ?? item.id, item);
  return [...map.values()];
}

function hash(value: string): string {
  let acc = 0;
  for (const char of value) acc = (acc * 31 + char.charCodeAt(0)) >>> 0;
  return acc.toString(16);
}
