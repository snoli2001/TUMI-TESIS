import type { CaseReport, CaseReview, ReviewsFile, ReviewerPass } from "./types";

const REVIEWERS = ["reviewer-a", "reviewer-b"] as const;

export function blankReviews(cases: CaseReport[]): ReviewsFile {
  return {
    note: "Copien este archivo a reviews.json. Dos revisores llenan las pasadas por separado y la etiqueta adjudicada se escribe después. RLA04, DU05 y CB05 quedan vacíos hasta ese momento. Una corrida nueva vuelve a escribir reviews.blank.json.",
    cases: cases.map((item) => blankCase(item)),
  };
}

export function rubricMarkdown(cases: CaseReport[]): string {
  const lines = [
    "# Rúbrica del piloto",
    "",
    "Dos personas leen cada caso por separado y anotan en `reviews.json`. Esta hoja muestra la afirmación, el veredicto del sistema y el pasaje citado. No adjudica etiquetas.",
    "",
    "Para cada cita, marquen si el fragmento respalda la explicación. Para cada oración, marquen si exige respaldo y si alguna cita se lo da. En un caso no verificable, revisen si el sistema explica la falta de evidencia y evita una conclusión categórica.",
    "",
    "RLA04, DU05 y CB05 aceptaban dos etiquetas en el piloto. Aquí hace falta una sola, y se deja vacía hasta que los revisores cierren el desacuerdo.",
    "",
  ];
  for (const item of cases) {
    lines.push(`## ${item.id}. ${item.person}`, "");
    lines.push(`Afirmación: ${item.claim}`, "");
    lines.push(`Criterio del piloto: ${item.criterion}`, "");
    lines.push(`Etiqueta escrita: ${item.expectedLabel}. Veredictos aceptados: ${item.verdicts.join(", ")}.`, "");
    if (item.verdicts.length > 1) {
      lines.push("Este caso acepta más de una etiqueta. La adjudicación queda vacía.", "");
    }
    lines.push(`Veredicto del sistema: ${item.actual ?? item.status}.`, "");
    if (item.entity) {
      lines.push(`Candidato devuelto: ${item.entity.nombre} (${item.entity.cargo}).`, "");
    }
    const reading = item.explanation ?? item.conclusion ?? item.error;
    if (reading) {
      lines.push("Explicación:", "", reading, "");
    }
    if (item.sources.length === 0) {
      lines.push("No citó pasajes.", "");
    } else {
      lines.push("Pasajes citados:", "");
      for (const source of item.sources) {
        const where = [source.origin, source.role].filter(Boolean).join(", ");
        lines.push(`- ${source.id}. ${source.title || "Sin título"}${where ? ` (${where})` : ""}`);
        if (source.url) lines.push(`  ${source.url}`);
        if (source.snippet) lines.push(`  ${source.snippet}`);
      }
      lines.push("");
    }
    if (item.sentences.length > 0) {
      lines.push("Oraciones de la explicación:", "");
      for (const sentence of item.sentences) {
        lines.push(`- ${sentence.id}. ${sentence.text}`);
      }
      lines.push("");
    }
    lines.push(
      "Anoten en `reviews.json`, en las pasadas `reviewer-a` y `reviewer-b`: candidato correcto, periodo o fecha correctos, pasaje (`suficiente`, `insuficiente` o `no_aplica`), abstención en `no_verificable`, etiqueta propuesta, cada cita y cada oración.",
      "",
    );
  }
  return lines.join("\n");
}

function blankCase(item: CaseReport): CaseReview {
  return {
    id: item.id,
    passes: REVIEWERS.map((reviewer) => emptyPass(reviewer, item)),
    adjudicatedVerdict: null,
    adjudicatedPassage: null,
    adjudicatedAbstains: null,
    adjudicatedCitations: [],
    adjudicatedSentences: [],
  };
}

function emptyPass(reviewer: string, item: CaseReport): ReviewerPass {
  return {
    reviewer,
    candidateOk: null,
    periodOk: null,
    passageSupports: null,
    abstainsProperly: null,
    proposedVerdict: null,
    citations: item.sources.map((source) => ({ id: source.id, supportsExplanation: null })),
    sentences: item.sentences.map((sentence) => ({ id: sentence.id, needsSupport: null, supported: null })),
  };
}
