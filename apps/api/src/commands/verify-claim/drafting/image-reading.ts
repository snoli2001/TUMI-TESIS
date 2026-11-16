export const IMAGE_KINDS = ["statement", "claim", "record", "other"] as const;

export type ImageKind = (typeof IMAGE_KINDS)[number];

export interface ImageReading {
  kind: ImageKind;
  claims: string[];
}

const EMPTY: ImageReading = { kind: "other", claims: [] };

export function parseImageReading(raw: string): ImageReading {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return EMPTY;
  try {
    const parsed = JSON.parse(json) as { kind?: unknown; claims?: unknown };
    const kind = IMAGE_KINDS.find((item) => item === parsed.kind) ?? "other";
    if (kind === "other" || !Array.isArray(parsed.claims)) return EMPTY;
    const claims = parsed.claims
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item) => item.length > 0)
      .slice(0, kind === "statement" ? 4 : 1);
    return claims.length > 0 ? { kind, claims } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readingLine(kind: ImageKind): string {
  if (kind === "statement") return "Leímos las declaraciones de la nota.";
  if (kind === "claim") return "Leímos una afirmación sobre este candidato.";
  if (kind === "record") return "Leímos una ficha oficial.";
  return "";
}
