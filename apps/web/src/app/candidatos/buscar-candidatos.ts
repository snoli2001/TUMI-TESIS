import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CandidateSearchFilters, CandidateSummary, GeoItem } from "@tumi/contracts";
import { ApiService } from "../api.service";

type ChipId =
  | "departamento"
  | "provincia"
  | "distrito"
  | "organizacion"
  | "sexo"
  | "experienciaElectoral"
  | "sinSentencias"
  | "primaria"
  | "secundaria"
  | "superiores"
  | "trabajo";

type FlagId = Exclude<ChipId, "organizacion" | "sexo">;

@Component({
  selector: "app-candidates",
  imports: [RouterLink],
  templateUrl: "./buscar-candidatos.html",
})
export class BuscarCandidatosPage {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filtersDialog = viewChild<ElementRef<HTMLDialogElement>>("filtersDialog");
  private request = 0;

  q = signal("");
  departamento = signal("");
  provincia = signal("");
  distrito = signal("");
  departments = signal<GeoItem[]>([]);
  provinces = signal<GeoItem[]>([]);
  districts = signal<GeoItem[]>([]);
  organizacion = signal("");
  sexo = signal("");
  orden = signal<"nombre" | "organizacion">("nombre");
  experienciaElectoral = signal(false);
  sinSentencias = signal(false);
  primaria = signal(false);
  secundaria = signal(false);
  superiores = signal(false);
  trabajo = signal(false);
  rows = signal<CandidateSummary[]>([]);
  total = signal(0);
  organizaciones = signal<string[]>([]);
  sexos = signal<string[]>([]);
  searched = signal(false);
  loading = signal(false);
  error = signal("");
  broken = signal<Record<string, true>>({});

  orgOptions = computed(() => withSelected(this.organizaciones(), this.organizacion()));
  sexOptions = computed(() => withSelected(this.sexos(), this.sexo()));
  chips = computed(() => this.activeChips());
  filtersReady = computed(() => this.q().trim().length >= 3 || this.departamento().length > 0);

  constructor() {
    this.api.departments().subscribe({
      next: (rows) => this.departments.set(rows),
    });
    afterNextRender(() => {
      const media = window.matchMedia("(min-width: 800px)");
      const sync = () => this.syncFiltersDialog(media.matches);
      media.addEventListener("change", sync);
      this.destroyRef.onDestroy(() => media.removeEventListener("change", sync));
      sync();
    });
  }

