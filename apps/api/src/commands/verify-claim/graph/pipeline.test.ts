import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import type { EntityRef } from "@tumi/contracts";
import { buildGraph } from "./fact-check.graph";
import type { AgentDeps, EvidenceItem } from "./state";

const aurora: EntityRef = {
  id: "demo-aurora",
  nombre: "Aurora Quispe Demo",
  cargo: "Presidencia",
  partido: "Movimiento Demostración del Sol",
  fotoUrl: null,
  alias: "Porky",
};

const evidence: EvidenceItem = {
  id: "demo-doc-aurora-plan-f0",
  title: "Plan de demostración",
  url: null,
  snippet: "El plan promete un tren eléctrico Lima–Callao en cuatro años.",
  origin: "jne",
  role: "prueba",
  stance: null,
  pagina: 4,
  codigoExpediente: "ERM.DEMO",
  candidatoId: "demo-aurora",
};

function degradedDeps(): AgentDeps {
  return {
    decisionsEnabled: () => false,
    searchCandidates: async () => [aurora],
    chooseCandidate: async () => {
      throw new Error("Decisions no debe llamarse sin clave");
    },
    extractClaims: async (query) => [query],
    searchEvidence: async () => [evidence],
    planQueries: async () => [],
    rerank: async (_claims, items) => items,
    clasificarCirculacion: async (_claims, items) => items,
    judgeClaim: async () => ({
      verdict: "no_verificable",
      confidence: null,
      degraded: true,
      explanation: "Sin clasificador.",
      decisions: [],
    }),
    explain: async (state, onToken) => {
      const text = `Demostración. ${state.claims[0]} queda no verificable.`;
      onToken(text);
      return text;
    },
  };
}

test("el grafo degradado no inventa probabilidades", async () => {
  const graph = buildGraph(degradedDeps(), new MemorySaver());
  const decisions: unknown[] = [];
  const tokens: string[] = [];
  const result = await graph.invoke(
    {
      query: "Aurora Quispe Demo prometió un tren eléctrico al Callao.",
      sessionId: "sesion-test",
      consultaId: "consulta-test",
    },
    {
      configurable: {
        thread_id: "consulta-test",
        hooks: {
          onNode: () => undefined,
          onDecision: (payload: unknown) => decisions.push(payload),
          onToken: (text: string) => tokens.push(text),
        },
      },
    },
  );

  assert.equal(result.entities[0]?.id, "demo-aurora");
  assert.equal(result.verdicts.length, 1);
  assert.equal(result.verdicts[0]?.verdict, "no_verificable");
  assert.equal(result.verdicts[0]?.confidence, null);
  assert.equal(result.verdicts[0]?.degraded, true);
  assert.equal(result.degraded, true);
  assert.equal(decisions.length, 1);
  assert.ok(tokens[0]?.includes("no verificable"));
});
