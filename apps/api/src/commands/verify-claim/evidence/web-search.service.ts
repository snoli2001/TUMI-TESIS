import { Injectable, Logger } from "@nestjs/common";
import { tavily, type TavilySearchOptions } from "@tavily/core";
import OpenAI from "openai";
import type { EvidenceItem } from "../graph/state";
import { claimFocus, mentionsClaim, sameCandidate } from "../profile/rules";
import { socialPostCounts } from "./attribution";
import { isFactCheckUrl, isIpeUrl, isSocialUrl, NEWS_DOMAINS, preferReporting, roleForUrl, SOCIAL_DOMAINS, socialNetwork, statePortal, STATE_DOMAINS, TRUSTED_DOMAINS, trustedOutlet } from "./outlets";
import { needsPressFallback, pressItems } from "./press-fallback";

interface SearchBatch {
  items: EvidenceItem[];
  unavailable: boolean;
}

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
    const found = await this.gather(queries, aboutClaim);
    const notes = this.keep(found.items, queries[0], identity);
    if (!needsPressFallback(notes.length, found.unavailable)) return notes;
    this.logger.warn("Tavily no disponible: se consulta la prensa con OpenAI");
    return this.keep(await this.openAiPress(queries), queries[0], identity);
  }

  async stateDocuments(
    queries: string[],
    identity?: { name: string; party?: string },
  ): Promise<EvidenceItem[]> {
    const texts = [...new Set(queries.map((item) => item.trim()).filter((item) => item.length >= 3))].slice(0, 2);
    if (texts.length === 0) return [];
    const lists = await Promise.all(
      texts.map((text) =>
        this.ask(text, {
          topic: "general",
          searchDepth: "advanced",
          maxResults: 4,
          includeDomains: [...STATE_DOMAINS],
          includeDomainsMode: "restrict",
        }),
      ),
    );
    const items = lists.flatMap((batch) => batch.items);
    const notes = this.keep(items, texts[0], identity);
    if (!needsPressFallback(notes.length, items.length === 0 && lists.some((batch) => batch.unavailable))) return notes;
    this.logger.warn("Tavily no disponible: se consultan portales del Estado con OpenAI");
    return this.keep(await this.openAiState(texts), texts[0], identity);
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
      restricted.items.length > 0
        ? restricted.items
        : (await this.ask(query, { ...options, includeDomainsMode: "prefer" })).items.filter((item) => isSocialUrl(item.url));
    return pages.flatMap((item) => {
      if (!socialPostCounts(item.title, item.snippet, statement, identity)) return [];
      const network = socialNetwork(item.url) ?? "redes";
      return [{ ...item, title: `Publicación en ${network}`, snippet: item.snippet.slice(0, 700), role: "prueba" as const }];
    });
  }

  private async factChecks(text: string): Promise<SearchBatch> {
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
    const items = [...republica.items.filter((item) => isFactCheckUrl(item.url)), ...peruCheck.items];
    return { items, unavailable: items.length === 0 && (republica.unavailable || peruCheck.unavailable) };
  }

  private async trustedPress(texts: string[]): Promise<SearchBatch> {
    const queries = [...new Set(texts.map((text) => text.trim()).filter((text) => text.length >= 3))].slice(0, 2);
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
      queries.flatMap((text) =>
        domains.map((domain) =>
          this.ask(text, {
            topic: "general",
            searchDepth: "advanced",
            maxResults: 4,
            includeDomains: [domain],
            includeDomainsMode: "restrict",
          }),
        ),
      ),
    );
    const items = preferReporting(lists.flatMap((batch) => batch.items));
    return { items, unavailable: items.length === 0 && lists.some((batch) => batch.unavailable) };
  }

  private async one(text: string): Promise<SearchBatch> {
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
    const items = [...news.items, ...circulation.items];
    return { items, unavailable: items.length === 0 && (news.unavailable || circulation.unavailable) };
  }

  private async gather(queries: string[], aboutClaim: string): Promise<SearchBatch> {
    const [lists, checks, trusted] = await Promise.all([
      Promise.all(queries.map((text) => this.one(text))),
      this.factChecks(aboutClaim),
      this.trustedPress(queries),
    ]);
    const parts = [...lists.flat(), checks, trusted];
    const items = unique(parts.flatMap((part) => part.items));
    return { items, unavailable: items.length === 0 && parts.some((part) => part.unavailable) };
  }

  private keep(items: EvidenceItem[], query: string, identity?: { name: string; party?: string }): EvidenceItem[] {
    const notes = unique(items);
    if (!identity?.name.trim()) return notes;
    return notes.filter((item) => {
      if (isIpeUrl(item.url)) return true;
      const aboutCandidate = sameCandidate(item.title, item.snippet, identity);
      const official = Boolean(trustedOutlet(item.url) || statePortal(item.url));
      if (official && mentionsClaim(item.title, item.snippet, query, identity.name)) return true;
      return aboutCandidate;
    });
  }

  private async openAiState(queries: string[]): Promise<EvidenceItem[]> {
    return this.openAiSearch(
      queries,
      [...STATE_DOMAINS],
      "Busca sentencias, resoluciones o documentos oficiales. Escribe cada documento en su propia línea: una frase tomada de la página y, al final, la cita. No agregues datos que no estén en esa página.",
    );
  }

  private async openAiPress(queries: string[]): Promise<EvidenceItem[]> {
    return this.openAiSearch(
      queries,
      [...TRUSTED_DOMAINS],
      "Busca notas de la prensa peruana. Escribe cada nota en su propia línea: una frase tomada de la página y, al final, la cita. No agregues datos que no estén en esa página.",
    );
  }

  private async openAiSearch(queries: string[], domains: string[], instructions: string): Promise<EvidenceItem[]> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const texts = [...new Set(queries.map((text) => text.trim()).filter((text) => text.length >= 3))]
      .sort((left, right) => right.length - left.length)
      .slice(0, 2);
    if (!apiKey || texts.length === 0) return [];
    try {
      const client = new OpenAI({ apiKey });
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.1",
        store: false,
        max_output_tokens: 800,
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        instructions,
        input: texts.join("\n"),
        tools: [
          {
            type: "web_search",
            external_web_access: true,
            search_context_size: "medium",
            filters: { allowed_domains: domains },
            user_location: { type: "approximate", country: "PE", city: "Lima", timezone: "America/Lima" },
          },
        ],
      });
      const items = pressItems(response.output);
      this.logger.log(`Respaldo de prensa: ${items.length} notas`);
      return items;
    } catch (error) {
      this.logger.warn(`OpenAI no pudo buscar prensa: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  private async ask(query: string, options: TavilySearchOptions): Promise<SearchBatch> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    try {
      const client = tavily(apiKey ? { apiKey } : {});
      const response = await client.search(query, {
        chunksPerSource: 2,
        includeAnswer: false,
        country: "peru",
        ...options,
      });
      const items = response.results.flatMap((result) => {
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
      return { items, unavailable: false };
    } catch (error) {
      this.logger.warn(`Tavily no disponible: ${error instanceof Error ? error.message : error}`);
      return { items: [], unavailable: true };
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
