import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CandidateSummary } from "@tumi/contracts";
import { ApiService } from "../api.service";

@Component({
  selector: "app-candidates",
  imports: [RouterLink],
  templateUrl: "./candidates.html",
})
export class CandidatesPage {
  private readonly api = inject(ApiService);
  rows = signal<CandidateSummary[]>([]);
  error = signal("");

  constructor() {
    this.api.candidates().subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set("No se pudo cargar el padrón de demostración."),
    });
  }
}
