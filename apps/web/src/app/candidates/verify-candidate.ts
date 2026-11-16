import { Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from "@angular/core";
import type { ClaimVerdict, FactCheckResult, SourceRef } from "@tumi/contracts";
import { ApiService } from "../api.service";
import {
  checkQuestion,
  citationLabel,
  classifierReading,
  contrastedWith,
  deniesCaption,
  evidenceNote,
  firmnessCaption,
  firmnessWidth,
  verdictCertainty,
  contrastSources,
  documentName,
  primaryCitation,
  proofCitations,
  proofSources,
  sourceLinkText,
  supportsCaption,
  stanceLabel,
  statusLabel,
  stepLabel,
} from "../labels";
import { markdownToHtml } from "../markdown";
import { SessionService } from "../session.service";

interface NodeState {
  node: string;
  status: string;
}

interface ClaimImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_LIMIT_BYTES = 4 * 1024 * 1024;

@Component({
  selector: "app-verify-candidate",
  templateUrl: "./verify-candidate.html",
  styleUrl: "../verify-claim/verify-claim.scss",
})
export class VerifyCandidate {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>("file");
  private previewUrl = "";

  hojaVidaId = input.required<string>();
  nombre = input.required<string>();

  query = signal("");
  image = signal<ClaimImage | null>(null);
  imagePreview = signal("");
  busy = signal(false);
  error = signal("");
  nodes = signal<NodeState[]>([]);
  draft = signal("");
  result = signal<FactCheckResult | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  onImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.acceptImage(file)) input.value = "";
  }

  onPaste(event: ClipboardEvent): void {
    const file = pastedImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    if (!this.acceptImage(file)) return;
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = "";
  }

  private acceptImage(file: File): boolean {
    if (!IMAGE_TYPES.has(file.type)) {
      this.error.set("La imagen debe ser JPG, PNG o WebP");
      return false;
    }
    if (file.size > IMAGE_LIMIT_BYTES) {
      this.error.set("La imagen supera 4 MB");
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const data = result.slice(result.indexOf(",") + 1);
      this.image.set({ mediaType: file.type as ClaimImage["mediaType"], data });
      this.revokePreview();
      this.previewUrl = URL.createObjectURL(file);
      this.imagePreview.set(this.previewUrl);
      this.error.set("");
    };
    reader.readAsDataURL(file);
    return true;
  }

  clearImage(): void {
    this.image.set(null);
    this.imagePreview.set("");
    this.revokePreview();
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = "";
  }

  async submit(): Promise<void> {
    const query = this.query().trim();
    const image = this.image();
    if (this.busy()) return;
    if (query.length < 3 && !image) {
      this.error.set("Escribe un dato o adjunta una imagen");
      return;
    }
    this.busy.set(true);
    this.error.set("");
    this.nodes.set([]);
    this.draft.set("");
    this.result.set(null);
    try {
      await this.api.streamFactCheck(query, this.session.id(), (event) => {
        if (event.event === "node") {
          const node = event.data as NodeState;
          this.nodes.update((current) => {
            const next = current.filter((item) => item.node !== node.node);
            return [...next, node];
          });
        }
        if (event.event === "token") {
          const token = event.data as { text: string };
          this.draft.update((current) => current + token.text);
        }
        if (event.event === "result") {
          const result = event.data as FactCheckResult;
          this.session.remember(result.sessionId);
          this.result.set(result);
        }
        if (event.event === "error") {
          const payload = event.data as { message: string };
          this.error.set(payload.message);
        }
      }, this.hojaVidaId(), image ?? undefined);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Error de red");
    } finally {
      this.busy.set(false);
    }
  }

  private revokePreview(): void {
    if (!this.previewUrl) return;
    URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = "";
  }

  sources(): SourceRef[] {
    return this.result()?.sources ?? [];
  }

  proof(): SourceRef[] {
    return proofSources(this.sources());
  }

  contrast(): SourceRef[] {
    return contrastSources(this.sources());
  }

  stepLabel = stepLabel;
  statusLabel = statusLabel;
  stanceLabel = stanceLabel;
  citation = primaryCitation;
  citations = proofCitations;
  citationLabel = citationLabel;
  evidenceNote = evidenceNote;
  supportsCaption = supportsCaption;
  deniesCaption = deniesCaption;
  checkQuestion = checkQuestion;
  contrastedWith = contrastedWith;
  firmnessCaption = firmnessCaption;
  firmnessWidth = firmnessWidth;
  verdictCertainty = verdictCertainty;
  documentName = documentName;
  sourceLinkText = sourceLinkText;
  reading = (verdict: ClaimVerdict) => classifierReading(verdict.decisions);
  asHtml = markdownToHtml;

  verdicts(): ClaimVerdict[] {
    return this.result()?.verdicts ?? [];
  }
}

function pastedImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  const item = Array.from(data.items).find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const fromItem = item?.getAsFile();
  if (fromItem) return fromItem;
  return Array.from(data.files).find((file) => file.type.startsWith("image/")) ?? null;
}
