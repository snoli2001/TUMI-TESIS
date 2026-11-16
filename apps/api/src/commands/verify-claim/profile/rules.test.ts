import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchQueries, webQuery, decide, sameCandidate, type OfficialProfile } from "./rules";

const profile: OfficialProfile = {
  id: "hv-1",
  name: "Rafael Bernardo López Aliaga",
  office: "ALCALDE DISTRITAL",
  party: "Renovación Popular",
  fotoUrl: null,
  codigoExpediente: "ERM.1",
  proposals: [{ text: "Construir un tren eléctrico hacia el Callao." }],
  sentences: [],
  record: [],
  shortName: "Rafael López Aliaga",
};

describe("profile rules", () => {
  it("marca falso un delito sin sentencia y no deja el hecho abierto", () => {
    const rule = decide("Lopez aliaga es un violador", profile);
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "falso");
    assert.match(rule.explanation, /no registra una sentencia/);
  });

  it("cita la sentencia cuando el fallo habla del hecho", () => {
    const rule = decide("Lopez aliaga es un violador", {
      ...profile,
      sentences: [{ text: "Violación sexual. Fallo condenatorio." }],
    });
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "verdadero");
    assert.match(rule.source.snippet, /Violación/);
  });

  it("rechaza a otra persona sin abrir una búsqueda", () => {
    const rule = decide("Keiko Fujimori miente", profile);
    assert.equal(rule?.kind, "outside");
  });

  it("cita la hoja de vida cuando preguntan por procesos penales", () => {
    const rule = decide("Tiene procesos penales", {
      ...profile,
      sentences: [{ text: "DIFAMACIÓN AGRAVADA. 1 año de pena suspendida." }],
    });
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "verdadero");
    assert.equal(rule.source.title, "Hoja de vida");
    assert.match(rule.source.snippet, /DIFAMACIÓN/);
  });

  it("dice que la hoja no declara antecedentes si no hay filas", () => {
    const rule = decide("Tiene antecedentes judiciales", profile);
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "falso");
    assert.equal(rule.source.title, "Hoja de vida");
    assert.match(rule.explanation, /no declara antecedentes penales/);
  });

  it("arma consultas de denuncias y de declaraciones públicas", () => {
    const penales = searchQueries("criminal", "Abel López", "Abel López procesos penales");
    assert.ok(penales.some((consulta) => /denuncia/.test(consulta)));
    assert.ok(penales.some((consulta) => /expediente/.test(consulta)));
    const proposals = searchQueries("proposal", "Abel López", "Abel López tren");
    assert.ok(proposals.some((consulta) => /propuesta|declaración|ofreció/.test(consulta)));
  });

  it("exige dos señales de que la nota habla del mismo candidato", () => {
    const abel = { name: "Abel Crisanto Lopez", party: "Alianza para el Progreso" };
    assert.equal(sameCandidate("Denuncia en la MML", "Hay un expediente abierto.", abel), false);
    assert.equal(sameCandidate("López enfrenta una denuncia", "El expediente sigue abierto.", abel), false);
    assert.equal(sameCandidate("Abel López enfrenta una denuncia", "El expediente sigue abierto.", abel), true);
    assert.equal(
      sameCandidate("López, candidato de Alianza para el Progreso", "El expediente sigue abierto.", abel),
      true,
    );
  });

  it("marca falso un cargo que no está en el padrón", () => {
    const rule = decide("Es gobernador regional", profile);
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "falso");
  });

  it("marca falso un partido distinto", () => {
    const rule = decide("Postula por el partido Morado", profile);
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "falso");
  });

  it("cita la propuesta cuando el plan la contiene", () => {
    const rule = decide("Prometió un tren eléctrico", profile);
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "verdadero");
    assert.equal(rule.source.title, "Plan de gobierno");
  });

  it("deja pasar un hecho que la ficha no cubre", () => {
    assert.equal(decide("Visitó el mercado el domingo", profile), null);
  });

  it("niega un cargo previo que la hoja de vida no declara", () => {
    const rule = decide("Es un excongresista del partido Avanza País que postula a la alcaldía de Lima", {
      ...profile,
      name: "Francis James Allison Oyague",
      shortName: "Francis Allison",
      office: "ALCALDE PROVINCIAL",
      party: "Avanza País",
      record: [{ kind: "elected", text: "Cargo electo, ALCALDE DISTRITAL, MAGDALENA AVANZA, 2015, 2018" }],
    });
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "falso");
    assert.equal(rule.source.title, "Hoja de vida");
    assert.match(rule.source.snippet, /ALCALDE DISTRITAL/);
  });

  it("cita el cargo previo que sí está en la hoja de vida", () => {
    const rule = decide("Es un excongresista", {
      ...profile,
      record: [{ kind: "elected", text: "Cargo electo, CONGRESISTA, FUERZA POPULAR, 2011, 2016" }],
    });
    assert.equal(rule?.kind, "verdict");
    if (rule?.kind !== "verdict") return;
    assert.equal(rule.verdict, "verdadero");
    assert.match(rule.source.snippet, /CONGRESISTA/);
  });

  it("busca en la web con el nombre corto y el hecho, sin la frase larga de la elección", () => {
    const consulta = webQuery(
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
