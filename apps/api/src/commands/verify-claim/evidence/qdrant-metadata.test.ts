import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFilter } from "./qdrant-metadata";

test("el plan no entra si la pregunta no es de propuestas", () => {
  const filter = evidenceFilter({
    codigoExpedientes: ["ERM.1"],
    hojaVidaIds: ["hv-1"],
    includePlan: false,
  });
  assert.deepEqual(filter, {
    should: [
      {
        must: [
          { key: "origen", match: { value: "documento" } },
          { key: "hojaVidaId", match: { any: ["hv-1"] } },
        ],
      },
    ],
  });
});

test("un documento entra solo para el candidato indicado", () => {
  const filter = evidenceFilter({ codigoExpedientes: [], hojaVidaIds: ["hv-1"] });
  assert.deepEqual(filter, {
    should: [
      {
        must: [
          { key: "origen", match: { value: "documento" } },
          { key: "hojaVidaId", match: { any: ["hv-1"] } },
        ],
      },
    ],
  });
});
