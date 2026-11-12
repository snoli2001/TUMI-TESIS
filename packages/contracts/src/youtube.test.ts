import assert from "node:assert/strict";
import test from "node:test";
import { idDeYoutube } from "./youtube.js";

test("acepta watch, shorts y youtu.be", () => {
  assert.equal(idDeYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(idDeYoutube("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(idDeYoutube("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("rechaza playlist, canal y live", () => {
  assert.equal(idDeYoutube("https://www.youtube.com/playlist?list=PL123"), null);
  assert.equal(idDeYoutube("https://www.youtube.com/@canal"), null);
  assert.equal(idDeYoutube("https://www.youtube.com/live/dQw4w9WgXcQ"), null);
  assert.equal(idDeYoutube("https://ejemplo.com/watch?v=dQw4w9WgXcQ"), null);
});
