import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { acceptsVerdict, VERIFICATION_CASES, type VerificationCase } from "./cases";
import { isTimeoutError, latencyStats, splitSentences } from "./metrics";
import { blankReviews, rubricMarkdown } from "./rubric";
import { EVAL_CONCURRENCY, EVAL_TIMEOUT_MS, type CaseReport, type CaseStatus, type CitedSource, type ReturnedEntity, type RunSummary } from "./types";

interface SourcePayload {
  title?: string;
  url?: string | null;
  snippet?: string;
  origin?: string;
  role?: string;
}

interface VerdictRow {
  claim: string;
  verdict: string;
  check?: string;
  explanation?: string;
  sources?: SourcePayload[];
}

interface EntityPayload {
  id?: string;
  nombre?: string;
  cargo?: string;
}

interface Verified {
  firstEventMs: number | null;
  resultMs: number;
  conclusion: string;
  verdicts: VerdictRow[];
  sources: SourcePayload[];
  entities: EntityPayload[];
}

class VerifyFailure extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "error",
    readonly firstEventMs: number | null,
    readonly resultMs: number | null,
  ) {
    super(message);
    this.name = kind === "timeout" ? "TimeoutError" : "Error";
  }
}

const base = process.env.TUMI_API_BASE ?? "http://localhost:8080/api";

async function main(): Promise<void> {
  const reports: CaseReport[] = [];
  const only = process.argv.slice(2);
  const selected = only.length > 0 ? VERIFICATION_CASES.filter((item) => only.includes(item.id)) : VERIFICATION_CASES;
  for (const item of selected) {
    reports.push(await runCase(item));
    const last = reports[reports.length - 1];
    const detail = (last.explanation ?? last.error ?? "").replace(/\s+/g, " ").slice(0, 220);
    console.log(`${last.id} ${last.status} ${last.actual ?? ""} ${detail}`);
  }
  const scored = reports.filter((item) => item.status === "coincide" || item.status === "difiere");
  const summary: RunSummary = {
    concurrency: EVAL_CONCURRENCY,
    timeoutMs: EVAL_TIMEOUT_MS,
    total: reports.length,
    scored: scored.length,
    hits: scored.filter((item) => item.status === "coincide").length,
    skipped: reports.filter((item) => item.status === "sin_candidato").length,
    errors: reports.filter((item) => item.status === "error").length,
    timeouts: reports.filter((item) => item.status === "timeout").length,
    firstEventMs: latencyStats(reports.map((item) => item.firstEventMs)),
    resultMs: latencyStats(reports.map((item) => item.resultMs)),
    cases: reports,
  };
  const directory = join(process.cwd(), "evaluation-output");
  const output = join(directory, "tumi-20.json");
  const report = join(directory, "tumi-20.md");
  await mkdir(directory, { recursive: true });
  await writeFile(output, JSON.stringify(summary, null, 2));
  await writeFile(report, reportMarkdown(summary));
  await writeFile(join(directory, "rubric-20.md"), rubricMarkdown(reports));
  await writeFile(join(directory, "reviews.blank.json"), JSON.stringify(blankReviews(reports), null, 2));
  console.log(JSON.stringify({ total: summary.total, scored: summary.scored, hits: summary.hits, output, report }));
}

async function runCase(item: VerificationCase): Promise<CaseReport> {
  const baseReport = {
    id: item.id,
    person: item.person,
    claim: item.claim,
    expectedLabel: item.expectedLabel,
    verdicts: item.verdicts,
    evaluates: item.evaluates,
    criterion: item.criterion,
  };
  if (!item.hojaVidaId) {
    return unfinished(baseReport, "sin_candidato", null, null, null);
  }
  try {
    const result = await verify(item.claim, item.hojaVidaId);
    const chosen = result.verdicts.filter((verdict) => verdict.check === "truth");
    const rows = chosen.length > 0 ? chosen : result.verdicts;
    const actual = rows[0]?.verdict ?? null;
    const sources = collectSources(rows, result.sources);
    const explanation = [rows[0]?.explanation, result.conclusion].find((text) => text && text.trim()) ?? "";
    const status: CaseStatus = actual && acceptsVerdict(item, actual) ? "coincide" : "difiere";
    return {
      ...baseReport,
      status,
      actual,
      explanation,
      conclusion: result.conclusion || null,
      sentences: splitSentences(explanation),
      citedReference: item.referenceUrl ? sources.some((source) => source.url && samePage(source.url, item.referenceUrl as string)) : null,
      sources,
      entity: entityOf(result.entities),
      firstEventMs: result.firstEventMs,
      resultMs: result.resultMs,
      error: null,
    };
  } catch (error) {
    const failure = error instanceof VerifyFailure ? error : null;
    const timedOut = isTimeoutError(error) || failure?.kind === "timeout";
    return unfinished(
      baseReport,
      timedOut ? "timeout" : "error",
      failure?.firstEventMs ?? null,
      error instanceof Error ? error.message : String(error),
      null,
    );
  }
}

