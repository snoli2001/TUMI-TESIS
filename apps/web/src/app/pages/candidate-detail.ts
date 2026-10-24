import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { CandidateProfile } from "@tumi/contracts";
import { ApiService } from "../api.service";

@Component({
  selector: "app-candidate-detail",
  imports: [RouterLink],
  templateUrl: "./candidate-detail.html",
})
export class CandidateDetailPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  profile = signal<CandidateProfile | null>(null);
  error = signal("");

  constructor() {
    const id = this.route.snapshot.paramMap.get("id") ?? "";
    this.api.candidate(id).subscribe({
      next: (profile) => this.profile.set(profile),
      error: () => this.error.set("No encontramos a esa candidatura."),
    });
  }
}
