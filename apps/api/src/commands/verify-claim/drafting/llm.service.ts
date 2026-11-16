import { Injectable, Logger } from "@nestjs/common";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { ClaimImage } from "@tumi/contracts";
import { deterministicClaims, textOf } from "../../../shared/text";
import type { TumiState } from "../graph/state";
import { parseImageReading, type ImageReading } from "./image-reading";
import { trustedOutlet } from "../evidence/outlets";
import { searchQueries, webQuery, type QuestionKind } from "../profile/rules";

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

  async planQueries(kind: QuestionKind, name: string, query: string): Promise<string[]> {
    const fact = webQuery(name, query, name);
    const base = searchQueries(kind, name, fact);
    if (!this.enabled()) return base;
    try {
      const model = new ChatOpenAI({
        model: process.env.OPENAI_MODEL_MINI || "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
      });
      const goal =
        kind === "criminal"
          ? "Busca denuncias, expedientes y procesos de esa persona."
          : kind === "proposal"
            ? "Busca declaraciones y propuestas dichas en público."
            : "Busca el hecho de la afirmación.";
      const response = await model.invoke([
        new SystemMessage(
          `Devuelve solo JSON {"queries": string[]}. Máximo 3. Cada consulta incluye el nombre del candidato. ${goal} No inventes datos que no estén en la afirmación.`,
        ),
        new HumanMessage(`${name}. ${query}`),
      ]);
      const parsed = parseQueries(textOf(response.content));
      return parsed.length > 0 ? parsed : base;
    } catch (error) {
      this.logger.warn(`Búsqueda degradada: ${error instanceof Error ? error.message : error}`);
      return base;
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
          "Redacta en español una explicación breve para un ciudadano. Los veredictos ya están decididos y no puedes cambiarlos. Si no hay entidades, no inventes nombre, cargo ni partido. Solo las fuentes con rol prueba sostienen el veredicto. Si una fuente se titula Hoja de vida, esa declaración es la fuente oficial del antecedente: cítala primero y no la sustituyas por una nota. Una nota solo informa denuncias o expedientes públicos. RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros y el IPE son fuentes de prueba: lo que publican sobre el hecho se toma como cierto. Cita cada uno de esos medios que habla del hecho, con su nombre, y no te quedes con una sola nota. PerúCheck y larepublica.pe/verificador son chequeos publicados: cítalos por su nombre y no los trates como un rumor. Si la fuente es el plan de gobierno, úsalo para lo prometido por escrito; una nota solo muestra que lo dijo en público. Si el padrón muestra el cargo al que postula en 2026, ese es el dato oficial de la candidatura. Si una nota explica que no puede postular al cargo afirmado porque la reelección inmediata está prohibida, incluye ese motivo y cita el medio. Haber ocupado el cargo antes no convierte en verdadero el claim de que lo será ahora. Si la fuente es una norma, explica qué exige o permite, con su nombre y su página, y menciona la edición cuando el fragmento la trae. El Código Penal no demuestra que la persona cometió el delito. El Código Procesal Penal no convierte una denuncia en condena. Si el claim atribuye un delito y ninguna fuente de prueba cita una condena, dilo en la primera oración y no dejes el hecho como una posibilidad. Las fuentes de contraste no se citan ni se parafrasean: di solo que circulan menciones no verificadas y que no acreditan el hecho. Separa los argumentos en párrafos cortos y viñetas que empiecen con '- '. Usa **negrita** solo para el veredicto. Si el resultado está degradado, dilo.",
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

function parseQueries(raw: string): string[] {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return [];
    return parsed.queries
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 3);
  } catch {
    return [];
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
  const prueba = state.evidence.filter((item) => item.role !== "contraste");
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
    "Páginas donde circula, que no verifican:",
    lista(contraste) || "- (ninguna)",
    "",
    "Cada afirmación queda como no verificable.",
  ].join("\n");
}
