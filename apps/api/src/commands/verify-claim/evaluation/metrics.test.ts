import assert from "node:assert/strict";
import test from "node:test";
import { VERIFICATION_CASES } from "./cases";
import {
  citationScores,
  cohenKappa,
  confusion,
  isSupported,
  isTimeoutError,
  percentile,
  scorePilot,
  splitSentences,
} from "./metrics";
import { blankReviews } from "./rubric";
import type { CaseReport } from "./types";

test("el percentil interpola p50 y p95", () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([8], 0.95), 8);
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.ok(Math.abs((percentile([10, 20, 30, 40], 0.95) ?? 0) - 38.5) < 1e-9);
});

test("la matriz excluye del macro-F1 la clase sin referencia", () => {
  const scored = confusion([
    { gold: "verdadero", predicted: "verdadero" },
    { gold: "verdadero", predicted: "falso" },
    { gold: "falso", predicted: "falso" },
    { gold: "no_verificable", predicted: "no_verificable" },
  ]);
  const verdadero = scored.perClass.find((item) => item.label === "verdadero");
  const enganoso = scored.perClass.find((item) => item.label === "enganoso");
  assert.equal(verdadero?.support, 2);
  assert.ok(Math.abs((verdadero?.f1 ?? 0) - 2 / 3) < 1e-9);
  assert.equal(enganoso?.support, 0);
  assert.equal(enganoso?.f1, null);
  assert.deepEqual(scored.excluded, ["enganoso"]);
  assert.ok(Math.abs((scored.macroF1 ?? 0) - 7 / 9) < 1e-9);
  assert.equal(scored.matrix[0][0], 1);
  assert.equal(scored.matrix[0][1], 1);
});

test("un veredicto respaldado exige pasaje suficiente, y no verificable exige abstenerse", () => {
  assert.equal(
    isSupported({
      actual: "verdadero",
      adjudicatedVerdict: "verdadero",
      passageSupports: "suficiente",
      abstainsProperly: null,
    }),
    true,
  );
  assert.equal(
    isSupported({
      actual: "verdadero",
      adjudicatedVerdict: "verdadero",
      passageSupports: "insuficiente",
      abstainsProperly: null,
    }),
    false,
  );
  assert.equal(
    isSupported({
      actual: "no_verificable",
      adjudicatedVerdict: "no_verificable",
      passageSupports: "no_aplica",
      abstainsProperly: true,
    }),
    true,
  );
  assert.equal(
    isSupported({
      actual: "falso",
      adjudicatedVerdict: "no_verificable",
      passageSupports: "no_aplica",
      abstainsProperly: true,
    }),
    false,
  );
  assert.equal(
    isSupported({
      actual: "no_verificable",
      adjudicatedVerdict: "no_verificable",
      passageSupports: "no_aplica",
      abstainsProperly: false,
    }),
    false,
  );
});

test("la precisión y la cobertura ignoran el caso sin citas o sin oraciones que exigir respaldo", () => {
  const scored = citationScores(
    [{ supports: true }, { supports: false }],
    [
      { needsSupport: true, supported: true },
      { needsSupport: true, supported: false },
      { needsSupport: false, supported: false },
    ],
  );
  assert.equal(scored.precision, 0.5);
  assert.equal(scored.coverage, 0.5);
  assert.equal(citationScores([], []).precision, null);
  assert.equal(citationScores([], [{ needsSupport: false, supported: false }]).coverage, null);
});

test("el kappa de Cohen sale de las dos pasadas, antes de adjudicar", () => {
  assert.equal(cohenKappa(["verdadero", "verdadero", "falso", "falso"], ["verdadero", "falso", "falso", "falso"]), 0.5);
  assert.equal(cohenKappa(["verdadero", "falso"], ["verdadero", "falso"]), 1);
  assert.equal(cohenKappa(["verdadero", "falso"], ["falso", "verdadero"]), -1);
  assert.equal(cohenKappa([], []), null);
});

test("un tiempo agotado no se confunde con otro error", () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  assert.equal(isTimeoutError(timeout), true);
  assert.equal(isTimeoutError(aborted), true);
  assert.equal(isTimeoutError(new Error("500")), false);
});

