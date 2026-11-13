import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CandidateSummary, GeoItem } from "@tumi/contracts";
import { ApiService } from "../api.service";

const DISTRITO_KEY = "tumi.distrito";
const ORDEN_CARGO = [
  "GOBERNADOR REGIONAL",
  "VICEGOBERNADOR REGIONAL",
  "CONSEJERO REGIONAL",
  "ALCALDE PROVINCIAL",
  "REGIDOR PROVINCIAL",
  "ALCALDE DISTRITAL",
  "REGIDOR DISTRITAL",
];

@Component({
  selector: "app-home",
  imports: [RouterLink],
  templateUrl: "./home.html",
})
export class HomePage {
  private readonly api = inject(ApiService);

  departamento = signal("");
  provincia = signal("");
  distrito = signal("");
  departments = signal<GeoItem[]>([]);
  provinces = signal<GeoItem[]>([]);
  districts = signal<GeoItem[]>([]);
  confirmed = signal(false);
  cargo = signal("");
  rows = signal<CandidateSummary[]>([]);
  loading = signal(false);
  error = signal("");
  broken = signal<Record<string, true>>({});

  label = computed(() => {
    const district = this.districts().find((row) => row.code === this.distrito())?.name;
    const province = this.provinces().find((row) => row.code === this.provincia())?.name;
    const department = this.departments().find((row) => row.code === this.departamento())?.name;
    if (!district || !province || !department) return "";
    return `${district}, ${province} · ${department}`;
  });

  contiendas = computed(() => {
    const groups = new Map<string, CandidateSummary[]>();
    for (const row of this.rows()) {
      const key = row.cargo || "Otra contienda";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()]
      .map(([nombre, candidatos]) => ({ nombre, candidatos }))
      .sort((left, right) => ordenCargo(left.nombre) - ordenCargo(right.nombre));
  });

  visibles = computed(() => {
    const selected = this.cargo();
    const match = this.contiendas().find((contest) => contest.nombre === selected);
    return match?.candidatos ?? this.contiendas()[0]?.candidatos ?? [];
  });

  constructor() {
    this.api.departments().subscribe({
      next: (rows) => {
        this.departments.set(rows);
        this.restore();
      },
      error: () => this.error.set("No se pudo cargar el mapa de distritos."),
    });
  }

  setDepartamento(code: string): void {
    this.departamento.set(code);
    this.provincia.set("");
    this.distrito.set("");
    this.provinces.set([]);
    this.districts.set([]);
    if (!code) return;
    this.api.provinces(code).subscribe({
      next: (rows) => {
        if (this.departamento() === code) this.provinces.set(rows);
      },
    });
  }

  setProvincia(code: string): void {
    this.provincia.set(code);
    this.distrito.set("");
    this.districts.set([]);
    if (!code) return;
    this.api.districts(code).subscribe({
      next: (rows) => {
        if (this.provincia() === code) this.districts.set(rows);
      },
    });
  }

  confirm(): void {
    if (!this.distrito()) return;
    this.confirmed.set(true);
    this.remember();
    this.load();
  }

  changeDistrict(): void {
    this.confirmed.set(false);
    this.rows.set([]);
    this.cargo.set("");
  }

  chooseCargo(nombre: string): void {
    this.cargo.set(nombre);
  }

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  }

  markBroken(id: string): void {
    this.broken.update((current) => ({ ...current, [id]: true }));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set("");
    this.api
      .candidates("", {
        departamento: this.departamento(),
        provincia: this.provincia(),
        distrito: this.distrito(),
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.resultados);
          const cargos = new Set(result.resultados.map((row) => row.cargo));
          this.cargo.set(ORDEN_CARGO.find((cargo) => cargos.has(cargo)) ?? result.resultados[0]?.cargo ?? "");
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.error.set("No se pudo consultar el padrón de esta elección.");
        },
      });
  }

  private remember(): void {
    localStorage.setItem(
      DISTRITO_KEY,
      JSON.stringify({
        departamento: this.departamento(),
        provincia: this.provincia(),
        distrito: this.distrito(),
      }),
    );
  }

  private restore(): void {
    const raw = localStorage.getItem(DISTRITO_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { departamento: string; provincia: string; distrito: string };
      if (!saved.departamento || !saved.provincia || !saved.distrito) return;
      this.departamento.set(saved.departamento);
      this.api.provinces(saved.departamento).subscribe({
        next: (rows) => this.provinces.set(rows),
      });
      this.provincia.set(saved.provincia);
      this.api.districts(saved.provincia).subscribe({
        next: (rows) => this.districts.set(rows),
      });
      this.distrito.set(saved.distrito);
      this.confirmed.set(true);
      this.load();
    } catch {
      localStorage.removeItem(DISTRITO_KEY);
    }
  }
}

function ordenCargo(cargo: string): number {
  const index = ORDEN_CARGO.indexOf(cargo);
  return index === -1 ? ORDEN_CARGO.length : index;
}
