import { Component, inject, signal } from "@angular/core";
import type { HistoryItem } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { markdownAHtml } from "../markdown";
import { SessionService } from "../session.service";

@Component({
  selector: "app-history",
  templateUrl: "./consultar-historial.html",
})
export class ConsultarHistorialPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  rows = signal<HistoryItem[]>([]);
  error = signal("");
  formato = markdownAHtml;

  constructor() {
    this.api.history(this.session.id()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set("No se pudo leer el historial de esta sesión."),
    });
  }
}
