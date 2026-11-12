import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeClause } from "./alcance";

describe("alcance del distrito", () => {
  it("incluye la contienda provincial y omite al gobernador en Lima metropolitana", () => {
    assert.deepEqual(scopeClause({ departamento: "14", provincia: "1401", distrito: "140106" }), {
      OR: [
        { list: { districtCode: "140106" } },
        { list: { districtCode: null, provinceCode: "1401" } },
      ],
    });
  });

  it("incluye al gobernador regional fuera de Lima metropolitana", () => {
    assert.deepEqual(scopeClause({ departamento: "14", provincia: "1404", distrito: "140401" }), {
      OR: [
        { list: { districtCode: "140401" } },
        { list: { districtCode: null, provinceCode: "1404" } },
        { list: { districtCode: null, provinceCode: null, departmentCode: "14" } },
      ],
    });
  });
});
