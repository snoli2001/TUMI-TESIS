import { Injectable, Logger } from "@nestjs/common";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { ClaimImage } from "@tumi/contracts";
import { deterministicClaims, textOf } from "../../../shared/text";
import type { TumiState } from "../graph/state";
import { parseImageReading, type ImageReading } from "./image-reading";
import { trustedOutlet } from "../evidence/outlets";
import { acceptedStatutes, STATUTES } from "../evidence/statutes";
import { CLAIM_POLICY } from "../policy";
import { contrastTarget, fallbackQueries, type QuestionKind } from "../profile/rules";
import type { SearchPlan } from "../graph/state";

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  enabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async readClaim(image: ClaimImage, candidate: string): Promise<ImageReading> {
    if (!this.enabled()) throw new Error("Sin clave de OpenAI no se puede leer la imagen");
    const model = new ChatOpenAI({
      model: process.env.OPENAI_MODEL_MINI || "gpt-5.4-mini",
      apiKey: process.env.OPENAI_API_KEY,
    });
    const response = await model.invoke([
      new SystemMessage(
        `La imagen se contrasta solo respecto de ${candidate}. Transcribe el nombre, el cargo y el partido tal como aparecen: no los reescribas hacia esta persona. Devuelve solo JSON {"kind":"statement"|"claim"|"record"|"other","claims":string[]}. statement: una nota, una cita o una publicación donde esta persona declara algo; claims son lo que dijo, hasta 4 oraciones, y no incluyen el cargo ni el partido. claim: una afirmación de un tercero sobre esta persona; claims tiene esa afirmación. record: una captura de hoja de vida o del padrón; claims describe el cargo y el partido que se ven. other: no hay una declaración ni una afirmación comprobable; claims es []. No inventes datos que no estén en la imagen.`,
      ),
      new HumanMessage({
        content: [
          { type: "text", text: "Clasifica la imagen y extrae lo que hay que contrastar." },
          { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
        ],
      }),
    ]);
    const reading = parseImageReading(textOf(response.content));
    if (reading.kind === "other") throw new Error("La imagen no contiene una afirmación para contrastar");
    return reading;
  }

  async focusContrast(query: string, name: string): Promise<string> {
    const fallback = contrastTarget(query);
    if (!this.enabled()) return fallback;
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
      });
      const response = await model.invoke([
        new SystemMessage(
          'Devuelve solo JSON {"target": string}. El target es el hecho que hay que contrastar, en español, sin agregar datos. Un oficio o una profesión solo identifica a la persona cuando la oración afirma otra cosa, como una sanción, una renuncia, un cargo, una promesa o un delito. Si la oración trata de esa profesión o de los estudios, el target conserva ese dato.',
        ),
        new HumanMessage(`${name}. ${query}`),
      ]);
      const target = parseTarget(textOf(response.content));
      return contrastTarget(target.length >= 12 ? target : query);
    } catch (error) {
      this.logger.warn(`El dato a contrastar quedó en la frase: ${error instanceof Error ? error.message : error}`);
      return fallback;
    }
  }

  async extractClaims(query: string): Promise<string[]> {
    if (!this.enabled()) return deterministicClaims(query);
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
      });
      const response = await model.invoke([
        new SystemMessage(
          'Devuelve solo JSON {"claims": string[]}. Separa la consulta en afirmaciones verificables, en español, sin agregar datos. Máximo 4.',
        ),
        new HumanMessage(query),
      ]);
      const parsed = parseClaims(textOf(response.content));
      return parsed.length > 0 ? parsed : deterministicClaims(query);
    } catch (error) {
      this.logger.warn(`Extracción degradada: ${error instanceof Error ? error.message : error}`);
      return deterministicClaims(query);
    }
  }

  async planQueries(_kind: QuestionKind, name: string, query: string): Promise<SearchPlan> {
    const fallback = fallbackPlan(name, query);
    if (!this.enabled()) return fallback;
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
      });
      const catalog = STATUTES.map((statute) => `${statute.id}: ${statute.title}`).join("; ");
      const response = await model.invoke([
        new SystemMessage(
          `Devuelve solo JSON {"queries": string[], "statutes": string[]}. Máximo 3 consultas. Cada consulta incluye el nombre de la persona y busca el hecho a contrastar. Si la frase niega un hecho, incluye también una consulta del hecho positivo. Si afirma otro cargo, busca ese cargo. statutes tiene como mucho 2 ids de este catálogo, y solo si una norma ayuda a explicar la regla: ${catalog}. Si el caso no trata de una regla, statutes es []. No inventes datos que no estén en la afirmación.`,
        ),
        new HumanMessage(`${name}. ${query}`),
      ]);
      return settlePlan(parsePlan(textOf(response.content)), fallback);
    } catch (error) {
      this.logger.warn(`Búsqueda degradada: ${error instanceof Error ? error.message : error}`);
      return fallback;
    }
  }

  async explain(state: TumiState, onToken: (text: string) => void): Promise<string> {
    if (!this.enabled()) {
      const oficial = state.verdicts.find((verdict) => verdict.explanation)?.explanation;
      const text = oficial || degradedConclusion(state);
      onToken(text);
      return text;
    }
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-5.1",
        apiKey: process.env.OPENAI_API_KEY,
        streaming: true,
      });
      const stream = await model.stream([
        new SystemMessage(
          `Redacta en español una explicación breve para un ciudadano. Los veredictos ya están decididos y no puedes cambiarlos. ${CLAIM_POLICY} Separa los argumentos en párrafos cortos y viñetas que empiecen con '- '. Usa **negrita** solo para el veredicto. Si el resultado está degradado, dilo.`,
        ),
        new HumanMessage(
          JSON.stringify({
            consulta: state.query,
            entidades: state.entities,
            veredictos: state.verdicts.map((verdict) => ({
              claim: verdict.claim,
              verdict: verdict.verdict,
              confidence: verdict.confidence,
              degraded: verdict.degraded,
            })),
            fuentes: state.evidence.map((item) => ({
              titulo: item.title,
              origen: citedOrigin(item),
              medio: trustedOutlet(item.url),
              rol: item.role,
              postura: item.stance,
              texto: item.snippet,
            })),
          }),
        ),
      ]);
      let full = "";
      for await (const chunk of stream) {
        const text = textOf(chunk.content);
        if (!text) continue;
        full += text;
        onToken(text);
      }
      return full || degradedConclusion(state);
    } catch (error) {
      this.logger.warn(`Explicación degradada: ${error instanceof Error ? error.message : error}`);
      const text = degradedConclusion(state);
      onToken(text);
      return text;
    }
  }
}