function unfinished(
  baseReport: Pick<CaseReport, "id" | "person" | "claim" | "expectedLabel" | "verdicts" | "evaluates" | "criterion">,
  status: CaseStatus,
  firstEventMs: number | null,
  error: string | null,
  resultMs: number | null,
): CaseReport {
  return {
    ...baseReport,
    status,
    actual: null,
    explanation: null,
    conclusion: null,
    sentences: [],
    citedReference: null,
    sources: [],
    entity: null,
    firstEventMs,
    resultMs,
    error,
  };
}

async function verify(query: string, hojaVidaId: string): Promise<Verified> {
  const started = performance.now();
  let firstEventMs: number | null = null;
  try {
    const response = await fetch(`${base}/fact-check/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-key": randomBytes(24).toString("hex"),
      },
      body: JSON.stringify({ query, hojaVidaId }),
      signal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new VerifyFailure(body.slice(0, 300), "error", null, null);
    }
    const found = await readResult(response, started, (elapsed) => {
      firstEventMs = elapsed;
    });
    if (!found) throw new VerifyFailure("La verificación no devolvió resultado", "error", firstEventMs, null);
    const payload = JSON.parse(found.data) as {
      message?: string;
      conclusion?: string;
      verdicts?: VerdictRow[];
      sources?: SourcePayload[];
      entities?: EntityPayload[];
    };
    if (found.event === "error") {
      throw new VerifyFailure(payload.message ?? "No se pudo verificar", "error", found.firstEventMs, found.resultMs);
    }
    return {
      firstEventMs: found.firstEventMs,
      resultMs: found.resultMs,
      conclusion: payload.conclusion ?? "",
      verdicts: payload.verdicts ?? [],
      sources: payload.sources ?? [],
      entities: payload.entities ?? [],
    };
  } catch (error) {
    if (error instanceof VerifyFailure) throw error;
    if (isTimeoutError(error)) {
      throw new VerifyFailure(error instanceof Error ? error.message : "Tiempo de espera agotado", "timeout", firstEventMs, null);
    }
    throw error;
  }
}

async function readResult(
  response: Response,
  started: number,
  onFirst: (elapsed: number) => void,
): Promise<{ event: string; data: string; firstEventMs: number; resultMs: number } | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: { buffer: string; firstEventMs: number | null; result: { event: string; data: string; resultMs: number } | null } = {
    buffer: "",
    firstEventMs: null,
    result: null,
  };
  const take = (flush: boolean) => {
    const blocks = state.buffer.split("\n\n");
    state.buffer = flush ? "" : (blocks.pop() ?? "");
    for (const block of blocks) {
      const parsed = parseEvent(block);
      if (!parsed) continue;
      if (state.firstEventMs === null) {
        state.firstEventMs = performance.now() - started;
        onFirst(state.firstEventMs);
      }
      if (parsed.event === "result" || parsed.event === "error") {
        state.result = { ...parsed, resultMs: performance.now() - started };
      }
    }
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    state.buffer = `${state.buffer}${decoder.decode(chunk.value, { stream: true })}`.replace(/\r\n/g, "\n");
    take(false);
  }
  state.buffer = `${state.buffer}${decoder.decode()}`.replace(/\r\n/g, "\n");
  take(true);
  const result = state.result;
  const firstEventMs = state.firstEventMs;
  if (!result || firstEventMs === null) return null;
  return { event: result.event, data: result.data, firstEventMs, resultMs: result.resultMs };
}

function parseEvent(block: string): { event: string; data: string } | null {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) return null;
  return { event, data };
}

function collectSources(rows: VerdictRow[], extra: SourcePayload[]): CitedSource[] {
  const seen = new Set<string>();
  const sources: CitedSource[] = [];
  for (const source of [...rows.flatMap((row) => row.sources ?? []), ...extra]) {
    const key = source.url || `${source.title ?? ""}|${source.snippet ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      id: `s${sources.length + 1}`,
      title: source.title ?? "",
      url: source.url ?? null,
      snippet: source.snippet ?? "",
      origin: source.origin ?? "",
      role: source.role ?? "",
    });
  }
  return sources;
}

function entityOf(entities: EntityPayload[]): ReturnedEntity | null {
  const entity = entities[0];
  if (!entity?.id || !entity.nombre) return null;
  return { id: entity.id, nombre: entity.nombre, cargo: entity.cargo ?? "" };
}

