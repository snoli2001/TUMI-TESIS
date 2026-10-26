import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CandidateSummary } from "@tumi/contracts";
import { ApiService } from "../api.service";

@Component({
  selector: "app-candidates",
  imports: [RouterLink],
  templateUrl: "./buscar-candidatos.html",
})
export class BuscarCandidatosPage {
  private readonly api = inject(ApiService);
  q = signal("");
  rows = signal<CandidateSummary[]>([]);
  error = signal("");

  search(): void {
    const q = this.q().trim();
    this.error.set("");
    if (q.length < 3) {
      this.rows.set([]);
      return;
    }
    this.api.candidates(q).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set("No se pudo consultar el padrón."),
    });
  }
}
