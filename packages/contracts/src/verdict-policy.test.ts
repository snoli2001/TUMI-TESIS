import assert from "node:assert/strict";
import test from "node:test";
import { resolveVerdict, type DecisionAnswer } from "./verdict-policy.js";

test("un refusal del veredicto deja el claim como no verificable", () => {
  const answers: DecisionAnswer[] = [
    { type: "refusal", name: "veredicto" },
    { type: "predicate", name: "apoya", probability: 0.2 },
  ];
  assert.deepEqual(resolveVerdict(answers, 0.55), {
    verdict: "no_verificable",
    confidence: null,
  });
});

test("una confianza bajo el umbral no conserva el choice", () => {
  const answers: DecisionAnswer[] = [
    {
      type: "choice",
      name: "veredicto",
      choice: "verdadero",
      confidence: 0.4,
      probabilities: [{ value: "verdadero", probability: 0.4 }],
    },
  ];
  assert.deepEqual(resolveVerdict(answers, 0.55), {
    verdict: "no_verificable",
    confidence: 0.4,
  });
});

test("un choice por encima del umbral se respeta", () => {
  const answers: DecisionAnswer[] = [
    {
      type: "choice",
      name: "veredicto",
      choice: "falso",
      confidence: 0.91,
      probabilities: [{ value: "falso", probability: 0.91 }],
    },
  ];
  assert.deepEqual(resolveVerdict(answers, 0.55), {
    verdict: "falso",
    confidence: 0.91,
  });
});

test("sin respuesta de veredicto no inventa probabilidad", () => {
  assert.deepEqual(resolveVerdict([], 0.55), {
    verdict: "no_verificable",
    confidence: null,
  });
});