function reportMarkdown(summary: RunSummary): string {
  const when = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date());
  const agreement = summary.scored === 0 ? 0 : Math.round((summary.hits / summary.scored) * 1000) / 10;
  const withReference = summary.cases.filter((item) => item.citedReference !== null);
  const cited = withReference.filter((item) => item.citedReference).length;
  const lines = [
    "# Resultados de la evaluación",
    "",
    `Corrida del ${when}, contra \`${base}\`. Se contrastaron ${summary.total} afirmaciones ya etiquetadas a mano. Concurrencia ${summary.concurrency}. Tope por caso: ${summary.timeoutMs / 1000} s.`,
    "",
    "## Resumen",
    "",
    `El sistema coincidió con la etiqueta en ${summary.hits} de ${summary.scored} casos que pudieron juzgarse. El acuerdo es ${agreement} %.`,
    "",
    `- Casos corridos: ${summary.total}`,
    `- Coincidencias: ${summary.hits}`,
    `- Diferencias: ${summary.scored - summary.hits}`,
    `- Sin candidato en el padrón: ${summary.skipped}`,
    `- Errores de la corrida: ${summary.errors}`,
    `- Tiempos de espera agotados: ${summary.timeouts}`,
    `- Cita de la página de referencia: ${cited} de ${withReference.length} casos que tenían una URL de contraste`,
    `- Tiempo hasta el primer evento: p50 ${milliseconds(summary.firstEventMs.p50)}, p95 ${milliseconds(summary.firstEventMs.p95)} (${summary.firstEventMs.n} casos)`,
    `- Tiempo hasta el resultado: p50 ${milliseconds(summary.resultMs.p50)}, p95 ${milliseconds(summary.resultMs.p95)} (${summary.resultMs.n} casos)`,
    "",
    "Una coincidencia quiere decir que el veredicto del sistema está entre los veredictos aceptados para ese caso. La etiqueta escrita a mano a veces usa otras palabras, por ejemplo «opinión» o «conclusión inválida».",
    "",
    "La verificación respaldada, el macro-F1 y la calidad de las citas salen de `eval:score`, después de que dos personas llenen la rúbrica. Esta corrida no adjudica RLA04, DU05 ni CB05.",
    "",
    "## Tabla",
    "",
    "| Caso | Persona | Qué se pone a prueba | Etiqueta | Sistema | Acuerdo | Citó la referencia |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...summary.cases.map(
      (item) =>
        `| ${item.id} | ${cell(item.person)} | ${cell(item.evaluates)} | ${cell(item.expectedLabel)} | ${cell(item.actual ?? item.status)} | ${agreementLabel(item.status)} | ${referenceLabel(item.citedReference)} |`,
    ),
    "",
    "## Lectura de cada caso",
    "",
  ];
  for (const item of summary.cases) {
    lines.push(`### ${item.id}. ${item.person}`, "");
    lines.push(`Afirmación: ${item.claim}`, "");
    lines.push(`Se pone a prueba: ${item.evaluates}. Criterio: ${item.criterion}`, "");
    lines.push(`Etiqueta esperada: ${item.expectedLabel}. Veredicto del sistema: ${item.actual ?? "no hubo"}. ${agreementLabel(item.status)}.`);
    lines.push(`Primer evento: ${milliseconds(item.firstEventMs)}. Resultado: ${milliseconds(item.resultMs)}.`);
    if (item.entity) {
      lines.push(`Candidato devuelto: ${item.entity.nombre}.`);
    }
    if (item.citedReference !== null) {
      lines.push(
        item.citedReference
          ? "La respuesta citó la misma página usada como referencia del caso."
          : "La respuesta no citó la página usada como referencia del caso.",
      );
    }
    const reading = plain(item.explanation ?? item.error ?? "");
    if (reading) {
      lines.push("", reading);
    }
    if (item.sources.length > 0) {
      lines.push("", "Pasajes citados:");
      for (const source of item.sources) {
        lines.push(`- ${source.title || "Sin título"}: ${plain(source.snippet) || "sin fragmento"}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function milliseconds(value: number | null): string {
  if (value === null) return "sin datos";
  return `${Math.round(value)} ms`;
}

function agreementLabel(status: CaseReport["status"]): string {
  if (status === "coincide") return "Coincide";
  if (status === "difiere") return "No coincide";
  if (status === "sin_candidato") return "Sin candidato";
  if (status === "timeout") return "Tiempo agotado";
  return "Error";
}

function referenceLabel(value: boolean | null): string {
  if (value === null) return "No aplica";
  return value ? "Sí" : "No";
}

function cell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function plain(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function samePage(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") && a.pathname === b.pathname;
  } catch {
    return left === right;
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("/run-cases.js") || entry?.endsWith("/run-cases.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
