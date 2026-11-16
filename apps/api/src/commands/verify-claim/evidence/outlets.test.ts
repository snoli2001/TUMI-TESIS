import assert from "node:assert/strict";
import test from "node:test";
import { roleForUrl } from "./outlets";

test("un periódico peruano cuenta como prueba", () => {
  assert.equal(roleForUrl("https://elcomercio.pe/politica/elecciones"), "prueba");
  assert.equal(roleForUrl("https://www.larepublica.pe/nota"), "prueba");
  assert.equal(roleForUrl("https://rpp.pe/peru"), "prueba");
});

test("una página del Estado cuenta como prueba", () => {
  assert.equal(roleForUrl("https://www.gob.pe/institucion/presidencia"), "prueba");
});

test("facebook y wikipedia no verifican", () => {
  assert.equal(roleForUrl("https://www.facebook.com/elcomercio/posts/1"), "contraste");
  assert.equal(roleForUrl("https://es.wikipedia.org/wiki/Elecciones"), "contraste");
  assert.equal(roleForUrl("https://x.com/diario/status/1"), "contraste");
});

test("un blog desconocido no verifica", () => {
  assert.equal(roleForUrl("https://opinion.blogspot.com/2026/nota"), "contraste");
  assert.equal(roleForUrl("https://ejemplo.com/noticia"), "contraste");
  assert.equal(roleForUrl(null), "contraste");
});