function parseTarget(raw: string): string {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return "";
  try {
    const parsed = JSON.parse(json) as { target?: unknown };
    return typeof parsed.target === "string" ? parsed.target.trim() : "";
  } catch {
    return "";
  }
}

function fallbackPlan(name: string, query: string): SearchPlan {
  return { queries: fallbackQueries(name, query), statutes: [] };
}

function settlePlan(parsed: SearchPlan, fallback: SearchPlan): SearchPlan {
  const statutes = acceptedStatutes(parsed.statutes).map((statute) => statute.id);
  return {
    queries: parsed.queries.length > 0 ? parsed.queries : fallback.queries,
    statutes,
  };
}

function parsePlan(raw: string): SearchPlan {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return { queries: [], statutes: [] };
  try {
    const parsed = JSON.parse(json) as { queries?: unknown; statutes?: unknown };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 3)
      : [];
    const statutes = Array.isArray(parsed.statutes)
      ? parsed.statutes.filter((item): item is string => typeof item === "string")
      : [];
    return { queries, statutes };
  } catch {
    return { queries: [], statutes: [] };
  }
}

function parseClaims(raw: string): string[] {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { claims?: unknown };
    if (!Array.isArray(parsed.claims)) return [];
    return parsed.claims
      .filter((claim): claim is string => typeof claim === "string")
      .map((claim) => claim.trim())
      .filter((claim) => claim.length > 0)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function citedOrigin(item: { origin: string; title: string }): string {
  if (item.origin !== "qdrant") return item.origin;
  const name = item.title.replace(/, p\. \d+$/, "").trim();
  return name || item.title;
}

function originLabel(origin: string): string {
  if (origin === "jne") return "padrón";
  if (origin === "tavily") return "web";
  if (origin === "adjunto") return "adjunto";
  return "plan";
}

function degradedConclusion(state: TumiState): string {
  const claims = state.claims.map((claim) => `- ${claim}`).join("\n");
  const prueba = state.evidence.filter((item) => item.role === "prueba");
  const referencia = state.evidence.filter((item) => item.role === "referencia");
  const contraste = state.evidence.filter((item) => item.role === "contraste");
  const lista = (items: TumiState["evidence"]) =>
    items.map((item) => `- ${item.title} (${originLabel(item.origin)})`).join("\n");
  return [
    "Esta respuesta es de demostración: sin clave de OpenAI, TUMI no asigna un veredicto ni probabilidades.",
    "",
    "Afirmaciones detectadas:",
    claims || "- (ninguna)",
    "",
    "Fuentes que podrían verificar, sin usarlas todavía:",
    lista(prueba) || "- (ninguna)",
    "",
    "Normas de referencia, que explican la regla y no acreditan el caso:",
    lista(referencia) || "- (ninguna)",
    "",
    "Páginas donde circula, que no verifican:",
    lista(contraste) || "- (ninguna)",
    "",
    "Cada afirmación queda como no verificable.",
  ].join("\n");
}
