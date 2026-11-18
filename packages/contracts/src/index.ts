import { z } from "zod";
import {
  SOURCE_ORIGINS,
  SOURCE_ROLES,
  SOURCE_STANCES,
  VERDICT_CHECKS,
  VERDICTS,
  type ClaimVerdict,
  type DecisionAnswer,
  type EntityRef,
  type FactCheckRequest,
  type FactCheckResult,
  type SourceRef,
  type VerificarVideoRequest,
} from "./verdict-policy.js";
import { idDeYoutube } from "./youtube.js";

export * from "./verdict-policy.js";
export * from "./youtube.js";

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
  role: z.enum(SOURCE_ROLES),
  stance: z.enum(SOURCE_STANCES).nullable(),
  pagina: z.number().int().nullable(),
  codigoExpediente: z.string().nullable(),
});

export const entitySchema: z.ZodType<EntityRef> = z.object({
  id: z.string(),
  nombre: z.string(),
  cargo: z.string(),
  partido: z.string(),
  fotoUrl: z.string().nullable(),
  alias: z.string().nullable(),
});

export const claimVerdictSchema: z.ZodType<ClaimVerdict> = z.object({
  claim: z.string(),
  verdict: z.enum(VERDICTS),
  confidence: z.number().nullable(),
  degraded: z.boolean(),
  explanation: z.string(),
  decisions: z.array(decisionAnswerSchema),
  sources: z.array(sourceSchema),
  check: z.enum(VERDICT_CHECKS).optional(),
});

export const factCheckResultSchema: z.ZodType<FactCheckResult> = z.object({
  id: z.string(),
  sessionId: z.string(),
  query: z.string(),
  focus: z.string().optional(),
  conclusion: z.string(),
  degraded: z.boolean(),
  verdicts: z.array(claimVerdictSchema),
  sources: z.array(sourceSchema),
  entities: z.array(entitySchema),
});

const claimImageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z
    .string()
    .trim()
    .min(32, "La imagen está vacía")
    .max(5_600_000, "La imagen supera 4 MB"),
});

export const factCheckRequestSchema: z.ZodType<FactCheckRequest> = z
  .object({
    query: z.string().trim().max(2000),
    sessionId: z.string().trim().min(1).max(80).optional(),
    hojaVidaId: z.string().trim().min(1).max(160).optional(),
    image: claimImageSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.query.length >= 3 || value.image) return;
    context.addIssue({
      code: "custom",
      message: "Escribe un dato o adjunta una imagen",
      path: ["query"],
    });
  });

const sessionId = z.string().trim().min(1).max(80).optional();

export const verificarVideoRequestSchema: z.ZodType<VerificarVideoRequest> = z
  .object({
    transcripcion: z.string().trim().max(20000).optional(),
    url: z.string().trim().max(500).optional(),
    sessionId,
  })
  .superRefine((value, context) => {
    const texto = value.transcripcion?.trim() ?? "";
    const url = value.url?.trim() ?? "";
    if (!texto && !url) {
      context.addIssue({
        code: "custom",
        message: "Pega una transcripción o una URL de YouTube",
      });
    }
    if (!url && texto.length > 0 && texto.length < 3) {
      context.addIssue({
        code: "custom",
        message: "La transcripción es demasiado corta",
        path: ["transcripcion"],
      });
    }
    if (url && !idDeYoutube(url)) {
      context.addIssue({
        code: "custom",
        message: "La URL tiene que ser un video público de YouTube",
        path: ["url"],
      });
    }
  });
