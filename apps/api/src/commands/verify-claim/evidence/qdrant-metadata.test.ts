import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFilter, statuteFilter } from "./qdrant-metadata";

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

test("las normas no se mezclan con el filtro del candidato", () => {
  const filter = evidenceFilter({ codigoExpedientes: ["ERM.1"], hojaVidaIds: ["hv-1"] });
  const clause = JSON.stringify(filter);
  assert.equal(clause.includes("norma"), false);
  assert.equal(statuteFilter([]), null);
  assert.deepEqual(statuteFilter(["electoral-compendium", "municipal-law"]), {
    should: [
      {
        must: [
          { key: "origen", match: { value: "norma" } },
          { key: "documentId", match: { any: ["electoral-compendium", "municipal-law"] } },
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
