import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFilter } from "./qdrant-metadata";

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
