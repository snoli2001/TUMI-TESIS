const STOP = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "que",
  "y",
  "o",
  "en",
  "un",
  "una",
  "es",
  "por",
  "para",
  "con",
  "su",
  "sus",
  "al",
  "se",
  "no",
  "si",
  "como",
  "mas",
  "lo",
  "le",
  "les",
  "ha",
  "han",
  "ser",
  "esta",
  "son",
  "fue",
  "sobre",
  "entre",
  "hasta",
  "desde",
  "hay",
  "ano",
  "anos",
]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

export function deterministicClaims(query: string): string[] {
  const parts = query
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
  return parts.length > 0 ? parts.slice(0, 4) : [query.trim()];
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function decisionMinConfidence(): number {
  const value = Number(process.env.DECISION_MIN_CONFIDENCE ?? 0.55);
  return Number.isFinite(value) ? value : 0.55;
}

export function relevanceMin(): number {
  const value = Number(process.env.DECISION_RELEVANCE_MIN ?? 0.4);
  return Number.isFinite(value) ? value : 0.4;
}
