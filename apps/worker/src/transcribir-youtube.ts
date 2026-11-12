import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SegmentoHablado, TranscripcionYoutube } from "@tumi/contracts";
import { idDeYoutube, VIDEO_MAX_SEGUNDOS, VIDEO_NO_VERIFICABLE } from "@tumi/contracts";
import OpenAI from "openai";

export async function transcribirYoutube(rawUrl: string): Promise<TranscripcionYoutube> {
  const videoId = idDeYoutube(rawUrl);
  if (!videoId) throw noVerificable("La URL tiene que ser un video público de YouTube");
  if (!process.env.OPENAI_API_KEY) {
    throw noVerificable("Sin clave de OpenAI no se puede transcribir el audio");
  }
  const dir = await mkdtemp(join(tmpdir(), "tumi-youtube-"));
  try {
    const meta = await metadatos(rawUrl);
    if (meta.duracionSeg === null) {
      throw noVerificable("Este video no tiene una duración fija. Usa un video público de hasta 4 minutos.");
    }
    if (meta.duracionSeg > VIDEO_MAX_SEGUNDOS) {
      throw noVerificable("El video dura más de 4 minutos. Elige un tramo más corto.");
    }
    const audio = await descargarAudio(rawUrl, dir);
    const segmentos = await transcribir(audio, meta.duracionSeg);
    if (segmentos.length === 0) {
      throw noVerificable("No se pudo extraer voz de este video.");
    }
    return { videoId, titulo: meta.titulo, duracionSeg: meta.duracionSeg, segmentos };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function metadatos(url: string): Promise<{ titulo: string; duracionSeg: number | null }> {
  const result = await ejecutar("yt-dlp", [
    "--no-playlist",
    "--skip-download",
    "--print",
    "%(duration)s",
    "--print",
    "%(title)s",
    url,
  ]);
  if (result.code !== 0) throw noVerificable(mensajeDescarga(result.stderr));
  const [duracion, ...titulo] = result.stdout.trim().split(/\r?\n/);
  const segundos = Number(duracion);
  return {
    titulo: titulo.join(" ").trim() || "Video de YouTube",
    duracionSeg: Number.isFinite(segundos) && segundos > 0 ? segundos : null,
  };
}

async function descargarAudio(url: string, dir: string): Promise<string> {
  const plantilla = join(dir, "audio.%(ext)s");
  const result = await ejecutar("yt-dlp", [
    "--no-playlist",
    "--no-warnings",
    "-f",
    "ba",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "9",
    "-o",
    plantilla,
    url,
  ]);
  if (result.code !== 0) throw noVerificable(mensajeDescarga(result.stderr));
  const archivo = (await readdir(dir)).find((name) => name.endsWith(".mp3"));
  if (!archivo) throw noVerificable("YouTube no entregó una pista de audio.");
  return join(dir, archivo);
}

async function transcribir(archivo: string, duracionSeg: number): Promise<SegmentoHablado[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const file = await OpenAI.toFile(createReadStream(archivo), "audio.mp3");
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "es",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const segmentos = "segments" in result && Array.isArray(result.segments) ? result.segments : [];
  const hablados = segmentos.flatMap((segment) => {
    const texto = segment.text.trim();
    if (texto.length < 3) return [];
    return [{ texto, inicioSeg: Math.floor(segment.start), finSeg: Math.ceil(segment.end) }];
  });
  if (hablados.length > 0) return hablados;
  const texto = "text" in result ? result.text.trim() : "";
  if (texto.length < 3) return [];
  return [{ texto, inicioSeg: 0, finSeg: Math.ceil(duracionSeg) }];
}

function mensajeDescarga(stderr: string): string {
  const texto = stderr.toLowerCase();
  if (texto.includes("enoent") || texto.includes("not found")) {
    return "El servidor no puede descargar videos de YouTube.";
  }
  return "YouTube no dejó bajar el audio de este video.";
}

function noVerificable(message: string): Error {
  return new Error(`${VIDEO_NO_VERIFICABLE} ${message}`);
}

function ejecutar(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(noVerificable("La descarga del video tardó demasiado"));
    }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        reject(noVerificable("El servidor no puede descargar videos de YouTube."));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
