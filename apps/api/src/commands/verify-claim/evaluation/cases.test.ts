import assert from "node:assert/strict";
import test from "node:test";
import { acceptsVerdict, SYSTEM_VERDICTS, VERIFICATION_CASES } from "./cases";

const SHEET_IDS = [
  "FA01",
  "FA02",
  "FA03",
  "FA04",
  "FA05",
  "RLA01",
  "RLA02",
  "RLA03",
  "RLA04",
  "RLA05",
  "DU01",
  "DU02",
  "DU03",
  "DU04",
  "DU05",
  "CB01",
  "CB02",
  "CB03",
  "CB04",
  "CB05",
];

test("el excel de 20 casos queda completo y sin ids repetidos", () => {
  assert.deepEqual(
    VERIFICATION_CASES.map((item) => item.id),
    SHEET_IDS,
  );
  for (const item of VERIFICATION_CASES) {
    assert.ok(item.claim.length >= 3);
    assert.ok(item.person.length > 0);
    assert.ok(item.expectedLabel.length > 0);
    assert.ok(item.verdicts.length > 0);
    assert.ok(item.verdicts.every((verdict) => SYSTEM_VERDICTS.includes(verdict)));
  }
});

test("los cuatro candidatos del excel están en el padrón", () => {
  const allison = VERIFICATION_CASES.filter((item) => item.id.startsWith("FA"));
  assert.equal(allison.length, 5);
  assert.ok(allison.every((item) => item.hojaVidaId === "1b4pvxyc6zJcQNGQp5doIM1eX158DFP0"));
  assert.equal(VERIFICATION_CASES.find((item) => item.id === "RLA01")?.hojaVidaId, "LZ86U1WYupCPYU-px-E4qO9K4Aok9MFB");
  assert.equal(VERIFICATION_CASES.find((item) => item.id === "DU01")?.hojaVidaId, "UzLWGIgjNnjYEo-fJETLJPEd1njU0d82");
  assert.equal(VERIFICATION_CASES.find((item) => item.id === "CB01")?.hojaVidaId, "24PfKYKBrbTRS4GAQW8a2NNjeGa7__zS");
});

test("una opinión no se acepta como verdadero y una conclusión no sustentada sí como engañoso", () => {
  const opinion = VERIFICATION_CASES.find((item) => item.id === "FA05");
  const promise = VERIFICATION_CASES.find((item) => item.id === "RLA04");
  assert.ok(opinion);
  assert.ok(promise);
  assert.equal(acceptsVerdict(opinion, "no_verificable"), true);
  assert.equal(acceptsVerdict(opinion, "verdadero"), false);
  assert.equal(acceptsVerdict(promise, "enganoso"), true);
  assert.equal(acceptsVerdict(promise, "verdadero"), false);
});
