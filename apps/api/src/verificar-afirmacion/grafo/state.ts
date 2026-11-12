import { Annotation } from "@langchain/langgraph";
import type { ClaimVerdict, EntityRef, SourceRef } from "@tumi/contracts";

export interface EvidenceItem extends SourceRef {
  candidatoId?: string | null;
}

export const TumiAnnotation = Annotation.Root({
  query: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  sessionId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  consultaId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  entities: Annotation<EntityRef[]>({ reducer: (_left, right) => right, default: () => [] }),
  claims: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  evidence: Annotation<EvidenceItem[]>({ reducer: (_left, right) => right, default: () => [] }),
  verdicts: Annotation<ClaimVerdict[]>({ reducer: (_left, right) => right, default: () => [] }),
  conclusion: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  degraded: Annotation<boolean>({ reducer: (left, right) => left || right, default: () => false }),
});

export type TumiState = typeof TumiAnnotation.State;

export interface StreamHooks {
  onNode: (node: string, status: "start" | "done") => void;
  onDecision: (payload: unknown) => void;
  onToken: (text: string) => void;
}

export interface AgentDeps {
  searchCandidates: (query: string) => Promise<EntityRef[]>;
  chooseCandidate: (query: string, entities: EntityRef[]) => Promise<string | null>;
  extractClaims: (query: string) => Promise<string[]>;
  searchEvidence: (
    query: string,
    claims: string[],
    entities: EntityRef[],
    sessionId: string,
  ) => Promise<EvidenceItem[]>;
  rerank: (claims: string[], evidence: EvidenceItem[]) => Promise<EvidenceItem[]>;
  clasificarCirculacion: (claims: string[], evidence: EvidenceItem[]) => Promise<EvidenceItem[]>;
  judgeClaim: (
    claim: string,
    evidence: EvidenceItem[],
    entities: EntityRef[],
  ) => Promise<
    Pick<ClaimVerdict, "verdict" | "confidence" | "degraded" | "decisions" | "explanation">
  >;
  explain: (state: TumiState, onToken: (text: string) => void) => Promise<string>;
  decisionsEnabled: () => boolean;
}
