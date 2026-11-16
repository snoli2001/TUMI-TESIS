import type { EvidenceItem } from "../graph/state";
import { preferReporting, roleForUrl, trustedOutlet } from "./outlets";

interface CitedSpan {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface TextBlock {
  type?: string;
  text?: string;
  annotations?: CitedSpan[];
}

interface OutputItem {
  type?: string;
  content?: TextBlock[];
}

export function needsPressFallback(itemCount: number, unavailable: boolean): boolean {
  return itemCount === 0 && unavailable;
}

export function pressItems(output: unknown): EvidenceItem[] {
  const cited = new Map<string, EvidenceItem>();
  for (const item of outputItems(output)) {
    for (const block of item.content ?? []) {
      if (block.type !== "output_text" || typeof block.text !== "string") continue;
      for (const note of block.annotations ?? []) {
        if (note.type !== "url_citation" || !note.url) continue;
        const url = articleUrl(note.url);
        if (!url) continue;
        const snippet = citedSnippet(block.text, note.start_index, note.end_index);
        if (snippet.length < 20 || isSearchApology(snippet)) continue;
        const current = cited.get(url);
        if (current && current.snippet.length >= snippet.length) continue;
        cited.set(url, {
          id: `web-${hash(url)}`,
          title: note.title?.trim() || url,
          url,
          snippet,
          origin: "tavily",
          role: roleForUrl(url),
          stance: null,
          pagina: null,
          codigoExpediente: null,
        });
      }
    }
  }
  return preferReporting([...cited.values()]);
}

function articleUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  parsed.searchParams.delete("utm_source");
  parsed.searchParams.delete("outputType");
  const path = parsed.pathname.toLowerCase();
  if (path.endsWith(".pdf") || /\/(tag|autor|opinion|archivo)\//.test(path) || /\/noticias\/[^/]+\/?$/.test(path)) return null;
  const cleaned = parsed.toString();
  return trustedOutlet(cleaned) ? cleaned : null;
}

function isSearchApology(snippet: string): boolean {
  return /no encontr|no hay una nota|ni una referencia/.test(snippet.toLowerCase());
}

function outputItems(output: unknown): OutputItem[] {
  return Array.isArray(output) ? output.filter((item): item is OutputItem => Boolean(item) && typeof item === "object") : [];
}

function citedSnippet(text: string, start: number | undefined, end: number | undefined): string {
  if (start === undefined || end === undefined || end <= start) return "";
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const begin = text.lastIndexOf("\n", from) + 1;
  const next = text.indexOf("\n", to);
  return text
    .slice(begin, next === -1 ? text.length : next)
    .replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function hash(value: string): string {
  let acc = 0;
  for (const char of value) acc = (acc * 31 + char.charCodeAt(0)) >>> 0;
  return acc.toString(16);
}
