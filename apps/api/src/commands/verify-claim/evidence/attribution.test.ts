import assert from "node:assert/strict";
import test from "node:test";
import { accountIsCandidate, socialPostCounts, statementAppears } from "./attribution";

const identity = { name: "Daniel Belizario Urresti Elera", party: "Podemos Perú" };
const statement = "Vamos a construir un hospital en el Callao";

test("la frase completa cuenta como dicha", () => {
  const page = "Daniel Urresti: Vamos a construir un hospital en el Callao este año.";
  assert.equal(statementAppears(statement, page, identity), true);
});

test("el apellido y el partido no bastan para dar por dicha la frase", () => {
  const page = "Daniel Belizario Urresti Elera, congresista por Podemos Perú.";
  assert.equal(statementAppears(statement, page, identity), false);
});

test("la cuenta es suya cuando el título trae su nombre", () => {
  assert.equal(accountIsCandidate("Daniel Urresti", identity.name), true);
  assert.equal(accountIsCandidate("Podemos Perú", identity.name), false);
  assert.equal(accountIsCandidate("Urresti", identity.name), false);
});

test("un post ajeno no cuenta aunque cite la frase", () => {
  const page = "Urresti dijo: Vamos a construir un hospital en el Callao.";
  assert.equal(socialPostCounts("Diario Correo", page, statement, identity), false);
  assert.equal(socialPostCounts("Daniel Urresti", page, statement, identity), true);
});
