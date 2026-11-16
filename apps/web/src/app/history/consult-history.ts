import { Component, inject, signal } from "@angular/core";
import type { HistoryItem } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { markdownToHtml } from "../markdown";
import { SessionService } from "../session.service";

@Component({
  selector: "app-history",
  templateUrl: "./consult-history.html",
})
export class ConsultHistoryPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  rows = signal<HistoryItem[]>([]);
  error = signal("");
  asHtml = markdownToHtml;

  constructor() {
    this.api.history(this.session.id()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set("No se pudo leer el historial de esta sesión."),
    });
  }
}
