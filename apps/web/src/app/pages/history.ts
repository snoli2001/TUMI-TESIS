import { Component, inject, signal } from "@angular/core";
import type { HistoryItem } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { SessionService } from "../session.service";

@Component({
  selector: "app-history",
  templateUrl: "./history.html",
})
export class HistoryPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  rows = signal<HistoryItem[]>([]);
  error = signal("");

  constructor() {
    this.api.history(this.session.id()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set("No se pudo leer el historial de esta sesión."),
    });
  }
}
