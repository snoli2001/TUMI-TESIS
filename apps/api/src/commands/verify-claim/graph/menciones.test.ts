import assert from "node:assert/strict";
import test from "node:test";
import { mejorCoincidencia, menciones, nombresAlInicio, nombresEnTexto, pruebaSirve } from "./menciones";

test("toma el apodo en mayúscula y no la primera palabra de la frase", () => {
  assert.deepEqual(menciones("Los trenes de Porky no sirven"), ["Porky"]);
});

test("toma el apodo aunque la frase venga en minúsculas", () => {
  assert.deepEqual(menciones("los trenes de porky no sirven"), ["porky"]);
});

test("no trata como apodo una palabra común que lleva y", () => {
  assert.deepEqual(menciones("el proyecto ya no tiene apoyo"), []);
});

test("saca el nombre legal que acompaña al apodo en un título", () => {
  const text = "Rafael López Aliaga - Los trenes de Porky funcionan. Phillip Butters despotrica.";
  assert.ok(nombresEnTexto(text, ["porky"]).includes("Rafael López Aliaga"));
});

test("se queda con quien coincide en más partes del nombre", () => {
  const kept = mejorCoincidencia([
    {
      entity: { id: "aliaga", nombre: "Rafael Bernardo López Aliaga Cazorla" },
      tokens: ["Rafael", "López", "Aliaga"],
    },
    {
      entity: { id: "gloria", nombre: "Gloria Pilar Rafael Lopez" },
      tokens: ["Rafael", "Lopez"],
    },
    {
      entity: { id: "minori", nombre: "Rafael Minori Lopez" },
      tokens: ["Rafael", "Lopez"],
    },
  ]);
  assert.deepEqual(kept.map((entity) => entity.id), ["aliaga"]);
});

test("toma el apellido que sigue a un nombre escrito solo con la primera mayúscula", () => {
  assert.deepEqual(nombresAlInicio("Lopez aliaga es un violador"), ["Lopez", "aliaga"]);
});

test("no toma como nombre una frase que empieza por el dato", () => {
  assert.deepEqual(nombresAlInicio("Tiene antecedentes judiciales"), []);
  assert.deepEqual(nombresAlInicio("Acumula denuncias graves"), []);
  assert.deepEqual(nombresAlInicio("Fue Lopez el responsable"), []);
});

test("una nota con el apellido y un expediente sí sirve en una pregunta penal", () => {
  const nota = {
    origin: "tavily",
    title: "López enfrenta una denuncia",
    snippet: "El expediente judicial sigue abierto en Lima.",
  };
  assert.equal(pruebaSirve(["Tiene procesos penales"], nota, ["Abel", "Lopez"]), true);
});

test("una nota que no menciona el hecho no sirve de prueba", () => {
  const nota = {
    origin: "tavily",
    title: "Allison responsabiliza a López Aliaga y al JNE por crisis en Lima",
    snippet: "Allison cuestionó que el JNE no haya establecido este criterio con anticipación.",
  };
  assert.equal(pruebaSirve(["Lopez aliaga es un violador"], nota, ["Lopez", "aliaga"]), false);
});

test("arma nombres propios a partir del texto del buscador", () => {
  const text = "Porky es el apelativo de Cirilo García, candidato en San Ignacio.";
  assert.ok(nombresEnTexto(text, ["Porky"]).includes("Cirilo García"));
});
