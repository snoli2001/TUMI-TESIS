const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

export const VIDEO_MAX_SEGUNDOS = 240;
export const VIDEO_NO_VERIFICABLE = "NO_VERIFICABLE:";

export function idDeYoutube(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    return idValido(parts[0]);
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
  const raiz = parts[0] ?? "";
  if (raiz === "playlist" || raiz === "channel" || raiz === "c" || raiz === "live" || raiz.startsWith("@")) {
    return null;
  }
  if (raiz === "watch") return idValido(url.searchParams.get("v"));
  if (raiz === "shorts" || raiz === "embed") return idValido(parts[1]);
  return null;
}

export interface SegmentoHablado {
  texto: string;
  inicioSeg: number;
  finSeg: number;
}

export interface TranscripcionYoutube {
  videoId: string;
  titulo: string;
  duracionSeg: number;
  segmentos: SegmentoHablado[];
}

export function mensajeNoVerificable(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const marker = message.indexOf(VIDEO_NO_VERIFICABLE);
  if (marker < 0) return null;
  return message.slice(marker + VIDEO_NO_VERIFICABLE.length).trim();
}

function idValido(value: string | null | undefined): string | null {
  if (!value || !ID_VIDEO.test(value)) return null;
  return value;
}