  search(): void {
    const q = this.q().trim();
    const id = ++this.request;
    this.error.set("");
    if (q.length < 3 && !this.departamento()) {
      this.rows.set([]);
      this.total.set(0);
      this.organizaciones.set([]);
      this.sexos.set([]);
      this.searched.set(false);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.candidates(q.length >= 3 ? q : "", this.filters()).subscribe({
      next: (result) => {
        if (id !== this.request) return;
        this.rows.set(result.resultados);
        this.total.set(result.total);
        this.organizaciones.set(result.organizaciones);
        this.sexos.set(result.sexos);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: () => {
        if (id !== this.request) return;
        this.rows.set([]);
        this.total.set(0);
        this.loading.set(false);
        this.error.set("No se pudo consultar el padrón.");
      },
    });
  }

  setDepartamento(code: string): void {
    this.departamento.set(code);
    this.provincia.set("");
    this.distrito.set("");
    this.provinces.set([]);
    this.districts.set([]);
    if (code) {
      this.api.provinces(code).subscribe({
        next: (rows) => {
          if (this.departamento() === code) this.provinces.set(rows);
        },
      });
    }
    this.search();
  }

  setProvincia(code: string): void {
    this.provincia.set(code);
    this.distrito.set("");
    this.districts.set([]);
    if (code) {
      this.api.districts(code).subscribe({
        next: (rows) => {
          if (this.provincia() === code) this.districts.set(rows);
        },
      });
    }
    this.search();
  }

  setDistrito(code: string): void {
    this.distrito.set(code);
    this.search();
  }

  setOrganizacion(value: string): void {
    this.organizacion.set(value);
    this.search();
  }

  setSexo(value: string): void {
    this.sexo.set(value);
    this.search();
  }

  setOrden(value: string): void {
    this.orden.set(value === "organizacion" ? "organizacion" : "nombre");
    this.search();
  }

  setFlag(id: FlagId, checked: boolean): void {
    this.flagSignal(id).set(checked);
    this.search();
  }

  clearChip(id: ChipId): void {
    if (id === "departamento") this.setDepartamento("");
    else if (id === "provincia") this.setProvincia("");
    else if (id === "distrito") this.setDistrito("");
    else if (id === "organizacion") {
      this.organizacion.set("");
      this.search();
    } else if (id === "sexo") {
      this.sexo.set("");
      this.search();
    } else {
      this.flagSignal(id).set(false);
      this.search();
    }
  }

  clearFilters(): void {
    this.organizacion.set("");
    this.sexo.set("");
    this.orden.set("nombre");
    this.experienciaElectoral.set(false);
    this.sinSentencias.set(false);
    this.primaria.set(false);
    this.secundaria.set(false);
    this.superiores.set(false);
    this.trabajo.set(false);
    this.search();
  }

  openFilters(): void {
    this.filtersDialog()?.nativeElement.showModal();
  }

  closeFilters(): void {
    const dialog = this.filtersDialog()?.nativeElement;
    if (dialog?.open && dialog.matches(":modal")) dialog.close();
  }

  markBroken(id: string): void {
    this.broken.update((current) => ({ ...current, [id]: true }));
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  private filters(): CandidateSearchFilters {
    return {
      departamento: this.departamento(),
      provincia: this.provincia(),
      distrito: this.distrito(),
      organizacion: this.organizacion(),
      sexo: this.sexo(),
      orden: this.orden(),
      experienciaElectoral: this.experienciaElectoral(),
      sinSentencias: this.sinSentencias(),
      primaria: this.primaria(),
      secundaria: this.secundaria(),
      superiores: this.superiores(),
      trabajo: this.trabajo(),
    };
  }

  private flagSignal(id: FlagId) {
    if (id === "experienciaElectoral") return this.experienciaElectoral;
    if (id === "sinSentencias") return this.sinSentencias;
    if (id === "primaria") return this.primaria;
    if (id === "secundaria") return this.secundaria;
    if (id === "superiores") return this.superiores;
    return this.trabajo;
  }

  private activeChips(): Array<{ id: ChipId; label: string }> {
    const chips: Array<{ id: ChipId; label: string }> = [];
    const departamento = this.geoName(this.departments(), this.departamento());
    const provincia = this.geoName(this.provinces(), this.provincia());
    const distrito = this.geoName(this.districts(), this.distrito());
    if (departamento) chips.push({ id: "departamento", label: departamento });
    if (provincia) chips.push({ id: "provincia", label: provincia });
    if (distrito) chips.push({ id: "distrito", label: distrito });
    if (this.organizacion()) chips.push({ id: "organizacion", label: this.organizacion() });
    if (this.sexo()) chips.push({ id: "sexo", label: this.sexo() });
    if (this.experienciaElectoral()) chips.push({ id: "experienciaElectoral", label: "Experiencia electoral" });
    if (this.sinSentencias()) chips.push({ id: "sinSentencias", label: "Sin sentencias declaradas" });
    if (this.primaria()) chips.push({ id: "primaria", label: "Primaria completa" });
    if (this.secundaria()) chips.push({ id: "secundaria", label: "Secundaria completa" });
    if (this.superiores()) chips.push({ id: "superiores", label: "Estudios superiores" });
    if (this.trabajo()) chips.push({ id: "trabajo", label: "Experiencia laboral" });
    return chips;
  }

  private geoName(rows: GeoItem[], code: string): string {
    if (!code) return "";
    return rows.find((row) => row.code === code)?.name ?? code;
  }

  private syncFiltersDialog(wide: boolean): void {
    const dialog = this.filtersDialog()?.nativeElement;
    if (!dialog) return;
    if (wide) {
      if (dialog.open && dialog.matches(":modal")) dialog.close();
      if (!dialog.open) dialog.show();
      return;
    }
    if (dialog.open && !dialog.matches(":modal")) dialog.close();
  }
}

function withSelected(options: string[], selected: string): string[] {
  if (selected && !options.includes(selected)) return [selected, ...options];
  return options;
}

function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "?";
}
