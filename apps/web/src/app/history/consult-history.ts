import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { HistoryItem } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { markdownToHtml } from "../markdown";
import { SessionService } from "../session.service";

const VERDICTS: Record<string, string> = {
  verdadero: "Verdadero",
  falso: "Falso",
  enganoso: "Engañoso",
  no_verificable: "No verificable",
};

@Component({
  selector: "app-history",
  imports: [RouterLink],
  templateUrl: "./consult-history.html",
  styleUrl: "./consult-history.scss",
})
export class ConsultHistoryPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly clock = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
  rows = signal<HistoryItem[]>([]);
  loading = signal(true);
  error = signal("");
  asHtml = markdownToHtml;

  constructor() {
    this.api.history(this.session.id()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set("No se pudo leer el historial de esta sesión.");
      },
    });
  }

  when(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : this.clock.format(date);
  }

  verdictLabel(verdict: string | null): string {
    if (!verdict) return "Sin veredicto";
    return VERDICTS[verdict] ?? verdict.replaceAll("_", " ");
  }

  officeLine(row: HistoryItem): string {
    const candidate = row.candidate;
    if (!candidate) return "";
    return [candidate.cargo, candidate.partido].filter((part) => part.trim()).join(" · ");
  }
}
