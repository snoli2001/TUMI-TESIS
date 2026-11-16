import assert from "node:assert/strict";
import test from "node:test";
import { statutesFor } from "./statutes";

test("una reelección de alcalde abre el compendio electoral y la ley de municipalidades", () => {
  const ids = statutesFor("Reelección de alcalde").map((statute) => statute.id);
  assert.deepEqual(ids, ["electoral-compendium", "municipal-law"]);
  assert.equal(ids.includes("criminal-code"), false);
});

test("una denuncia abre el código procesal penal", () => {
  assert.deepEqual(
    statutesFor("Tiene una denuncia").map((statute) => statute.id),
    ["criminal-procedure"],
  );
});

test("haber sido ministro no abre la ley del poder ejecutivo", () => {
  const ids = statutesFor("Fue ministro de Vivienda durante el gobierno de Alan García").map((statute) => statute.id);
  assert.equal(ids.includes("executive-law"), false);
  assert.ok(statutesFor("atribuciones del Consejo de Ministros").some((statute) => statute.id === "executive-law"));
});

test("una cifra de desempleo no abre ninguna norma", () => {
  assert.deepEqual(statutesFor("el desempleo ronda el 7 por ciento"), []);
});
