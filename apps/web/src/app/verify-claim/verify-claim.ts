import { Component, signal } from "@angular/core";
import type { ClaimVerdict, FactCheckResult, SourceRef } from "@tumi/contracts";
import { ApiService } from "../api.service";
import { primaryCitation, proofCitations, citationLabel, statusLabel, originLabel, stepLabel, stanceLabel, contrastSources, documentName, proofSources, referenceSources, classifierReading, firmnessCaption, firmnessWidth, verdictCertainty, evidenceNote, supportsCaption, deniesCaption } from "../labels";
import { markdownToHtml } from "../markdown";
import { SessionService } from "../session.service";

interface NodeState {
  node: string;
  status: string;
}

@Component({
  selector: "app-chat",
  templateUrl: "./verify-claim.html",
  styleUrl: "./verify-claim.scss",
})
export class VerifyClaimPage {
  query = signal("");
  busy = signal(false);
  error = signal("");
  nodes = signal<NodeState[]>([]);
  draft = signal("");
  result = signal<FactCheckResult | null>(null);

  constructor(
    private readonly api: ApiService,
    private readonly session: SessionService,
  ) {}

  async submit(): Promise<void> {
    const query = this.query().trim();
    if (query.length < 3 || this.busy()) return;
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
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Error de red");
    } finally {
      this.busy.set(false);
    }
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

  reference(): SourceRef[] {
    return referenceSources(this.sources());
  }

  stepLabel = stepLabel;
  statusLabel = statusLabel;
  originLabel = originLabel;
  stanceLabel = stanceLabel;
  citation = primaryCitation;
  citations = proofCitations;
  citationLabel = citationLabel;
  evidenceNote = evidenceNote;
  supportsCaption = supportsCaption;
  deniesCaption = deniesCaption;
  reading = (verdict: ClaimVerdict) => classifierReading(verdict.decisions);
  firmnessCaption = firmnessCaption;
  firmnessWidth = firmnessWidth;
  verdictCertainty = verdictCertainty;
  documentName = documentName;
  asHtml = markdownToHtml;

  contrastedDatum(): string | null {
    const result = this.result();
    const focus = result?.focus?.trim() ?? "";
    if (!focus || focus === result?.query.trim()) return null;
    return focus;
  }

  verdicts(): ClaimVerdict[] {
    return this.result()?.verdicts ?? [];
  }
}
