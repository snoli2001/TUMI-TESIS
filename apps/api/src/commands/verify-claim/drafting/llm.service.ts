import { Injectable, Logger } from "@nestjs/common";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { deterministicClaims, textOf } from "../../../shared/text";
import type { TumiState } from "../graph/state";

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  enabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async extractClaims(query: string): Promise<string[]> {
    if (!this.enabled()) return deterministicClaims(query);
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5.1-mini",
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

  async explain(state: TumiState, onToken: (text: string) => void): Promise<string> {
    if (!this.enabled()) {
      const text = degradedConclusion(state);
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
          "Redacta en español una explicación breve para un ciudadano. Los veredictos ya están decididos y no puedes cambiarlos. Si no hay entidades, no inventes nombre, cargo ni partido. Solo las fuentes con rol prueba sostienen el veredicto. Si el claim atribuye un delito y ninguna fuente de prueba cita una condena, dilo en la primera oración y no dejes el hecho como una posibilidad. Las fuentes de contraste no se citan ni se parafrasean: di solo que circulan menciones no verificadas y que no acreditan el hecho. Separa los argumentos en párrafos cortos y viñetas que empiecen con '- '. Usa **negrita** solo para el veredicto. Si el resultado está degradado, dilo.",
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
              origen: item.origin,
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

function origenEnEspanol(origin: string): string {
  if (origin === "jne") return "padrón";
  if (origin === "tavily") return "web";
  if (origin === "adjunto") return "adjunto";
  return "plan";
}

function degradedConclusion(state: TumiState): string {
  const claims = state.claims.map((claim) => `- ${claim}`).join("\n");
  const prueba = state.evidence.filter((item) => item.role !== "contraste");
  const contraste = state.evidence.filter((item) => item.role === "contraste");
  const lista = (items: TumiState["evidence"]) =>
    items.map((item) => `- ${item.title} (${origenEnEspanol(item.origin)})`).join("\n");
  return [
    "Esta respuesta es de demostración: sin clave de OpenAI, TUMI no asigna un veredicto ni probabilidades.",
    "",
    "Afirmaciones detectadas:",
    claims || "- (ninguna)",
    "",
    "Fuentes que podrían verificar, sin usarlas todavía:",
    lista(prueba) || "- (ninguna)",
    "",
    "Páginas donde circula, que no verifican:",
    lista(contraste) || "- (ninguna)",
    "",
    "Cada afirmación queda como no verificable.",
  ].join("\n");
}
