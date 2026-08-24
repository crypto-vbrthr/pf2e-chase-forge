import test from "node:test";
import assert from "node:assert/strict";
import { createChaseBlueprint, createChaseEdge, createChaseNode, createParticipantGroup } from "../scripts/data/factories.js";
import { ChaseRouteError } from "../scripts/core/errors.js";
import {
  advanceRuntimeGroup,
  getAvailableRouteTransitions,
  getRouteCompletion,
  getRuntimeGroupsAtNode,
  initializeRouteSession,
  inspectRouteIntegrity,
  listRouteTransitions,
  lockRouteEdges,
  moveRuntimeGroup,
  resolveDeterministicRoute,
  unlockRouteEdges
} from "../scripts/engine/route-graph-engine.js";
import { branchedGraph, sampleBlueprint, sampleGroup } from "./helpers.js";

function twoGroupBlueprint(graph = branchedGraph()) {
  return createChaseBlueprint({
    ...sampleBlueprint(graph),
    id: "two-group-blueprint",
    groups: [
      sampleGroup({ id: "quarry", name: "Quarry", role: "quarry" }),
      createParticipantGroup({ id: "pursuers", name: "Pursuers", role: "pursuer", participants: [] })
    ]
  });
}

test("route session initialization places every group at the graph start", () => {
  const session = initializeRouteSession(twoGroupBlueprint(), { sessionId: "route-session", status: "active" });
  assert.equal(session.id, "route-session");
  assert.equal(session.groups.length, 2);
  assert.deepEqual(session.groups.map(group => group.position.nodeId), ["start", "start"]);
  assert.deepEqual(session.groups[0].routeHistory, ["start"]);
  assert.deepEqual(session.groups[0].edgeHistory, []);
  assert.equal(inspectRouteIntegrity(session).valid, true);
});

test("deterministic routing advances start nodes but stops at a real choice", () => {
  const session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  const quarryId = "runtime-quarry";
  const resolved = resolveDeterministicRoute(session, quarryId);
  assert.deepEqual(resolved.traversedEdgeIds, ["e1"]);
  assert.equal(resolved.session.groups.find(group => group.id === quarryId).position.nodeId, "choice");
});

test("branch choice moves one runtime group without moving another", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;
  session = resolveDeterministicRoute(session, "runtime-pursuers").session;

  session = moveRuntimeGroup(session, "runtime-quarry", "e2");
  session = moveRuntimeGroup(session, "runtime-pursuers", "e3");

  assert.equal(session.groups.find(group => group.id === "runtime-quarry").position.nodeId, "roof");
  assert.equal(session.groups.find(group => group.id === "runtime-pursuers").position.nodeId, "alley");
});

test("different branches can merge at the same node", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;
  session = resolveDeterministicRoute(session, "runtime-pursuers").session;
  session = moveRuntimeGroup(session, "runtime-quarry", "e2");
  session = moveRuntimeGroup(session, "runtime-pursuers", "e3");
  session = moveRuntimeGroup(session, "runtime-quarry", "e4");
  session = moveRuntimeGroup(session, "runtime-pursuers", "e5");

  assert.deepEqual(getRuntimeGroupsAtNode(session, "merge").map(group => group.id).sort(), ["runtime-pursuers", "runtime-quarry"]);
});

test("discoverable shortcuts are unavailable until explicitly unlocked", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active", startPositions: { quarry: "merge", pursuers: "merge" } });
  const before = listRouteTransitions(session, "runtime-quarry");
  const shortcut = before.find(item => item.edge.id === "e7");
  assert.equal(shortcut.available, false);
  assert.ok(shortcut.reasons.some(reason => reason.code === "EDGE_UNDISCOVERED"));

  session = unlockRouteEdges(session, ["e7"]);
  assert.equal(getAvailableRouteTransitions(session, "runtime-quarry").some(item => item.edge.id === "e7"), true);
});

test("route locking overrides prior unlocking", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active", startPositions: { quarry: "merge", pursuers: "merge" } });
  session = unlockRouteEdges(session, ["e7"]);
  session = lockRouteEdges(session, ["e7"]);
  const shortcut = listRouteTransitions(session, "runtime-quarry").find(item => item.edge.id === "e7");
  assert.equal(shortcut.available, false);
  assert.ok(shortcut.reasons.some(reason => reason.code === "EDGE_LOCKED"));
});

test("conditional edges evaluate against explicit context", () => {
  const graph = branchedGraph();
  graph.edges.find(edge => edge.id === "e2").conditions = [
    { source: "context", path: "weather.clear", operator: "equals", value: true }
  ];
  let session = initializeRouteSession(twoGroupBlueprint(graph), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;

  const blocked = listRouteTransitions(session, "runtime-quarry", { context: { weather: { clear: false } } }).find(item => item.edge.id === "e2");
  assert.equal(blocked.available, false);
  assert.ok(blocked.reasons.some(reason => reason.code === "CONDITION_FAILED"));

  const open = listRouteTransitions(session, "runtime-quarry", { context: { weather: { clear: true } } }).find(item => item.edge.id === "e2");
  assert.equal(open.available, true);
});

test("advanceGroup requires an explicit branch selection when multiple routes are available", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;
  assert.throws(() => advanceRuntimeGroup(session, "runtime-quarry"), error => error instanceof ChaseRouteError && error.code === "ROUTE_CHOICE_REQUIRED");
});

