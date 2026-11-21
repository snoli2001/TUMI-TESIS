import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scorePilot, type PilotScore } from "./metrics";
import { blankReviews, rubricMarkdown } from "./rubric";
import { EVAL_CONCURRENCY, EVAL_TIMEOUT_MS, type ReviewsFile, type RunSummary } from "./types";

async function main(): Promise<void> {
  const directory = join(process.cwd(), "evaluation-output");
  const runPath = join(directory, "tumi-20.json");
  const run = await readRun(runPath);
  const reviewPath = await findReviews();
  const reviews = reviewPath ? asReviews(JSON.parse(await readFile(reviewPath, "utf8"))) : null;
  const scored = scorePilot(run.cases, reviews);
  await mkdir(directory, { recursive: true });
  if (!reviews) {
    await writeFile(join(directory, "rubric-20.md"), rubricMarkdown(run.cases));
    await writeFile(join(directory, "reviews.blank.json"), JSON.stringify(blankReviews(run.cases), null, 2));
  }
  const metricsPath = join(directory, "tumi-20-metrics.json");
  const reportPath = join(directory, "tumi-20-metrics.md");
  await writeFile(metricsPath, JSON.stringify({ ...scored, concurrency: run.concurrency, timeoutMs: run.timeoutMs }, null, 2));
  await writeFile(reportPath, reportMarkdown(run, scored, reviewPath));
  console.log(JSON.stringify({ report: reportPath, pending: scored.pending.length, reviewPath }));
}

async function readRun(path: string): Promise<RunSummary> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<RunSummary>;
    if (!Array.isArray(parsed.cases)) throw new Error("sin casos");
    return {
      concurrency: parsed.concurrency ?? EVAL_CONCURRENCY,
      timeoutMs: parsed.timeoutMs ?? EVAL_TIMEOUT_MS,
      total: parsed.total ?? parsed.cases.length,
      scored: parsed.scored ?? 0,
      hits: parsed.hits ?? 0,
      skipped: parsed.skipped ?? 0,
      errors: parsed.errors ?? 0,
      timeouts: parsed.timeouts ?? 0,
      firstEventMs: parsed.firstEventMs ?? { p50: null, p95: null, n: 0 },
      resultMs: parsed.resultMs ?? { p50: null, p95: null, n: 0 },
      cases: parsed.cases,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`No hay una corrida en ${path}. Ejecuta eval:cases primero. ${detail}`);
  }
}

