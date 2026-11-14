import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { catchError, of, throwError } from "rxjs";
import type {
  CandidateProfile,
  CandidateSearchFilters,
  CandidateSearchResult,
  FactCheckResult,
  GeoItem,
  HistoryItem,
} from "@tumi/contracts";
import { SessionService } from "./session.service";

export interface StreamEvent {
  event: string;
  data: unknown;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly session = inject(SessionService);

  constructor(private readonly http: HttpClient) {}

  candidates(q: string, filters: CandidateSearchFilters = {}) {
    const params: Record<string, string> = {};
    if (q.trim()) params["q"] = q.trim();
    if (filters.departamento) params["departamento"] = filters.departamento;
    if (filters.provincia) params["provincia"] = filters.provincia;
    if (filters.distrito) params["distrito"] = filters.distrito;
    if (filters.organizacion) params["organizacion"] = filters.organizacion;
    if (filters.sexo) params["sexo"] = filters.sexo;
    if (filters.orden === "organizacion") params["orden"] = "organizacion";
    if (filters.experienciaElectoral) params["experienciaElectoral"] = "true";
    if (filters.sinSentencias) params["sinSentencias"] = "true";
    if (filters.primaria) params["primaria"] = "true";
    if (filters.secundaria) params["secundaria"] = "true";
    if (filters.superiores) params["superiores"] = "true";
    if (filters.trabajo) params["trabajo"] = "true";
    return this.http.get<CandidateSearchResult>("/api/candidates", { params });
  }

  departments() {
    return this.http.get<GeoItem[]>("/api/geo/departments");
  }

  provinces(departmentCode: string) {
    return this.http.get<GeoItem[]>("/api/geo/provinces", { params: { departmentCode } });
  }

  districts(provinceCode: string) {
    return this.http.get<GeoItem[]>("/api/geo/districts", { params: { provinceCode } });
  }

  candidate(id: string) {
    return this.http.get<CandidateProfile>(`/api/candidates/${id}`);
  }

  history(sessionId: string) {
    return this.http.get<HistoryItem[]>("/api/history", {
      params: { sessionId },
      headers: this.session.headers(),
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.session.rotate();
          return of([]);
        }
        return throwError(() => error);
      }),
    );
  }

  streamFactCheck(
    query: string,
    sessionId: string,
    onEvent: (event: StreamEvent) => void,
    hojaVidaId?: string,
  ) {
    return this.stream("/api/fact-check/stream", { query, sessionId, hojaVidaId }, onEvent);
  }

  streamVideo(
    entrada: { url?: string; transcripcion?: string },
    sessionId: string,
    onEvent: (event: StreamEvent) => void,
  ) {
    return this.stream("/api/verificar-video/stream", { ...entrada, sessionId }, onEvent);
  }

  uploadDocument(hojaVidaId: string, file: File) {
    return gestorFetch<{ id: string; status: string; available: boolean }>("/api/gestor/documentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Hoja-Vida-Id": hojaVidaId,
        "X-Filename": file.name,
      },
      body: file,
    });
  }

  listDocuments(hojaVidaId: string) {
    return gestorFetch<DocumentStatus[]>(`/api/gestor/documentos?hojaVidaId=${encodeURIComponent(hojaVidaId)}`);
  }

  documentStatus(id: string) {
    return gestorFetch<DocumentStatus>(`/api/gestor/documentos/${id}`);
  }

  deleteDocument(id: string) {
    return gestorFetch<{ id: string; status: string }>(`/api/gestor/documentos/${id}`, { method: "DELETE" });
  }

  applyRetention() {
    return gestorFetch<{ sessions: number; documents: number }>("/api/gestor/retencion", { method: "POST" });
  }

  gestorSession() {
    return gestorFetch<GestorProfile>("/api/gestor/sesion");
  }

  gestorLogin(email: string, password: string) {
    return gestorFetch<GestorProfile>("/api/gestor/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  gestorLogout() {
    return gestorFetch<{ ok: boolean }>("/api/gestor/sesion", { method: "DELETE" });
  }

  createGestor(email: string, name: string, password: string) {
    return gestorFetch<GestorProfile>("/api/gestor/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
  }

  private stream(path: string, body: Record<string, unknown>, onEvent: (event: StreamEvent) => void, attempt = 0): Promise<void> {
    const sessionId = attempt === 0 ? String(body["sessionId"] ?? this.session.id()) : this.session.id();
    return streamPost(path, { ...body, sessionId }, onEvent, this.session.headers()).catch((error: unknown) => {
      if (attempt === 0 && error instanceof ApiError && error.status === 401) {
        this.session.rotate();
        return this.stream(path, { ...body, sessionId: this.session.id() }, onEvent, 1);
      }
      throw error;
    });
  }
}

export interface DocumentStatus {
  id: string;
  hojaVidaId: string;
  originalName: string;
  status: string;
  pageCount: number | null;
  available: boolean;
}

export interface GestorProfile {
  id: string;
  email: string;
  name: string;
}

async function streamPost(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(payload?.message ?? "No se pudo abrir la verificación", response.status);
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

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function gestorFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new ApiError(payload?.message ?? "No se pudo completar la operación", response.status);
  return payload as T;
}

export type { FactCheckResult };
