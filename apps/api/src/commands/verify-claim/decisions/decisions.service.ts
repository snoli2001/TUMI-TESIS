import { Injectable, Logger } from "@nestjs/common";
import type { DecisionAnswer, EntityRef } from "@tumi/contracts";
import { resolveVerdict } from "@tumi/contracts";
import OpenAI from "openai";
import type { DecisionCreateParams } from "openai/resources/decisions";
import { decisionMinConfidence, relevanceMin } from "../../../shared/text";
import type { EvidenceItem } from "../graph/state";
import { trustedOutlet } from "../evidence/outlets";

type DecisionQuestion = DecisionCreateParams["questions"][number];

type RawAnswer = {
  type?: string;
  name?: string | null;
  probability?: number;
  choice?: string | boolean;
  confidence?: number;
  score?: number;
  probabilities?: Array<Record<string, unknown>>;
};

@Injectable()
export class DecisionsService {
  private readonly logger = new Logger(DecisionsService.name);
  private client: OpenAI | null = null;

  enabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async chooseCandidate(query: string, entities: EntityRef[]): Promise<string | null> {
    if (!this.enabled() || entities.length < 2) return null;
    const answers = await this.ask(
      { query, candidatos: entities },
      [
        {
          type: "choice",
          name: "candidato",
          instructions:
            "Elige el candidato del que habla la consulta. Si ninguno encaja, elige el primero solo si el nombre aparece.",
          choices: entities.map((entity) => ({
            value: entity.id,
            description: `${entity.nombre}, ${entity.cargo}, ${entity.partido}`,
          })),
        },
      ],
    );
    const choice = answers.find((answer) => answer.name === "candidato");
    if (!choice || choice.type !== "choice") return null;
    return choice.choice;
  }

  async rerank(claims: string[], evidence: EvidenceItem[]): Promise<EvidenceItem[]> {
    if (!this.enabled() || evidence.length <= 1) return evidence.slice(0, 8);
    const limited = evidence.slice(0, 20);
    const answers = await this.ask(
      { claims, fragmentos: limited.map((item) => ({ id: item.id, texto: item.snippet })) },
      limited.map((item) => ({
        type: "predicate" as const,
        name: item.id,
        instructions: `El pasaje es pertinente para verificar alguno de los claims. Pasaje: ${item.snippet}`,
      })),
    );
    const threshold = relevanceMin();
    const kept = limited.filter((item) => {
      const answer = answers.find((candidate) => candidate.name === item.id);
      return answer?.type === "predicate" && answer.probability >= threshold;
    });
    return (kept.length > 0 ? kept : limited.slice(0, 3)).slice(0, 8);
  }

  async classifyCirculation(claims: string[], evidence: EvidenceItem[]): Promise<EvidenceItem[]> {
    const limited = evidence.slice(0, 5);
    if (!this.enabled() || limited.length === 0) return limited;
    const answers = await this.ask(
      {
        afirmaciones: claims,
        paginas: limited.map((item) => ({ id: item.id, titulo: item.title, texto: item.snippet })),
      },
      limited.map((item) => ({
        type: "choice" as const,
        name: item.id,
        instructions:
          "Di qué hace esta página con la afirmación. No decidas si la afirmación es verdad. Si no habla de ella, elige menciona.",
        choices: [
          { value: "afirma", description: "La presenta como cierta o la repite a favor." },
          { value: "desacredita", description: "La niega o la trata como falsa." },
          { value: "menciona", description: "La nombra sin sostenerla ni negarla, o no habla de ella." },
        ],
      })),
    );
    return limited.map((item) => {
      const answer = answers.find((candidate) => candidate.name === item.id);
      const stance =
        answer?.type === "choice" && esPostura(answer.choice) ? answer.choice : null;
      return { ...item, role: "contraste" as const, stance };
    });
  }

