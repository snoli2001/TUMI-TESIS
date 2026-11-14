import { Component, inject, signal } from "@angular/core";
import type { CandidateSummary } from "@tumi/contracts";
import { ApiService, type DocumentStatus, type GestorProfile } from "../api.service";

@Component({
  selector: "app-gestor",
  templateUrl: "./gestor.html",
  styleUrl: "./gestor.scss",
})
export class GestorPage {
  private readonly api = inject(ApiService);
  profile = signal<GestorProfile | null>(null);
  email = signal("");
  password = signal("");
  query = signal("");
  candidates = signal<CandidateSummary[]>([]);
  hojaVidaId = signal("");
  candidateLabel = signal("");
  files = signal<File[]>([]);
  documents = signal<DocumentStatus[]>([]);
  accountName = signal("");
  accountEmail = signal("");
  accountPassword = signal("");
  message = signal("");
  error = signal("");
  busy = signal(false);

  constructor() {
    void this.restore();
  }

  async restore(): Promise<void> {
    try {
      this.profile.set(await this.api.gestorSession());
    } catch {
      this.profile.set(null);
    }
  }

  async login(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      this.profile.set(await this.api.gestorLogin(this.email(), this.password()));
      this.password.set("");
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "No se pudo entrar");
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.api.gestorLogout().catch(() => undefined);
    this.profile.set(null);
    this.documents.set([]);
    this.hojaVidaId.set("");
  }

  search(): void {
    this.error.set("");
    this.api.candidates(this.query()).subscribe({
      next: (result) => this.candidates.set(result.resultados),
      error: () => this.error.set("No se pudo buscar candidatos."),
    });
  }

  async choose(candidate: CandidateSummary): Promise<void> {
    this.hojaVidaId.set(candidate.id);
    this.candidateLabel.set(`${candidate.nombre} · ${candidate.cargo}`);
    await this.loadDocuments();
  }

  pickFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.files.set([...(input.files ?? [])]);
  }

  async upload(): Promise<void> {
    const files = this.files();
    const hojaVidaId = this.hojaVidaId();
    if (files.length === 0 || !hojaVidaId || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.message.set("");
    try {
      for (const file of files) {
        const created = await this.api.uploadDocument(hojaVidaId, file);
        this.message.set(`${file.name} quedó en cola.`);
        await this.poll(created.id);
      }
      this.files.set([]);
      await this.loadDocuments();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "No se pudo cargar el PDF");
    } finally {
      this.busy.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.api.deleteDocument(id);
      this.message.set("Documento retirado. Las citas históricas quedan marcadas como retiradas.");
      await this.loadDocuments();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "No se pudo borrar el documento");
    } finally {
      this.busy.set(false);
    }
  }

  async retain(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const result = await this.api.applyRetention();
      this.message.set(`Retención aplicada: ${result.sessions} sesiones y ${result.documents} documentos.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "No se pudo aplicar la retención");
    } finally {
      this.busy.set(false);
    }
  }

  async createAccount(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const created = await this.api.createGestor(this.accountEmail(), this.accountName(), this.accountPassword());
      this.message.set(`Cuenta creada para ${created.email}.`);
      this.accountPassword.set("");
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "No se pudo crear la cuenta");
    } finally {
      this.busy.set(false);
    }
  }

  field(target: { set: (value: string) => void }, event: Event): void {
    target.set((event.target as HTMLInputElement).value);
  }

  private async loadDocuments(): Promise<void> {
    this.documents.set(await this.api.listDocuments(this.hojaVidaId()));
  }

  private async poll(id: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await this.api.documentStatus(id);
      this.documents.update((current) => [status, ...current.filter((item) => item.id !== status.id)]);
      if (status.status === "ready" || status.status === "failed") {
        this.message.set(
          status.available
            ? "El PDF ya se puede usar en las verificaciones de ese candidato."
            : "No se pudo leer el PDF. No queda disponible para verificaciones.",
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
