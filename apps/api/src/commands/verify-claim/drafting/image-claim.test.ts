import assert from "node:assert/strict";
import test from "node:test";
import { factCheckRequestSchema } from "@tumi/contracts";
import { imageBytes } from "./image-bytes";
import { parseImageReading, readingLine } from "./image-reading";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("una imagen sin texto es una consulta válida", () => {
  const parsed = factCheckRequestSchema.safeParse({
    query: "",
    hojaVidaId: "hv-1",
    image: { mediaType: "image/png", data: PNG },
  });
  assert.equal(parsed.success, true);
});

test("sin texto ni imagen la consulta se rechaza", () => {
  const parsed = factCheckRequestSchema.safeParse({ query: "", hojaVidaId: "hv-1" });
  assert.equal(parsed.success, false);
});

test("una nota devuelve las declaraciones que hay que contrastar", () => {
  const reading = parseImageReading(
    '{"kind":"statement","claims":["Voy a construir un tren.","El hospital abre en 2027."]}',
  );
  assert.equal(reading.kind, "statement");
  assert.deepEqual(reading.claims, ["Voy a construir un tren.", "El hospital abre en 2027."]);
  assert.equal(readingLine(reading.kind), "Leímos las declaraciones de la nota.");
});

test("sin declaración la imagen no se contrasta", () => {
  assert.deepEqual(parseImageReading('{"kind":"other","claims":[]}'), { kind: "other", claims: [] });
  assert.deepEqual(parseImageReading("no es json"), { kind: "other", claims: [] });
});

test("acepta la firma PNG y rechaza un archivo que no es imagen", () => {
  assert.ok(imageBytes({ mediaType: "image/png", data: PNG }));
  assert.equal(imageBytes({ mediaType: "image/png", data: Buffer.from("hola").toString("base64") }), null);
  assert.equal(imageBytes({ mediaType: "image/jpeg", data: PNG }), null);
});
