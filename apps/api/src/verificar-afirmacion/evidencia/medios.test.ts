import assert from "node:assert/strict";
import test from "node:test";
import { rolDeUrl } from "./medios";

test("un periódico peruano cuenta como prueba", () => {
  assert.equal(rolDeUrl("https://elcomercio.pe/politica/elecciones"), "prueba");
  assert.equal(rolDeUrl("https://www.larepublica.pe/nota"), "prueba");
  assert.equal(rolDeUrl("https://rpp.pe/peru"), "prueba");
});

test("una página del Estado cuenta como prueba", () => {
  assert.equal(rolDeUrl("https://www.gob.pe/institucion/presidencia"), "prueba");
});

test("facebook y wikipedia no verifican", () => {
  assert.equal(rolDeUrl("https://www.facebook.com/elcomercio/posts/1"), "contraste");
  assert.equal(rolDeUrl("https://es.wikipedia.org/wiki/Elecciones"), "contraste");
  assert.equal(rolDeUrl("https://x.com/diario/status/1"), "contraste");
});

test("un blog desconocido no verifica", () => {
  assert.equal(rolDeUrl("https://opinion.blogspot.com/2026/nota"), "contraste");
  assert.equal(rolDeUrl("https://ejemplo.com/noticia"), "contraste");
  assert.equal(rolDeUrl(null), "contraste");
});
