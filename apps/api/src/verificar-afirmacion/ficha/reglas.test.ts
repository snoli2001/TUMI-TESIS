import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decidir, type FichaOficial } from "./reglas";

const ficha: FichaOficial = {
  id: "hv-1",
  nombre: "Rafael Bernardo López Aliaga",
  cargo: "ALCALDE DISTRITAL",
  partido: "Renovación Popular",
  fotoUrl: null,
  codigoExpediente: "ERM.1",
  propuestas: [{ texto: "Construir un tren eléctrico hacia el Callao." }],
  sentencias: [],
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
});
