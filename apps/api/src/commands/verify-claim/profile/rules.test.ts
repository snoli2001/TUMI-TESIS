import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchQueries, webQuery, claimFocus, mentionsClaim, countsAsProof, decide, asksOtherOffice, officeQueries, contextQueries, claimsToJudge, contrastTarget, fallbackQueries, searchList, isValueJudgment, sameCandidate, type OfficialProfile } from "./rules";

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

  it("abre la búsqueda de noticias cuando el cargo afirmado no es el del padrón", () => {
    assert.equal(asksOtherOffice("Sera alcalde de lima", "REGIDOR PROVINCIAL"), true);
    assert.equal(asksOtherOffice("Sera alcalde de lima", "ALCALDE PROVINCIAL"), false);
    const queries = officeQueries("Rafael López Aliaga", "Sera alcalde de lima", "REGIDOR PROVINCIAL");
    assert.ok(queries.some((item) => /reelección alcalde/.test(item)));
    assert.equal(officeQueries("Rafael López Aliaga", "Sera alcalde de lima", "ALCALDE PROVINCIAL").length, 0);
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

  it("no cierra una sanción con la fila de estudios solo porque la frase dice abogado", () => {
    const lawyer = {
      ...profile,
      name: "Elio Fernando Riera Garro",
      shortName: "Elio Riera",
      record: [{ kind: "study" as const, text: "ABOGADO, UNIVERSIDAD PERUANA DE CIENCIAS APLICADAS S.A.C., 2011" }],
    };
    const sentence =
      "El abogado Elio Riera Garro ha sido suspendido por tres meses del ejercicio profesional por presentar información falsa";
    const focus = contrastTarget(sentence);
    assert.match(focus, /suspendido/);
    assert.doesNotMatch(focus, /^El abogado/);
    assert.equal(decide(focus, lawyer), null);
    const degree = decide("Es abogado titulado", lawyer);
    assert.equal(degree?.kind, "verdict");
    if (degree?.kind !== "verdict") return;
    assert.equal(degree.verdict, "verdadero");
    assert.match(degree.source.snippet, /ABOGADO/);
  });

  it("deja pasar un hecho que la ficha no cubre", () => {
    assert.equal(decide("Visitó el mercado el domingo", profile), null);
  });

  it("no cierra una cifra de desempleo con la experiencia laboral", () => {
    const rule = decide("el desempleo ronda el 7 por ciento", {
      ...profile,
      record: [{ kind: "work", text: "GERENTE DE SEGURIDAD CIUDADANA, MUNICIPALIDAD DE LOS OLIVOS, 2019, 2019" }],
    });
    assert.equal(rule, null);
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

  it("no da por cierta la postulación cuando la hoja de vida solo comparte el partido", () => {
    const rule = decide("Daniel Belizario Urresti Elera figura como alcalde provincial por Podemos Perú", {
      ...profile,
      name: "Daniel Belizario Urresti Elera",
      shortName: "Daniel Urresti",
      office: "ALCALDE PROVINCIAL",
      party: "Podemos Perú",
      record: [{ kind: "elected", text: "Cargo electo, CONGRESISTA DE LA REPÚBLICA, PODEMOS PERU, 2020, 2021" }],
    });
    assert.equal(rule, null);
  });

  it("no cierra un ministerio con la hoja y deja el juicio de valor sin veredicto de ficha", () => {
    const allison = {
      ...profile,
      name: "Francis James Allison Oyague",
      shortName: "Francis Allison",
      office: "ALCALDE PROVINCIAL",
      party: "Avanza País",
      record: [{ kind: "elected" as const, text: "Cargo electo, ALCALDE DISTRITAL, MAGDALENA, 2015, 2018" }],
    };
    assert.equal(decide("Francis Allison fue ministro de Vivienda durante el gobierno de Alan García en 2009.", allison), null);
    assert.equal(decide("Francis Allison es el mejor alcalde que ha tenido Magdalena.", allison), null);
    assert.equal(decide("López Aliaga convirtió Lima en una potencia mundial.", profile), null);
    assert.equal(isValueJudgment("Francis Allison es el mejor alcalde que ha tenido Magdalena."), true);
    assert.deepEqual(contextQueries("Francis Allison", "fue ministro de Vivienda en 2009"), ["Francis Allison ministro"]);
    assert.deepEqual(contextQueries("Francis Allison", "renunció al Ministerio de Vivienda"), [
      "Francis Allison ministro",
      "Francis Allison renuncia",
    ]);
    assert.deepEqual(contextQueries("Carlos Bruce", "el proyecto era de matrimonio igualitario"), [
      "Carlos Bruce unión civil no matrimonial",
    ]);
    assert.deepEqual(contextQueries("Francis Allison", "Francis Allison nunca ocupó un ministerio."), [
      "Francis Allison fue ministro",
      "Francis Allison ministro",
    ]);
    assert.deepEqual(contextQueries("Elio Riera", "ha sido suspendido por tres meses del ejercicio profesional"), [
      "Elio Riera suspendido",
    ]);
    const backup = fallbackQueries("Elio Riera", "ha sido suspendido por tres meses del ejercicio profesional");
    assert.equal(backup.length, 1);
    assert.match(backup[0], /Elio Riera/);
    assert.match(backup[0], /suspendido/);
    assert.match(backup[0], /tres/);
    assert.doesNotMatch(backup[0], /abogado/i);
    const consulta = webQuery(
      "Elio Riera",
      "El abogado Elio Riera Garro ha sido suspendido por tres meses del ejercicio profesional",
      "Elio Fernando Riera Garro",
    );
    assert.match(consulta, /^Elio Riera /);
    assert.match(consulta, /suspendido tres meses/);
    assert.doesNotMatch(consulta, /abogado/i);
    const listed = searchList("Elio Riera", "ha sido suspendido por tres meses del ejercicio profesional", [
      "Elio Riera suspendido tres meses ejercicio profesional",
    ]);
    assert.deepEqual(listed, ["Elio Riera suspendido tres meses ejercicio profesional"]);
    assert.deepEqual(searchList("Elio Riera", "ha sido suspendido por tres meses del ejercicio profesional", []), backup);
    assert.deepEqual(
      claimsToJudge("Daniel Urresti fue ministro del Interior durante el gobierno de Alejandro Toledo.", [
        "Daniel Urresti fue ministro del Interior",
        "durante el gobierno de Alejandro Toledo",
      ]),
      ["Daniel Urresti fue ministro del Interior durante el gobierno de Alejandro Toledo."],
    );
    assert.deepEqual(
      claimsToJudge("Que López Aliaga prometiera 10.000 motos demuestra que las 10.000 fueron entregadas.", [
        "prometió 10.000 motos",
        "las entregó",
      ]),
      ["Que López Aliaga prometiera 10.000 motos demuestra que las 10.000 fueron entregadas."],
    );
    assert.deepEqual(claimsToJudge("Fue ministro. Renunció en 2009.", ["Fue ministro.", "Renunció en 2009."]), [
      "Fue ministro.",
      "Renunció en 2009.",
    ]);
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

  it("no cierra una cifra del Perú con la fila que solo comparte el país", () => {
    const rule = decide("el desempleo en el Peru ronda el 7 por ciento", {
      ...profile,
      party: "Podemos Perú",
      record: [{ kind: "elected", text: "CONGRESISTA DE LA REPÚBLICA, PODEMOS PERU, 2020, 2021" }],
    });
    assert.equal(rule, null);
    const consulta = webQuery("Daniel Urresti", "el desempleo en el Peru ronda el 7 por ciento", "Daniel Belizario Urresti Elera");
    assert.match(consulta, /desempleo/);
    assert.match(consulta, /Perú/);
  });

  it("busca la cifra en los medios aunque la nota no nombre al candidato", () => {
    const foco = claimFocus("Daniel Urresti el desempleo en el Peru ronda el 7 por ciento", "Daniel Belizario Urresti Elera");
    assert.match(foco, /desempleo/);
    assert.doesNotMatch(foco, /Urresti/i);
    assert.equal(
      mentionsClaim("IPE", "La tasa de desempleo en el Perú se mantiene cerca del 7 por ciento.", foco, "Daniel Belizario Urresti Elera"),
      true,
    );
    assert.equal(
      mentionsClaim("RPP", "Perfil de Daniel Urresti, el exministro que llegó al Congreso.", foco, "Daniel Belizario Urresti Elera"),
      false,
    );
    assert.equal(
      mentionsClaim("RPP", "Crece la tasa de desempleo en España.", foco, "Daniel Belizario Urresti Elera"),
      false,
    );
  });

  it("una nota de la misma persona no prueba el hecho si no lo menciona", () => {
    const identity = { name: "Elio Fernando Riera Garro" };
    const hecho = "ha sido suspendido por tres meses del ejercicio profesional";
    assert.equal(
      countsAsProof(
        {
          origin: "tavily",
          title: "El recurso fue presentado por el abogado Elio Riera",
          snippet: "Representó a Alberto Fujimori ante la Corte Suprema.",
          url: "https://larepublica.pe/politica/recurso",
        },
        hecho,
        identity,
      ),
      false,
    );
    assert.equal(
      countsAsProof(
        {
          origin: "tavily",
          title: "Suspenden a Elio Riera por faltar a la verdad",
          snippet: "No podrá ejercer la profesión por 3 meses.",
          url: "https://larepublica.pe/politica/suspenden",
        },
        hecho,
        identity,
      ),
      true,
    );
    assert.equal(
      mentionsClaim(
        "Hoja de vida",
        "ABOGADO, UNIVERSIDAD PERUANA DE CIENCIAS APLICADAS, 2011",
        hecho,
        "Elio Riera",
      ),
      false,
    );
  });

  it("reconoce la suspensión aunque el titular use otro tiempo del verbo", () => {
    assert.equal(
      mentionsClaim(
        "Suspenden a Elio Riera por faltar a la verdad",
        "No podrá ejercer la profesión por 3 meses.",
        "ha sido suspendido por tres meses del ejercicio profesional",
        "Elio Riera",
      ),
      true,
    );
  });
});
