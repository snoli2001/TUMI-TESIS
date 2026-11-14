import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPastRetention, markWithdrawnPayload, WITHDRAWN_NOTE } from "@tumi/database";
import { isPdf } from "./pdf";

describe("retención y pdf", () => {
  it("vence solo lo anterior al plazo", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    const old = new Date("2026-10-01T00:00:00Z");
    const recent = new Date("2026-11-01T00:00:00Z");
    assert.equal(isPastRetention(old, 30, now), true);
    assert.equal(isPastRetention(recent, 30, now), false);
  });

  it("marca la cita retirada sin borrar el texto", () => {
    const marked = markWithdrawnPayload(
      { sources: [{ id: "doc-1-p1-c0", snippet: "El plan propone un tren." }] },
      "doc-1",
    ) as { sources: Array<{ snippet: string }> };
    assert.match(marked.sources[0].snippet, /El plan propone un tren/);
    assert.match(marked.sources[0].snippet, new RegExp(WITHDRAWN_NOTE.trim()));
  });

  it("reconoce la firma de un PDF y rechaza otro archivo", () => {
    assert.equal(isPdf(Buffer.from("%PDF-1.7")), true);
    assert.equal(isPdf(Buffer.from("no es un pdf")), false);
  });
});