test("las oraciones de la explicación quedan numeradas", () => {
  assert.deepEqual(splitSentences("  Renunció en 2009.   La fuente lo fecha el 27. "), [
    { id: "o1", text: "Renunció en 2009." },
    { id: "o2", text: "La fuente lo fecha el 27." },
  ]);
  assert.deepEqual(splitSentences("   "), []);
});

test("sin rúbrica no se publica macro-F1 ni verificación respaldada", () => {
  const scored = scorePilot([sample("FA01", "verdadero")], null);
  assert.equal(scored.confusion, null);
  assert.equal(scored.supported, null);
  assert.equal(scored.citations, null);
  assert.ok(scored.pending.some((line) => line.includes("reviews.json")));
});

test("el pasaje acordado por los dos revisores cuenta sin una adjudicación aparte", () => {
  const reviews = blankReviews([sample("FA01", "verdadero")]);
  const review = reviews.cases[0];
  review.adjudicatedVerdict = "verdadero";
  review.passes[0].passageSupports = "suficiente";
  review.passes[1].passageSupports = "suficiente";
  review.passes[0].proposedVerdict = "verdadero";
  review.passes[1].proposedVerdict = "falso";
  review.adjudicatedCitations = [{ id: "s1", supportsExplanation: false }];
  review.adjudicatedSentences = [{ id: "o1", needsSupport: false, supported: false }];
  const ready = scorePilot([sample("FA01", "verdadero")], reviews);
  assert.equal(ready.supported?.supported, 1);
  assert.equal(ready.kappaLabel?.value, 0);
  assert.equal(ready.kappaPassage?.value, 1);
  review.passes[1].passageSupports = "insuficiente";
  review.adjudicatedPassage = null;
  const split = scorePilot([sample("FA01", "verdadero")], reviews);
  assert.equal(split.supported, null);
});

test("el macro-F1 espera la etiqueta adjudicada de cada caso", () => {
  const pending = scorePilot([sample("RLA04", "enganoso")], blankReviews([sample("RLA04", "enganoso")]));
  assert.equal(pending.confusion, null);
  assert.ok(pending.pending.some((line) => line.includes("RLA04")));

  const reviews = blankReviews([sample("FA01", "verdadero")]);
  reviews.cases[0].adjudicatedVerdict = "verdadero";
  reviews.cases[0].adjudicatedPassage = "suficiente";
  reviews.cases[0].adjudicatedCitations = [{ id: "s1", supportsExplanation: true }];
  reviews.cases[0].adjudicatedSentences = [{ id: "o1", needsSupport: true, supported: true }];
  const ready = scorePilot([sample("FA01", "verdadero")], reviews);
  assert.equal(ready.confusion?.macroF1, 1);
  assert.equal(ready.supported?.supported, 1);
  assert.equal(ready.citations?.precision, 1);
  assert.equal(ready.citations?.coverage, 1);
  assert.equal(ready.pending.length, 0);
});

test("la plantilla en blanco no adjudica los casos con dos etiquetas", () => {
  const dual = VERIFICATION_CASES.filter((item) => item.verdicts.length > 1).map((item) => item.id);
  assert.deepEqual(dual, ["RLA04", "DU05", "CB05"]);
  const reviews = blankReviews(dual.map((id) => sample(id, "falso")));
  assert.ok(reviews.cases.every((item) => item.adjudicatedVerdict === null));
  assert.ok(reviews.cases.every((item) => item.adjudicatedPassage === null));
});

function sample(id: string, actual: string): CaseReport {
  const item = VERIFICATION_CASES.find((candidate) => candidate.id === id) ?? VERIFICATION_CASES[0];
  return {
    id,
    person: item.person,
    claim: item.claim,
    expectedLabel: item.expectedLabel,
    verdicts: item.verdicts,
    evaluates: item.evaluates,
    criterion: item.criterion,
    status: item.verdicts.includes(actual as (typeof item.verdicts)[number]) ? "coincide" : "difiere",
    actual,
    explanation: "La fuente lo confirma.",
    conclusion: null,
    sentences: [{ id: "o1", text: "La fuente lo confirma." }],
    citedReference: true,
    sources: [{ id: "s1", title: "Nota", url: "https://ejemplo.pe/nota", snippet: "El hecho ocurrió.", origin: "tavily", role: "prueba" }],
    entity: { id: "hoja", nombre: item.person, cargo: "alcalde" },
    firstEventMs: 100,
    resultMs: 400,
    error: null,
  };
}
