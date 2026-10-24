import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { END, START, StateGraph } from "@langchain/langgraph";
import { explain, extractClaims, identify, retrieve, verify } from "./nodes";
import { type AgentDeps, TumiAnnotation } from "./state";

export function buildGraph(deps: AgentDeps, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(TumiAnnotation)
    .addNode("identificacion", (state, config) => identify(state, deps, config))
    .addNode("extraccion", (state, config) => extractClaims(state, deps, config))
    .addNode("recuperacion", (state, config) => retrieve(state, deps, config))
    .addNode("verificacion", (state, config) => verify(state, deps, config))
    .addNode("explicacion", (state, config) => explain(state, deps, config))
    .addEdge(START, "identificacion")
    .addEdge("identificacion", "extraccion")
    .addEdge("extraccion", "recuperacion")
    .addEdge("recuperacion", "verificacion")
    .addEdge("verificacion", "explicacion")
    .addEdge("explicacion", END)
    .compile({ checkpointer });
}
