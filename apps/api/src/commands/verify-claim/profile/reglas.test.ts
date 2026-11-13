import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultaWeb, decidir, type FichaOficial } from "./reglas";

const ficha: FichaOficial = {
  id: "hv-1",
  nombre: "Rafael Bernardo López Aliaga",
  cargo: "ALCALDE DISTRITAL",
  partido: "Renovación Popular",
  fotoUrl: null,
  codigoExpediente: "ERM.1",
  propuestas: [{ texto: "Construir un tren eléctrico hacia el Callao." }],
  sentencias: [],
  trayectoria: [],
  nombreCorto: "Rafael López Aliaga",
};

describe("reglas de la ficha", () => {
  it("marca falso un delito sin sentencia y no deja el hecho abierto", () => {
    const regla = decidir("Lopez aliaga es un violador", ficha);
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "falso");
    assert.match(regla.explicacion, /no registra una sentencia/);
  });

  it("cita la sentencia cuando el fallo habla del hecho", () => {
    const regla = decidir("Lopez aliaga es un violador", {
      ...ficha,
      sentencias: [{ texto: "Violación sexual. Fallo condenatorio." }],
    });
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "verdadero");
    assert.match(regla.fuente.snippet, /Violación/);
  });

  it("rechaza a otra persona sin abrir una búsqueda", () => {
    const regla = decidir("Keiko Fujimori miente", ficha);
    assert.equal(regla?.tipo, "fuera");
  });

  it("no confunde el inicio de la frase con otra persona", () => {
    assert.equal(decidir("Tiene antecedentes judiciales", ficha), null);
  });

  it("marca falso un cargo que no está en el padrón", () => {
    const regla = decidir("Es gobernador regional", ficha);
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "falso");
  });

  it("marca falso un partido distinto", () => {
    const regla = decidir("Postula por el partido Morado", ficha);
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "falso");
  });

  it("cita la propuesta cuando el plan la contiene", () => {
    const regla = decidir("Prometió un tren eléctrico", ficha);
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "verdadero");
    assert.equal(regla.fuente.titulo, "Plan de gobierno");
  });

  it("deja pasar un hecho que la ficha no cubre", () => {
    assert.equal(decidir("Visitó el mercado el domingo", ficha), null);
  });

  it("niega un cargo previo que la hoja de vida no declara", () => {
    const regla = decidir("Es un excongresista del partido Avanza País que postula a la alcaldía de Lima", {
      ...ficha,
      nombre: "Francis James Allison Oyague",
      nombreCorto: "Francis Allison",
      cargo: "ALCALDE PROVINCIAL",
      partido: "Avanza País",
      trayectoria: [{ clase: "electo", texto: "Cargo electo, ALCALDE DISTRITAL, MAGDALENA AVANZA, 2015, 2018" }],
    });
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "falso");
    assert.equal(regla.fuente.titulo, "Hoja de vida");
    assert.match(regla.fuente.snippet, /ALCALDE DISTRITAL/);
  });

  it("cita el cargo previo que sí está en la hoja de vida", () => {
    const regla = decidir("Es un excongresista", {
      ...ficha,
      trayectoria: [{ clase: "electo", texto: "Cargo electo, CONGRESISTA, FUERZA POPULAR, 2011, 2016" }],
    });
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "verdadero");
    assert.match(regla.fuente.snippet, /CONGRESISTA/);
  });

  it("busca en la web con el nombre corto y el hecho, sin la frase larga de la elección", () => {
    const consulta = consultaWeb(
      "Francis Allison",
      "Es un excongresista del partido Avanza País que postula a la alcaldía de Lima",
      "Francis James Allison Oyague",
    );
    assert.match(consulta, /^Francis Allison /);
    assert.match(consulta, /excongresista/);
    assert.doesNotMatch(consulta, /Oyague/);
    assert.doesNotMatch(consulta, /elecciones regionales/);
  });
});
