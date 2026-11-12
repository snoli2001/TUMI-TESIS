import { Component, inject, signal } from "@angular/core";
import { DomSanitizer, type SafeResourceUrl } from "@angular/platform-browser";
import type { AfirmacionDeVideo, ClaimVerdict, VerificarVideoResult } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { citaDelPlan, etiquetaEstado, etiquetaOrigen, etiquetaPaso, etiquetaPostura, fuentesDeContraste, fuentesDePrueba, lecturaClasificador } from "../etiquetas";
import { markdownAHtml } from "../markdown";
import { SessionService } from "../session.service";

interface NodeState {
  node: string;
  status: string;
}

@Component({
  selector: "app-verificar-video",
  templateUrl: "./verificar-video.html",
  styleUrl: "../verificar/verificar-afirmacion.scss",
})
export class VerificarVideoPage {
  url = signal("");
  transcripcion = signal("");
  busy = signal(false);
  error = signal("");
  nodes = signal<NodeState[]>([]);
  afirmaciones = signal<AfirmacionDeVideo[]>([]);
  videoId = signal<string | null>(null);
  titulo = signal<string | null>(null);
  segundo = signal(0);

  etiquetaPaso = etiquetaPaso;
  etiquetaEstado = etiquetaEstado;
  etiquetaOrigen = etiquetaOrigen;
  etiquetaPostura = etiquetaPostura;
  prueba = fuentesDePrueba;
  contraste = fuentesDeContraste;
  cita = citaDelPlan;
  lectura = (verdict: ClaimVerdict) => lecturaClasificador(verdict.decisions);
  formato = markdownAHtml;

  private readonly sanitizer = inject(DomSanitizer);

  constructor(
    private readonly api: ApiService,
    private readonly session: SessionService,
  ) {}

  marco(): SafeResourceUrl | null {
    const id = this.videoId();
    if (!id) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?start=${this.segundo()}&rel=0`,
    );
  }

  ir(inicio: number | null): void {
    if (inicio === null) return;
    this.segundo.set(inicio);
  }

  async submit(): Promise<void> {
    const url = this.url().trim();
    const transcripcion = this.transcripcion().trim();
    if ((url.length < 12 && transcripcion.length < 3) || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.nodes.set([]);
    this.afirmaciones.set([]);
    this.videoId.set(null);
    this.titulo.set(null);
    this.segundo.set(0);
    try {
      await this.api.streamVideo(
        url ? { url } : { transcripcion },
        this.session.id(),
        (event) => {
          if (event.event === "node") {
            const node = event.data as NodeState;
            this.nodes.update((current) => {
              const next = current.filter((item) => item.node !== node.node);
              return [...next, node];
            });
          }
          if (event.event === "result") {
            const result = event.data as VerificarVideoResult;
            this.session.remember(result.sessionId);
            this.videoId.set(result.videoId);
            this.titulo.set(result.titulo);
            this.afirmaciones.set(result.afirmaciones);
            const primero = result.afirmaciones.find((item) => item.inicioSeg !== null);
            if (primero?.inicioSeg !== null && primero?.inicioSeg !== undefined) {
              this.segundo.set(primero.inicioSeg);
            }
          }
          if (event.event === "error") {
            const payload = event.data as { message: string };
            this.error.set(payload.message);
          }
        },
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Error de red");
    } finally {
      this.busy.set(false);
    }
  }
}