test("moving through a route records node and edge histories", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;
  session = moveRuntimeGroup(session, "runtime-quarry", "e2");
  session = moveRuntimeGroup(session, "runtime-quarry", "e4");
  const group = session.groups.find(item => item.id === "runtime-quarry");
  assert.deepEqual(group.routeHistory, ["start", "choice", "roof", "merge"]);
  assert.deepEqual(group.edgeHistory, ["e1", "e2", "e4"]);
  assert.equal(inspectRouteIntegrity(session).valid, true);
});

test("reaching an end marks only that runtime group complete", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active", startPositions: { quarry: "merge", pursuers: "merge" } });
  session = moveRuntimeGroup(session, "runtime-quarry", "e6");
  const completion = getRouteCompletion(session);
  assert.equal(completion.allGroupsCompleted, false);
  assert.deepEqual(completion.completedGroupIds, ["runtime-quarry"]);
  assert.equal(completion.endingsByGroup["runtime-quarry"], "end-a");
});

test("completion detects when all runtime groups reached endings", () => {
  let session = initializeRouteSession(twoGroupBlueprint(), { status: "active", startPositions: { quarry: "merge", pursuers: "merge" } });
  session = moveRuntimeGroup(session, "runtime-quarry", "e6");
  session = moveRuntimeGroup(session, "runtime-pursuers", "e6");
  assert.equal(getRouteCompletion(session).allGroupsCompleted, true);
});

test("invalid runtime node state is rejected before traversal", () => {
  const session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  session.groups[0].position.nodeId = "missing-node";
  const integrity = inspectRouteIntegrity(session);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.errors.some(error => error.code === "UNKNOWN_POSITION_NODE"));
  assert.throws(() => getAvailableRouteTransitions(session, "runtime-quarry"), error => error instanceof ChaseRouteError && error.code === "ROUTE_INTEGRITY");
});

test("moving along an edge that does not leave the current node fails safely", () => {
  const session = initializeRouteSession(twoGroupBlueprint(), { status: "active" });
  assert.throws(() => moveRuntimeGroup(session, "runtime-quarry", "e4"), error => error instanceof ChaseRouteError && error.code === "EDGE_NOT_FROM_CURRENT_NODE");
});

test("runtime groups can intentionally start on different valid route nodes", () => {
  const session = initializeRouteSession(twoGroupBlueprint(), {
    status: "active",
    startPositions: { quarry: "roof", pursuers: "alley" }
  });
  assert.equal(session.groups.find(group => group.id === "runtime-quarry").position.nodeId, "roof");
  assert.equal(session.groups.find(group => group.id === "runtime-pursuers").position.nodeId, "alley");
});

test("invalid start position is rejected", () => {
  assert.throws(() => initializeRouteSession(twoGroupBlueprint(), { startPositions: { quarry: "nowhere" } }), error => error instanceof ChaseRouteError && error.code === "INVALID_START_POSITION");
});

test("a deliberately longer branch traverses independently from a shorter branch", () => {
  const graph = {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "choice", type: "choice" }),
      createChaseNode({ id: "short", type: "card", cardRef: "core:short" }),
      createChaseNode({ id: "long-a", type: "card", cardRef: "core:long-a" }),
      createChaseNode({ id: "long-b", type: "card", cardRef: "core:long-b" }),
      createChaseNode({ id: "merge", type: "merge" }),
      createChaseNode({ id: "end", type: "end" })
    ],
    edges: [
      createChaseEdge({ id: "s1", from: "start", to: "choice" }),
      createChaseEdge({ id: "s2", from: "choice", to: "short", type: "branch" }),
      createChaseEdge({ id: "l1", from: "choice", to: "long-a", type: "branch" }),
      createChaseEdge({ id: "s3", from: "short", to: "merge" }),
      createChaseEdge({ id: "l2", from: "long-a", to: "long-b" }),
      createChaseEdge({ id: "l3", from: "long-b", to: "merge" }),
      createChaseEdge({ id: "m1", from: "merge", to: "end" })
    ],
    startNodeId: "start",
    endNodeIds: ["end"]
  };
  let session = initializeRouteSession(twoGroupBlueprint(graph), { status: "active" });
  session = resolveDeterministicRoute(session, "runtime-quarry").session;
  session = resolveDeterministicRoute(session, "runtime-pursuers").session;
  session = moveRuntimeGroup(session, "runtime-quarry", "s2");
  session = moveRuntimeGroup(session, "runtime-pursuers", "l1");
  session = moveRuntimeGroup(session, "runtime-quarry", "s3");
  session = moveRuntimeGroup(session, "runtime-pursuers", "l2");
  assert.equal(session.groups.find(group => group.id === "runtime-quarry").position.nodeId, "merge");
  assert.equal(session.groups.find(group => group.id === "runtime-pursuers").position.nodeId, "long-b");
});
