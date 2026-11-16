import { Injectable, Logger } from "@nestjs/common";
import { tavily, type TavilySearchOptions } from "@tavily/core";
import type { EvidenceItem } from "../graph/state";
import { claimFocus, mentionsClaim, sameCandidate } from "../profile/rules";
import { socialPostCounts } from "./attribution";
import { isFactCheckUrl, isIpeUrl, isSocialUrl, NEWS_DOMAINS, roleForUrl, SOCIAL_DOMAINS, socialNetwork, trustedOutlet } from "./outlets";

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
    const focus = identity?.name ? claimFocus(queries[0], identity.name) : queries[0];
    const aboutPerson = /reelec/i.test(queries[0]);
    const aboutClaim = aboutPerson || focus.length < 8 ? queries[0] : focus;
    const [lists, checks, trusted] = await Promise.all([
      Promise.all(queries.map((text) => this.one(text))),
      this.factChecks(aboutClaim),
      this.trustedPress(aboutClaim),
    ]);
    const notes = unique([...checks, ...trusted, ...lists.flat()]);
    if (!identity?.name.trim()) return notes;
    return notes.filter((item) => {
      if (isIpeUrl(item.url)) return true;
      const aboutCandidate = sameCandidate(item.title, item.snippet, identity);
      if (trustedOutlet(item.url) && mentionsClaim(item.title, item.snippet, queries[0], identity.name)) return true;
      return aboutCandidate;
    });
  }

  async socialPosts(statement: string, identity: { name: string; party?: string }): Promise<EvidenceItem[]> {
    const quote = statement.replace(/["“”]/g, "").trim().slice(0, 240);
    const name = identity.name.trim();
    if (quote.length < 8 || name.length < 3) return [];
    const query = `"${name}" "${quote}"`;
    const options: TavilySearchOptions = {
      topic: "general",
      searchDepth: "advanced",
      maxResults: 5,
      includeDomains: SOCIAL_DOMAINS,
      exactMatch: true,
      includeRawContent: "text",
    };
    const restricted = await this.ask(query, { ...options, includeDomainsMode: "restrict" });
    const pages =
      restricted.length > 0
        ? restricted
        : (await this.ask(query, { ...options, includeDomainsMode: "prefer" })).filter((item) => isSocialUrl(item.url));
    return pages.flatMap((item) => {
      if (!socialPostCounts(item.title, item.snippet, statement, identity)) return [];
      const network = socialNetwork(item.url) ?? "redes";
      return [{ ...item, title: `Publicación en ${network}`, snippet: item.snippet.slice(0, 700), role: "prueba" as const }];
    });
  }

  private async factChecks(text: string): Promise<EvidenceItem[]> {
    const [republica, peruCheck] = await Promise.all([
      this.ask(text, {
        topic: "general",
        searchDepth: "advanced",
        maxResults: 3,
        includeDomains: ["larepublica.pe"],
        includeDomainsMode: "restrict",
      }),
      this.ask(text, {
        topic: "general",
        searchDepth: "advanced",
        maxResults: 3,
        includeDomains: ["perucheck.pe"],
        includeDomainsMode: "restrict",
      }),
    ]);
    return [...republica.filter((item) => isFactCheckUrl(item.url)), ...peruCheck];
  }

  private async trustedPress(text: string): Promise<EvidenceItem[]> {
    const domains = [
      "rpp.pe",
      "elcomercio.pe",
      "larepublica.pe",
      "andina.pe",
      "ojo-publico.com",
      "convoca.pe",
      "idl-reporteros.pe",
      "ipe.org.pe",
    ];
    const lists = await Promise.all(
      domains.map((domain) =>
        this.ask(text, {
          topic: "general",
          searchDepth: "advanced",
          maxResults: 2,
          includeDomains: [domain],
          includeDomainsMode: "restrict",
        }),
      ),
    );
    return lists.flat();
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
        const raw = typeof result.rawContent === "string" ? result.rawContent : "";
        const body = options.includeRawContent ? [result.content, raw].filter(Boolean).join("\n") : result.content;
        if (!body || !result.url) return [];
        const role = roleForUrl(result.url);
        return [
          {
            id: result.id || `tavily-${hash(result.url)}`,
            title: result.title || result.url,
            url: result.url,
            snippet: body.slice(0, options.includeRawContent ? 4000 : 700),
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
