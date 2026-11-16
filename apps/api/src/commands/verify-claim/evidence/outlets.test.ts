import assert from "node:assert/strict";
import test from "node:test";
import { isFactCheckUrl, roleForUrl } from "./outlets";

test("un periódico peruano cuenta como prueba", () => {
  assert.equal(roleForUrl("https://elcomercio.pe/politica/elecciones"), "prueba");
  assert.equal(roleForUrl("https://www.larepublica.pe/nota"), "prueba");
  assert.equal(roleForUrl("https://rpp.pe/peru"), "prueba");
});

test("el verificador de La República cuenta como prueba y una nota general no es ese chequeo", () => {
  assert.equal(roleForUrl("https://larepublica.pe/verificador/es-falso-que-hubo-un-apagon"), "prueba");
  assert.equal(isFactCheckUrl("https://www.larepublica.pe/verificador/es-falso-que-hubo-un-apagon"), true);
  assert.equal(isFactCheckUrl("https://larepublica.pe/politica/elecciones"), false);
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
