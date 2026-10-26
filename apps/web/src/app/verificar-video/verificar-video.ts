import { Component, signal } from "@angular/core";
import type { AfirmacionDeVideo, VerificarVideoResult } from "@tumi/contracts";
import { ApiService } from "../api.service";
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
  transcripcion = signal("");
  busy = signal(false);
  error = signal("");
  nodes = signal<NodeState[]>([]);
  afirmaciones = signal<AfirmacionDeVideo[]>([]);

  constructor(
    private readonly api: ApiService,
    private readonly session: SessionService,
  ) {}

  async submit(): Promise<void> {
    const transcripcion = this.transcripcion().trim();
    if (transcripcion.length < 3 || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.nodes.set([]);
    this.afirmaciones.set([]);
    try {
      await this.api.streamVideo(transcripcion, this.session.id(), (event) => {
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
          this.afirmaciones.set(result.afirmaciones);
        }
        if (event.event === "error") {
          const payload = event.data as { message: string };
          this.error.set(payload.message);
        }
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Error de red");
    } finally {
      this.busy.set(false);
    }
  }
}
