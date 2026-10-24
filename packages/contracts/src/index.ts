import { z } from "zod";
import {
  SOURCE_ORIGINS,
  VERDICTS,
  type ClaimVerdict,
  type DecisionAnswer,
  type EntityRef,
  type FactCheckRequest,
  type FactCheckResult,
  type SourceRef,
} from "./verdict-policy.js";

export * from "./verdict-policy.js";

const probabilityValueSchema = z.object({
  value: z.string(),
  probability: z.number(),
});

const scoreProbabilitySchema = z.object({
  label: z.string(),
  value: z.number(),
  probability: z.number(),
});

export const decisionAnswerSchema: z.ZodType<DecisionAnswer> = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("predicate"),
      name: z.string(),
      probability: z.number(),
    }),
    z.object({
      type: z.literal("choice"),
      name: z.string(),
      choice: z.string(),
      confidence: z.number(),
      probabilities: z.array(probabilityValueSchema),
    }),
    z.object({
      type: z.literal("score"),
      name: z.string(),
      score: z.number(),
      confidence: z.number(),
      probabilities: z.array(scoreProbabilitySchema),
    }),
    z.object({
      type: z.literal("refusal"),
      name: z.string(),
    }),
  ],
);

export const sourceSchema: z.ZodType<SourceRef> = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  snippet: z.string(),
  origin: z.enum(SOURCE_ORIGINS),
});

export const entitySchema: z.ZodType<EntityRef> = z.object({
  id: z.string(),
  nombre: z.string(),
  cargo: z.string(),
  partido: z.string(),
});

export const claimVerdictSchema: z.ZodType<ClaimVerdict> = z.object({
  claim: z.string(),
  verdict: z.enum(VERDICTS),
  confidence: z.number().nullable(),
  degraded: z.boolean(),
  explanation: z.string(),
  decisions: z.array(decisionAnswerSchema),
  sources: z.array(sourceSchema),
});

export const factCheckResultSchema: z.ZodType<FactCheckResult> = z.object({
  id: z.string(),
  sessionId: z.string(),
  query: z.string(),
  conclusion: z.string(),
  degraded: z.boolean(),
  verdicts: z.array(claimVerdictSchema),
  sources: z.array(sourceSchema),
  entities: z.array(entitySchema),
});

export const factCheckRequestSchema: z.ZodType<FactCheckRequest> = z.object({
  query: z.string().trim().min(3).max(2000),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
