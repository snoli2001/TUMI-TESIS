import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import type {
  CandidateProfile,
  CandidateSummary,
  FactCheckResult,
  HistoryItem,
} from "@tumi/contracts";

export interface StreamEvent {
  event: string;
  data: unknown;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  candidates(q: string) {
    return this.http.get<CandidateSummary[]>("/api/candidates", { params: { q } });
  }

  candidate(id: string) {
    return this.http.get<CandidateProfile>(`/api/candidates/${id}`);
  }

  history(sessionId: string) {
    return this.http.get<HistoryItem[]>("/api/history", { params: { sessionId } });
  }

  streamFactCheck(query: string, sessionId: string, onEvent: (event: StreamEvent) => void) {
    return streamPost("/api/fact-check/stream", { query, sessionId }, onEvent);
  }

  streamVideo(transcripcion: string, sessionId: string, onEvent: (event: StreamEvent) => void) {
    return streamPost("/api/verificar-video/stream", { transcripcion, sessionId }, onEvent);
  }
}

async function streamPost(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "No se pudo abrir la verificación");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const event = parseSse(chunk);
      if (event) onEvent(event);
    }
  }
}

function parseSse(chunk: string): StreamEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) };
}

export type { FactCheckResult };
