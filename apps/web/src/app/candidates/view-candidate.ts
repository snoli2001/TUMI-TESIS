import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { CandidateProfile, HojaVidaInmueble, HojaVidaVehiculo, PlanPropuesta } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { VerifyCandidate } from "./verify-candidate";

@Component({
  selector: "app-candidate-detail",
  imports: [RouterLink, VerifyCandidate],
  templateUrl: "./view-candidate.html",
})
export class ViewCandidatePage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  profile = signal<CandidateProfile | null>(null);
  error = signal("");
  tab = signal<"hoja" | "plan" | "verificar">("hoja");
  photoBroken = signal(false);
  logoBroken = signal(false);

  constructor() {
    const id = this.route.snapshot.paramMap.get("id") ?? "";
    this.api.candidate(id).subscribe({
      next: (profile) => this.profile.set(profile),
      error: () => this.error.set("No encontramos a esa candidatura."),
    });
  }

  initials(name: string): string {
    const letters = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase();
    return letters || "?";
  }

  years(desde: string | null, hasta: string | null): string {
    if (desde && hasta) return `${desde} – ${hasta}`;
    if (desde) return `Desde ${desde}`;
    if (hasta) return `Hasta ${hasta}`;
    return "";
  }

  join(parts: Array<string | null>): string {
    return parts.filter((part) => Boolean(part)).join(" · ");
  }

  money(value: string | null): string {
    if (!value) return "";
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) return value;
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  studySubtitle(carrera: string | null, anio: string | null): string {
    return [carrera, anio ? `Bachiller ${anio}` : null].filter(Boolean).join(" · ");
  }

  workSubtitle(centro: string | null, lugar: string | null, desde: string | null, hasta: string | null): string {
    return [centro, lugar, this.years(desde, hasta)].filter(Boolean).join(" · ");
  }

  hasPersonal(profile: CandidateProfile): boolean {
    const hoja = profile.hojaVida;
    return Boolean(hoja?.sexo || hoja?.fechaNacimiento || hoja?.cargo);
  }

  hasBasicEducation(profile: CandidateProfile): boolean {
    const hoja = profile.hojaVida;
    return hoja?.primariaCompleta != null || hoja?.secundariaCompleta != null;
  }

  hasAssets(profile: CandidateProfile): boolean {
    const hoja = profile.hojaVida;
    return Boolean(hoja && (hoja.inmuebles.length || hoja.vehiculos.length));
  }

  hasSentences(profile: CandidateProfile): boolean {
    const hoja = profile.hojaVida;
    return Boolean(hoja && (hoja.sentenciasPenales.length || hoja.sentenciasObligacion.length));
  }

  hasProposal(proposal: PlanPropuesta): boolean {
    return Boolean(proposal.problema || proposal.objetivo || proposal.indicador || proposal.meta);
  }

  propertyLabel(row: HojaVidaInmueble): string {
    return [row.direccion, row.autovaluo ? this.money(row.autovaluo) : null].filter(Boolean).join(" · ");
  }

  vehicleLabel(row: HojaVidaVehiculo): string {
    return [row.placa, row.valor ? this.money(row.valor) : null].filter(Boolean).join(" · ");
  }
}
