import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { acceptsVerdict, VERIFICATION_CASES, type VerificationCase } from "./cases";

interface VerdictRow {
  claim: string;
  verdict: string;
  check?: string;
  explanation: string;
  sources: Array<{ title: string; url: string | null; role: string }>;
}

interface CaseReport {
  id: string;
  person: string;
  claim: string;
  expectedLabel: string;
  verdicts: string[];
  evaluates: string;
  criterion: string;
  status: "coincide" | "difiere" | "sin_candidato" | "error";
  actual: string | null;
  explanation: string | null;
  citedReference: boolean | null;
  sources: string[];
  error: string | null;
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
  const hits = scored.filter((item) => item.status === "coincide").length;
  const summary = {
    total: reports.length,
    scored: scored.length,
    hits,
    skipped: reports.filter((item) => item.status === "sin_candidato").length,
    errors: reports.filter((item) => item.status === "error").length,
    cases: reports,
  };
  const output = join(process.cwd(), "evaluation-output", "tumi-20.json");
  const report = join(process.cwd(), "evaluation-output", "tumi-20.md");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(summary, null, 2));
  await writeFile(report, reportMarkdown(summary));
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
    return { ...baseReport, status: "sin_candidato", actual: null, explanation: null, citedReference: null, sources: [], error: null };
  }
  try {
    const result = await verify(item.claim, item.hojaVidaId);
    const chosen = result.verdicts.filter((verdict) => verdict.check === "truth");
    const rows = chosen.length > 0 ? chosen : result.verdicts;
    const actual = rows[0]?.verdict ?? null;
    const sources = [...rows.flatMap((verdict) => verdict.sources), ...result.sources]
      .map((source) => source.url)
      .filter((url): url is string => Boolean(url));
    const explanation = [rows[0]?.explanation, result.conclusion].find((text) => text && text.trim()) ?? "";
    return {
      ...baseReport,
      status: actual && acceptsVerdict(item, actual) ? "coincide" : "difiere",
      actual,
      explanation,
      citedReference: item.referenceUrl ? sources.some((url) => samePage(url, item.referenceUrl as string)) : null,
      sources: [...new Set(sources)],
      error: null,
    };
  } catch (error) {
    return {
      ...baseReport,
      status: "error",
      actual: null,
      explanation: null,
      citedReference: null,
      sources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verify(
  query: string,
  hojaVidaId: string,
): Promise<{ conclusion: string; verdicts: VerdictRow[]; sources: VerdictRow["sources"] }> {
  const response = await fetch(`${base}/fact-check/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-session-key": randomBytes(24).toString("hex"),
    },
    body: JSON.stringify({ query, hojaVidaId }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body.slice(0, 300));
  const result = body
    .split("\n\n")
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      return event && data ? { event, data } : null;
    })
    .find((item) => item?.event === "result" || item?.event === "error");
  if (!result) throw new Error("La verificación no devolvió resultado");
  const payload = JSON.parse(result.data) as {
    message?: string;
    conclusion?: string;
    verdicts?: VerdictRow[];
    sources?: VerdictRow["sources"];
  };
  if (result.event === "error") throw new Error(payload.message ?? "No se pudo verificar");
  return { conclusion: payload.conclusion ?? "", verdicts: payload.verdicts ?? [], sources: payload.sources ?? [] };
}

function reportMarkdown(summary: {
  total: number;
  scored: number;
  hits: number;
  skipped: number;
  errors: number;
  cases: CaseReport[];
}): string {
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
    `Corrida del ${when}, contra \`${base}\`. Se contrastaron ${summary.total} afirmaciones ya etiquetadas a mano.`,
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
    `- Cita de la página de referencia: ${cited} de ${withReference.length} casos que tenían una URL de contraste`,
    "",
    "Una coincidencia quiere decir que el veredicto del sistema está entre los veredictos aceptados para ese caso. La etiqueta escrita a mano a veces usa otras palabras, por ejemplo «opinión» o «conclusión inválida».",
    "",
    "## Tabla",
    "",
    "| Caso | Persona | Qué se pone a prueba | Etiqueta | Sistema | Acuerdo | Citó la referencia |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...summary.cases.map((item) =>
      `| ${item.id} | ${cell(item.person)} | ${cell(item.evaluates)} | ${cell(item.expectedLabel)} | ${cell(item.actual ?? item.status)} | ${agreementLabel(item.status)} | ${referenceLabel(item.citedReference)} |`,
    ),
    "",
    "## Lectura de cada caso",
    "",
  ];
  for (const item of summary.cases) {
    lines.push(`### ${item.id}. ${item.person}`);
    lines.push("");
    lines.push(`Afirmación: ${item.claim}`);
    lines.push("");
    lines.push(`Se pone a prueba: ${item.evaluates}. Criterio: ${item.criterion}`);
    lines.push("");
    lines.push(`Etiqueta esperada: ${item.expectedLabel}. Veredicto del sistema: ${item.actual ?? "no hubo"}. ${agreementLabel(item.status)}.`);
    if (item.citedReference !== null) {
      lines.push("");
      lines.push(
        item.citedReference
          ? "La respuesta citó la misma página usada como referencia del caso."
          : "La respuesta no citó la página usada como referencia del caso.",
      );
    }
    const reading = plain(item.explanation ?? item.error ?? "");
    if (reading) {
      lines.push("");
      lines.push(reading);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function agreementLabel(status: CaseReport["status"]): string {
  if (status === "coincide") return "Coincide";
  if (status === "difiere") return "No coincide";
  if (status === "sin_candidato") return "Sin candidato";
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
