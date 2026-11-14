import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearGestorCookie, GESTOR_COOKIE, readCookie } from "./gestor-cookie";
import { hashPassword, passwordsMatch } from "./gestor-password";

describe("cuenta de gestor", () => {
  it("acepta la contraseña guardada y rechaza otra", async () => {
    const stored = await hashPassword("clave-segura");
    assert.equal(await passwordsMatch("clave-segura", stored), true);
    assert.equal(await passwordsMatch("otra-clave", stored), false);
  });

  it("lee la cookie de sesión y sabe borrarla", () => {
    const header = `otra=1; ${GESTOR_COOKIE}=abc%3D; tema=claro`;
    assert.equal(readCookie(header, GESTOR_COOKIE), "abc=");
    assert.match(clearGestorCookie(), /Max-Age=0/);
    assert.match(clearGestorCookie(), /HttpOnly/);
  });
});
