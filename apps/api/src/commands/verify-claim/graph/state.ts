import { Annotation } from "@langchain/langgraph";
import type { ClaimVerdict, EntityRef, SourceRef } from "@tumi/contracts";
import type { QuestionKind } from "../profile/rules";

export interface EvidenceItem extends SourceRef {
  candidatoId?: string | null;
}

export const TumiAnnotation = Annotation.Root({
  query: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  sessionId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  consultaId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  entities: Annotation<EntityRef[]>({ reducer: (_left, right) => right, default: () => [] }),
  claims: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  focus: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  queries: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  stateQueries: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  statutes: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  legalQuery: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  evidence: Annotation<EvidenceItem[]>({ reducer: (_left, right) => right, default: () => [] }),
  verdicts: Annotation<ClaimVerdict[]>({ reducer: (_left, right) => right, default: () => [] }),
  conclusion: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  degraded: Annotation<boolean>({ reducer: (left, right) => left || right, default: () => false }),
});

export type TumiState = typeof TumiAnnotation.State;

export interface SearchPlan {
  queries: string[];
  stateQueries: string[];
  statutes: string[];
  legalQuery: string;
}

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
    queries: string[],
    statutes: string[],
    focus: string,
    stateQueries: string[],
    legalQuery: string,
  ) => Promise<EvidenceItem[]>;
  pressQueries: (name: string, focus: string) => Promise<string[]>;
  planQueries: (kind: QuestionKind, name: string, query: string) => Promise<SearchPlan>;
  rerank: (claims: string[], evidence: EvidenceItem[]) => Promise<EvidenceItem[]>;
  classifyCirculation: (claims: string[], evidence: EvidenceItem[]) => Promise<EvidenceItem[]>;
  judgeClaim: (
    claim: string,
    evidence: EvidenceItem[],
    entities: EntityRef[],
    reference: EvidenceItem[],
    focus: string,
  ) => Promise<
    Pick<ClaimVerdict, "verdict" | "confidence" | "degraded" | "decisions" | "explanation">
  >;
  explain: (state: TumiState, onToken: (text: string) => void) => Promise<string>;
  decisionsEnabled: () => boolean;
}
