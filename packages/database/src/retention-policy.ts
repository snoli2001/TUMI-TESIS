export const WITHDRAWN_NOTE = " Documento retirado por la política de conservación.";

export function retentionDays(name: "CONSULTA_RETENTION_DAYS" | "DOCUMENT_RETENTION_DAYS", fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function retentionCutoff(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isPastRetention(createdAt: Date, days: number, now: Date): boolean {
  return createdAt.getTime() < retentionCutoff(days, now).getTime();
}

export function markWithdrawnPayload(value: unknown, documentId: string): unknown {
  if (Array.isArray(value)) return value.map((item) => markWithdrawnPayload(item, documentId));
  if (!value || typeof value !== "object") return value;
  const record = { ...(value as Record<string, unknown>) };
  if (
    typeof record.id === "string" &&
    record.id.includes(documentId) &&
    typeof record.snippet === "string" &&
    !record.snippet.includes(WITHDRAWN_NOTE.trim())
  ) {
    record.snippet = `${record.snippet}${WITHDRAWN_NOTE}`;
  }
  for (const key of Object.keys(record)) {
    if (key === "id" || key === "snippet") continue;
    record[key] = markWithdrawnPayload(record[key], documentId);
  }
  return record;
}
