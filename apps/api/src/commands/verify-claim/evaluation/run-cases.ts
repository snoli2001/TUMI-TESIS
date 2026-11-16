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
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ total: summary.total, scored: summary.scored, hits: summary.hits, output }));
}

async function runCase(item: VerificationCase): Promise<CaseReport> {
  const baseReport = {
    id: item.id,
    person: item.person,
    claim: item.claim,
    expectedLabel: item.expectedLabel,
    verdicts: item.verdicts,
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
