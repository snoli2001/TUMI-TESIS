import type { VideoSegmento } from "@tumi/contracts";

const MARCA =
  /^(?:\[)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\])?(?:\s*[-–]\s*(?:\[)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\])?)?\s+(.+)$/;

export function segmentar(transcripcion: string): VideoSegmento[] {
  const lineas = transcripcion
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map(parsearLinea)
    .filter((segmento) => segmento.texto.length >= 3);

  const conMarca = lineas.some((segmento) => segmento.inicioSeg !== null);
  if (conMarca || lineas.length > 1) return lineas.slice(0, 8);
  return partirOraciones(transcripcion).slice(0, 8);
}

function parsearLinea(linea: string): VideoSegmento {
  const match = linea.match(MARCA);
  if (!match?.[7]) return { texto: linea, inicioSeg: null, finSeg: null };
  return {
    texto: match[7].trim(),
    inicioSeg: aSegundos(match[1], match[2], match[3]),
    finSeg: match[6] ? aSegundos(match[4], match[5], match[6]) : null,
  };
}

function partirOraciones(transcripcion: string): VideoSegmento[] {
  return transcripcion
    .split(/(?<=[.!?])\s+/)
    .map((texto) => texto.trim())
    .filter((texto) => texto.length >= 3)
    .map((texto) => ({ texto, inicioSeg: null, finSeg: null }));
}

function aSegundos(horas: string | undefined, minutos: string | undefined, segundos: string | undefined): number {
  return Number(horas ?? 0) * 3600 + Number(minutos ?? 0) * 60 + Number(segundos ?? 0);
}
