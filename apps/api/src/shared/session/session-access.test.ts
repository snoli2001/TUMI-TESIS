import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessKeysMatch, hashAccessKey } from "./session-access";

describe("llave de sesión", () => {
  it("acepta la misma llave y rechaza otra", () => {
    const hash = hashAccessKey("llave-de-esta-sesion");
    assert.equal(accessKeysMatch(hash, "llave-de-esta-sesion"), true);
    assert.equal(accessKeysMatch(hash, "llave-de-otra-sesion"), false);
  });
});
