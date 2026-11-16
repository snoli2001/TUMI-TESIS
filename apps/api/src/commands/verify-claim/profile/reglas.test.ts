import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apellidoDe, consultasDe, consultaWeb, decidir, notaDelCandidato, type FichaOficial } from "./reglas";

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

  it("cita la hoja de vida cuando preguntan por procesos penales", () => {
    const regla = decidir("Tiene procesos penales", {
      ...ficha,
      sentencias: [{ texto: "DIFAMACIÓN AGRAVADA. 1 año de pena suspendida." }],
    });
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "verdadero");
    assert.equal(regla.fuente.titulo, "Hoja de vida");
    assert.match(regla.fuente.snippet, /DIFAMACIÓN/);
  });

  it("dice que la hoja no declara antecedentes si no hay filas", () => {
    const regla = decidir("Tiene antecedentes judiciales", ficha);
    assert.equal(regla?.tipo, "veredicto");
    if (regla?.tipo !== "veredicto") return;
    assert.equal(regla.verdict, "falso");
    assert.equal(regla.fuente.titulo, "Hoja de vida");
    assert.match(regla.explicacion, /no declara antecedentes penales/);
  });

  it("arma consultas de denuncias y de declaraciones públicas", () => {
    const penales = consultasDe("penal", "Abel López", "Abel López procesos penales");
    assert.ok(penales.some((consulta) => /denuncia/.test(consulta)));
    assert.ok(penales.some((consulta) => /expediente/.test(consulta)));
    const propuestas = consultasDe("propuesta", "Abel López", "Abel López tren");
    assert.ok(propuestas.some((consulta) => /propuesta|declaración|ofreció/.test(consulta)));
  });

  it("deja fuera una nota que no trae el apellido", () => {
    assert.equal(notaDelCandidato("Denuncia en la MML", "Hay un expediente abierto.", "Lopez"), false);
    assert.equal(
      notaDelCandidato("López enfrenta una denuncia", "El expediente sigue abierto.", apellidoDe("Abel Crisanto Lopez")),
      true,
    );
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
