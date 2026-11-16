import assert from "node:assert/strict";
import test from "node:test";
import { isFactCheckUrl, isIpeUrl, isSocialUrl, roleForUrl, socialNetwork, trustedOutlet } from "./outlets";

test("un periódico peruano cuenta como prueba", () => {
  assert.equal(roleForUrl("https://elcomercio.pe/politica/elecciones"), "prueba");
  assert.equal(roleForUrl("https://www.larepublica.pe/nota"), "prueba");
  assert.equal(roleForUrl("https://rpp.pe/peru"), "prueba");
});

test("el verificador de La República cuenta como prueba y una nota general no es ese chequeo", () => {
  assert.equal(roleForUrl("https://larepublica.pe/verificador/es-falso-que-hubo-un-apagon"), "prueba");
  assert.equal(isFactCheckUrl("https://www.larepublica.pe/verificador/es-falso-que-hubo-un-apagon"), true);
  assert.equal(isFactCheckUrl("https://larepublica.pe/politica/elecciones"), false);
  assert.equal(trustedOutlet("https://larepublica.pe/politica/elecciones"), "La República");
});

test("PerúCheck, el IPE y los medios de respaldo prueban el dato", () => {
  assert.equal(roleForUrl("https://perucheck.pe/chequeos/un-dato"), "prueba");
  assert.equal(isFactCheckUrl("https://www.perucheck.pe/chequeos/un-dato"), true);
  assert.equal(trustedOutlet("https://perucheck.pe/chequeos/un-dato"), "PerúCheck");
  assert.equal(roleForUrl("https://www.ipe.org.pe/informe"), "prueba");
  assert.equal(isIpeUrl("https://www.ipe.org.pe/informe"), true);
  assert.equal(isFactCheckUrl("https://www.ipe.org.pe/informe"), false);
  assert.equal(trustedOutlet("https://ojo-publico.com/nota"), "OjoPúblico");
  assert.equal(trustedOutlet("https://www.idl-reporteros.pe/investigacion"), "IDL-Reporteros");
  assert.equal(trustedOutlet("https://andina.pe/nota"), "Agencia Andina");
  assert.equal(trustedOutlet("https://convoca.pe/nota"), "Convoca");
  assert.equal(trustedOutlet("https://ejemplo.com/nota"), null);
});

test("una página del Estado cuenta como prueba", () => {
  assert.equal(roleForUrl("https://www.gob.pe/institucion/presidencia"), "prueba");
});

test("una red social se reconoce y no verifica un hecho", () => {
  assert.equal(roleForUrl("https://www.facebook.com/elcomercio/posts/1"), "contraste");
  assert.equal(roleForUrl("https://es.wikipedia.org/wiki/Elecciones"), "contraste");
  assert.equal(roleForUrl("https://x.com/diario/status/1"), "contraste");
  assert.equal(isSocialUrl("https://www.facebook.com/danielurresti/posts/1"), true);
  assert.equal(isSocialUrl("https://www.instagram.com/p/1"), true);
  assert.equal(isSocialUrl("https://x.com/urresti/status/1"), true);
  assert.equal(isSocialUrl("https://www.tiktok.com/@urresti/video/1"), true);
  assert.equal(isSocialUrl("https://twitter.com/urresti/status/1"), true);
  assert.equal(isSocialUrl("https://elcomercio.pe/politica"), false);
  assert.equal(socialNetwork("https://www.facebook.com/danielurresti/posts/1"), "Facebook");
});

test("un blog desconocido no verifica", () => {
  assert.equal(roleForUrl("https://opinion.blogspot.com/2026/nota"), "contraste");
  assert.equal(roleForUrl("https://ejemplo.com/noticia"), "contraste");
  assert.equal(roleForUrl(null), "contraste");
});
