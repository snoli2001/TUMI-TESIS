import type { SegmentoHablado } from "@tumi/contracts";
import type { VideoSegmento } from "@tumi/contracts";

export function agrupar(segmentos: SegmentoHablado[]): VideoSegmento[] {
  const grupos: VideoSegmento[] = [];
  let actual: VideoSegmento | null = null;
  for (const segmento of segmentos) {
    const texto = segmento.texto.replace(/\s+/g, " ").trim();
    if (texto.length < 3) continue;
    if (!actual) {
      actual = { texto, inicioSeg: segmento.inicioSeg, finSeg: segmento.finSeg };
      continue;
    }
    const duracion = (actual.finSeg ?? actual.inicioSeg ?? 0) - (actual.inicioSeg ?? 0);
    const cierra = /[.!?]$/.test(actual.texto) && actual.texto.length > 40;
    if (cierra || duracion >= 25 || actual.texto.length > 350) {
      grupos.push(actual);
      actual = { texto, inicioSeg: segmento.inicioSeg, finSeg: segmento.finSeg };
      continue;
    }
    actual = {
      texto: `${actual.texto} ${texto}`,
      inicioSeg: actual.inicioSeg,
      finSeg: segmento.finSeg,
    };
  }
  if (actual) grupos.push(actual);
  return grupos.slice(0, 8);
}

export function aLineas(segmentos: VideoSegmento[]): string {
  return segmentos
    .map((segmento) => `[${marca(segmento.inicioSeg)}-${marca(segmento.finSeg)}] ${segmento.texto}`)
    .join("\n");
}

function marca(segundos: number | null): string {
  const total = Math.max(0, Math.floor(segundos ?? 0));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  const mm = String(minutos).padStart(2, "0");
  const ss = String(resto).padStart(2, "0");
  return horas > 0 ? `${horas}:${mm}:${ss}` : `${mm}:${ss}`;
}