  async judgeClaim(claim: string, evidence: EvidenceItem[], entities: EntityRef[]) {
    if (!this.enabled()) {
      return {
        verdict: "no_verificable" as const,
        confidence: null,
        degraded: true,
        decisions: [] as DecisionAnswer[],
        explanation: "Clasificador no disponible: la consulta corre en modo demostración.",
      };
    }

    const answers = await this.ask(
      {
        claim,
        entidades: entities,
        evidencia: evidence.map((item) => ({
          id: item.id,
          origen: item.origin,
          medio: trustedOutlet(item.url),
          titulo: item.title,
          url: item.url,
          texto: item.snippet,
        })),
      },
      [
        {
          type: "predicate",
          name: "apoya",
          instructions: "La evidencia respalda el claim.",
        },
        {
          type: "predicate",
          name: "contradice",
          instructions: "La evidencia niega el claim.",
        },
        {
          type: "choice",
          name: "veredicto",
          instructions:
            "Clasifica el claim solo con la evidencia adjunta. Una nota que no menciona el hecho no es evidencia. Contrasta el claim con todas las fuentes de prueba que hablan del hecho: si varias coinciden, sigue al conjunto y no a una sola nota. RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck, el Verificador de La República y el IPE son fuentes de prueba: un dato que publican sobre el hecho se toma como cierto. Si PerúCheck o larepublica.pe/verificador publican un chequeo de este candidato y este dato, elige el veredicto de ese chequeo. Si el padrón muestra otro cargo para estas elecciones, el claim de que será ese otro cargo es falso. Una nota puede explicar el motivo, como la prohibición de reelección inmediata. Haber ocupado el cargo antes no vuelve verdadero el claim de que lo será ahora. Si el claim atribuye un delito, solo es verdadero cuando una fuente de prueba cita una condena firme por ese hecho. Si ninguna fuente de prueba registra esa condena, elige falso: la afirmación no está acreditada. Elige no_verificable solo si una fuente de prueba describe un proceso judicial todavía abierto. Una denuncia, aunque la recoja uno de esos medios, no es una condena. Una norma (Constitución, Compendio electoral, Ley de municipalidades, Código Procesal Penal, Ley del Poder Ejecutivo, Código Penal, Código Civil o Ley de transparencia) explica la regla, con su nombre y página, y no prueba por sí sola que el candidato hizo el hecho. El Código Penal define un delito y una pena; no acredita que el candidato lo haya cometido. El Código Procesal Penal distingue denuncia, investigación, acusación y sentencia: una noticia de denuncia no se convierte en condena porque el código describa la denuncia. Un cargo de ministro, una renuncia, una candidatura anunciada o la presentación de un proyecto de ley es un hecho público ya ocurrido: si un medio de prueba lo publica, elige verdadero. Que la hoja de vida no lo declare no lo vuelve falso. Que una norma no nombre a la persona tampoco lo niega: la norma explica el cargo, no el nombramiento. Si ninguna fuente de prueba afirma ni niega ese hecho, elige no_verificable. Si el claim sitúa ese cargo en un gobierno y la nota lo sitúa en otro, elige falso. La unión civil no matrimonial no es matrimonio igualitario: si la fuente dice que el proyecto era de unión civil, el claim de que era matrimonio igualitario es falso. El Código Civil describe el matrimonio y no reclasifica ese proyecto. «El mejor», «el peor» o «potencia mundial», sin indicador, umbral y período, es no_verificable. No uses no_verificable cuando un medio de prueba ya publicó el hecho.",
          choices: [
            {
              value: "verdadero",
              description: "Una fuente de prueba cita una condena firme o respalda el claim de forma directa.",
            },
            {
              value: "falso",
              description: "Ninguna fuente de prueba acredita el claim, o una fuente de prueba lo niega.",
            },
            {
              value: "enganoso",
              description: "Mezcla un dato cierto con una conclusión que la evidencia no sostiene.",
            },
            {
              value: "no_verificable",
              description: "Una fuente de prueba muestra un proceso abierto, sin condena ni desmentido.",
            },
          ],
        },
        {
          type: "score",
          name: "solidez",
          instructions: "Qué tan sólida es la evidencia para decidir el claim.",
          levels: [
            { label: "debil", description: "Fragmentos tangenciales o insuficientes." },
            { label: "media", description: "Hay coincidencias parciales, con huecos importantes." },
            { label: "alta", description: "Varias fuentes consistentes cubren el claim." },
          ],
        },
      ],
    );

    const resolved = resolveVerdict(answers, decisionMinConfidence());
    return {
      verdict: resolved.verdict,
      confidence: resolved.confidence,
      degraded: false,
      decisions: answers,
      explanation: "",
    };
  }

  private async ask(evidence: unknown, questions: DecisionQuestion[]): Promise<DecisionAnswer[]> {
    const data = JSON.parse(JSON.stringify(evidence)) as Record<string, unknown>;
    try {
      const client = this.getClient();
      const decision = await client.decisions.create({
        model: process.env.OPENAI_DECISION_MODEL || "gpt-6-luna",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Evalúa solo la evidencia electoral adjunta. No completes datos que no estén ahí.",
              },
              { type: "input_json", data },
            ],
          },
        ],
        questions,
      });
      return (decision.answers ?? []).map((answer) => mapAnswer(answer as RawAnswer));
    } catch (error) {
      this.logger.warn(`Decisions API no respondió: ${error instanceof Error ? error.message : error}`);
      return questions.map((question) => ({
        type: "refusal" as const,
        name: question.name ?? "",
      }));
    }
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }
}

function mapAnswer(raw: RawAnswer): DecisionAnswer {
  const name = raw.name ?? "";
  if (raw.type === "predicate") {
    return { type: "predicate", name, probability: raw.probability ?? 0 };
  }
  if (raw.type === "choice") {
    return {
      type: "choice",
      name,
      choice: String(raw.choice ?? ""),
      confidence: raw.confidence ?? 0,
      probabilities: (raw.probabilities ?? []).map((item) => ({
        value: String(item.value ?? ""),
        probability: Number(item.probability ?? 0),
      })),
    };
  }
  if (raw.type === "score") {
    return {
      type: "score",
      name,
      score: raw.score ?? 0,
      confidence: raw.confidence ?? 0,
      probabilities: (raw.probabilities ?? []).map((item) => ({
        label: String(item.label ?? ""),
        value: Number(item.value ?? 0),
        probability: Number(item.probability ?? 0),
      })),
    };
  }
  return { type: "refusal", name };
}

function esPostura(value: string): value is "afirma" | "desacredita" | "menciona" {
  return value === "afirma" || value === "desacredita" || value === "menciona";
}