async function findReviews(): Promise<string | null> {
  const candidates = [
    process.env.TUMI_REVIEWS,
    join(process.cwd(), "evaluation-output", "reviews.json"),
    join(process.cwd(), "src", "commands", "verify-claim", "evaluation", "reviews.json"),
  ].filter((path): path is string => Boolean(path));
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

function asReviews(value: unknown): ReviewsFile {
  if (!value || typeof value !== "object" || !Array.isArray((value as ReviewsFile).cases)) {
    throw new Error("reviews.json no tiene la lista de casos");
  }
  return value as ReviewsFile;
}

function reportMarkdown(run: RunSummary, scored: PilotScore, reviewPath: string | null): string {
  const agreement = scored.scored === 0 ? 0 : Math.round((scored.acceptedHits / scored.scored) * 1000) / 10;
  const lines = [
    "# Métricas del piloto",
    "",
    `Concurrencia ${run.concurrency}. Tope por caso: ${run.timeoutMs / 1000} s. ${reviewPath ? `Rúbrica: \`${reviewPath}\`.` : "Todavía no hay reviews.json."}`,
    "",
    "## Acuerdo por conjunto aceptado",
    "",
    `El sistema coincidió con alguna etiqueta aceptada en ${scored.acceptedHits} de ${scored.scored} casos (${agreement} %). Esta cifra no usa la etiqueta adjudicada.`,
    "",
    "## Coincidencia de URL",
    "",
    `Citó la página de referencia en ${scored.referenceCited} de ${scored.referenceTotal} casos que tenían URL. Es un dato descriptivo, aparte de la precisión y la cobertura de citas.`,
    "",
    "## Latencia y fallos",
    "",
    `- Tiempo hasta el primer evento: p50 ${milliseconds(scored.firstEvent.p50)}, p95 ${milliseconds(scored.firstEvent.p95)} (${scored.firstEvent.n} casos)`,
    `- Tiempo hasta el resultado: p50 ${milliseconds(scored.result.p50)}, p95 ${milliseconds(scored.result.p95)} (${scored.result.n} casos)`,
    `- Errores: ${scored.errors}`,
    `- Tiempos de espera agotados: ${scored.timeouts}`,
    "",
    "## Acuerdo entre revisores",
    "",
    kappaLine("Kappa de la etiqueta", scored.kappaLabel),
    kappaLine("Kappa del pasaje", scored.kappaPassage),
    "",
    "El kappa usa las dos pasadas, antes de la adjudicación.",
    "",
    "## Verificación respaldada",
    "",
  ];
  if (scored.supported) {
    lines.push(
      `${scored.supported.supported} de ${scored.supported.total} casos (${percent(scored.supported.rate)}) tuvieron el veredicto adjudicado y respaldo suficiente. En un caso no verificable, el respaldo es explicar la falta de evidencia y no cerrar con un veredicto categórico.`,
    );
  } else {
    lines.push("Pendiente. Hace falta la etiqueta adjudicada y el juicio del pasaje en cada caso que devolvió veredicto.");
  }
  lines.push("", "## Macro-F1 y matriz", "");
  if (scored.confusion) {
    const excluded = scored.confusion.excluded;
    lines.push(
      scored.confusion.macroF1 === null ? "Macro-F1: no aplica." : `Macro-F1: ${round3(scored.confusion.macroF1)}.`,
      "",
      excluded.length > 0
        ? `Clases con soporte 0, fuera del promedio: ${excluded.join(", ")}.`
        : "Las cuatro clases tienen al menos un caso en la referencia.",
      "",
      matrixTable(scored.confusion.labels, scored.confusion.matrix),
      "",
      "| Clase | Casos | Precisión | Recall | F1 |",
      "| --- | --- | --- | --- | --- |",
      ...scored.confusion.perClass.map(
        (item) => `| ${item.label} | ${item.support} | ${ratio(item.precision)} | ${ratio(item.recall)} | ${ratio(item.f1)} |`,
      ),
      "",
    );
  } else {
    lines.push("Pendiente. El macro-F1 no se publica mientras falte la etiqueta adjudicada de algún caso.", "");
  }
  lines.push("## Precisión y cobertura de citas", "");
  if (scored.citations) {
    lines.push(
      `- Precisión: ${ratio(scored.citations.precision)} (${scored.citations.citations} citas emitidas)`,
      `- Cobertura: ${ratio(scored.citations.coverage)} (${scored.citations.sentencesNeedingSupport} oraciones que exigían respaldo)`,
      "",
    );
  } else {
    lines.push("Pendiente. Falta marcar qué citas respaldan la explicación y qué oraciones exigían respaldo.", "");
  }
  if (scored.pending.length > 0) {
    lines.push("## Pendiente", "");
    for (const item of scored.pending) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n");
}

function matrixTable(labels: readonly string[], matrix: number[][]): string {
  const header = `| Referencia \\ Sistema | ${labels.join(" | ")} |`;
  const rule = `| --- | ${labels.map(() => "---").join(" | ")} |`;
  const rows = labels.map((label, row) => `| ${label} | ${matrix[row].join(" | ")} |`);
  return [header, rule, ...rows].join("\n");
}

function kappaLine(label: string, value: { value: number; n: number } | null): string {
  if (!value) return `- ${label}: pendiente`;
  return `- ${label}: ${round3(value.value)} (${value.n} casos)`;
}

function milliseconds(value: number | null): string {
  if (value === null) return "sin datos";
  return `${Math.round(value)} ms`;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10} %`;
}

function ratio(value: number | null): string {
  if (value === null) return "no aplica";
  return `${Math.round(value * 1000) / 1000}`;
}

function round3(value: number | null): string {
  if (value === null) return "no aplica";
  return `${Math.round(value * 1000) / 1000}`;
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("/score-reviews.js") || entry?.endsWith("/score-reviews.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
