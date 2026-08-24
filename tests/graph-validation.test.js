import test from "node:test";
import assert from "node:assert/strict";
import { createChaseEdge, createChaseNode } from "../scripts/data/factories.js";
import { buildGraphIndex, findCycle, getReachableNodeIds, topologicalSort } from "../scripts/data/graph.js";
import { validateRouteGraph } from "../scripts/data/validators.js";
import { branchedGraph, linearGraph } from "./helpers.js";

test("linear route graph validates", () => {
  const result = validateRouteGraph(linearGraph());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("branched route with merge and multiple endings validates", () => {
  const result = validateRouteGraph(branchedGraph());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("graph index reports branch and merge arity", () => {
  const graph = branchedGraph();
  const index = buildGraphIndex(graph);
  assert.equal(index.outgoing.get("choice").length, 2);
  assert.equal(index.incoming.get("merge").length, 2);
});

test("reachable analysis covers every valid branch", () => {
  const graph = branchedGraph();
  const reachable = getReachableNodeIds(graph);
  assert.equal(reachable.size, graph.nodes.length);
  assert.equal(reachable.has("roof"), true);
  assert.equal(reachable.has("alley"), true);
  assert.equal(reachable.has("end-b"), true);
});

test("topological sort returns every node for a DAG", () => {
  const graph = branchedGraph();
  const ordered = topologicalSort(graph);
  assert.equal(ordered.length, graph.nodes.length);
  assert.ok(ordered.indexOf("start") < ordered.indexOf("choice"));
  assert.ok(ordered.indexOf("choice") < ordered.indexOf("roof"));
  assert.ok(ordered.indexOf("merge") < ordered.indexOf("end-a"));
});

test("cycle detection rejects cyclic routes", () => {
  const graph = linearGraph();
  graph.edges.push(createChaseEdge({ id: "loop", from: "obstacle-1", to: "start" }));
  const cycle = findCycle(graph);
  assert.ok(cycle);
  const result = validateRouteGraph(graph);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === "GRAPH_CYCLE"));
});

test("self edges are rejected", () => {
  const graph = linearGraph();
  graph.edges.push(createChaseEdge({ id: "self", from: "obstacle-1", to: "obstacle-1" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "SELF_EDGE"));
});

test("unknown edge source is rejected", () => {
  const graph = linearGraph();
  graph.edges.push(createChaseEdge({ id: "bad", from: "missing", to: "end" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "EDGE_FROM"));
});

test("unknown edge target is rejected", () => {
  const graph = linearGraph();
  graph.edges.push(createChaseEdge({ id: "bad", from: "obstacle-1", to: "missing" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "EDGE_TO"));
});

test("unreachable nodes are rejected", () => {
  const graph = linearGraph();
  graph.nodes.push(createChaseNode({ id: "island", type: "card", cardRef: "core:island" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "UNREACHABLE_NODE" && error.message.includes("island")));
});

test("graph requires exactly one typed start node", () => {
  const graph = linearGraph();
  graph.nodes.push(createChaseNode({ id: "start-2", type: "start" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "START_COUNT"));
});

test("graph requires at least one declared ending", () => {
  const graph = linearGraph();
  graph.endNodeIds = [];
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "END_NODES"));
});

test("declared endings must be end nodes", () => {
  const graph = linearGraph();
  graph.endNodeIds = ["obstacle-1"];
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "END_TYPE"));
});

test("start node may not have incoming edges", () => {
  const graph = branchedGraph();
  graph.edges.push(createChaseEdge({ id: "back", from: "roof", to: "start" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "START_INCOMING"));
});

test("end nodes may not have outgoing edges", () => {
  const graph = branchedGraph();
  graph.edges.push(createChaseEdge({ id: "post-end", from: "end-a", to: "end-b" }));
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "END_OUTGOING"));
});

test("choice arity is an authoring warning instead of a hard error", () => {
  const graph = linearGraph();
  graph.nodes[1].type = "choice";
  const result = validateRouteGraph(graph);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(warning => warning.code === "CHOICE_ARITY"));
});

test("merge arity is an authoring warning instead of a hard error", () => {
  const graph = linearGraph();
  graph.nodes[1].type = "merge";
  const result = validateRouteGraph(graph);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(warning => warning.code === "MERGE_ARITY"));
});

test("card nodes without a card reference remain structurally inspectable", () => {
  const graph = linearGraph();
  graph.nodes[1].cardRef = null;
  const result = validateRouteGraph(graph);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(warning => warning.code === "CARD_REF"));
});

test("non-end dead ends are rejected", () => {
  const graph = linearGraph();
  graph.edges = graph.edges.filter(edge => edge.id !== "e2");
  const result = validateRouteGraph(graph);
  assert.ok(result.errors.some(error => error.code === "DEAD_END"));
  assert.ok(result.errors.some(error => error.code === "NO_PATH_TO_END"));
});

test("route conditions require a supported source, operator, and path", () => {
  const graph = linearGraph();
  graph.edges[0].conditions = [{ source: "context", path: "weather.clear", operator: "equals", value: true }];
  assert.equal(validateRouteGraph(graph).valid, true);
  graph.edges[0].conditions = [{ source: "mystery", path: "x", operator: "equals", value: true }];
  assert.ok(validateRouteGraph(graph).errors.some(error => error.code === "ENUM"));
});
