import assert from "node:assert/strict";
import test from "node:test";
import { factCheckRequestSchema } from "@tumi/contracts";
import { imageBytes } from "./image-bytes";

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

test("acepta la firma PNG y rechaza un archivo que no es imagen", () => {
  assert.ok(imageBytes({ mediaType: "image/png", data: PNG }));
  assert.equal(imageBytes({ mediaType: "image/png", data: Buffer.from("hola").toString("base64") }), null);
  assert.equal(imageBytes({ mediaType: "image/jpeg", data: PNG }), null);
});
