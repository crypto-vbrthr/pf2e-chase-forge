import { SESSION_STATUSES } from "../core/constants.js";
import { ChaseRouteError } from "../core/errors.js";
import { createChaseSession } from "../data/factories.js";
import { buildGraphIndex } from "../data/graph.js";
import { cloneData, createId, nowIso, uniqueStrings } from "../data/utils.js";
import { validateChaseBlueprint, validateChaseSession, validateRouteGraph } from "../data/validators.js";
import { evaluateRouteConditions } from "./route-conditions.js";

function routeError(code, message, details = null) {
  return new ChaseRouteError(message, { code, details });
}

function getGraph(session) {
  return session?.blueprintSnapshot?.graph ?? null;
}

function getRuntimeGroup(session, runtimeGroupId) {
  return session?.groups?.find(group => group.id === runtimeGroupId) ?? null;
}

function isEndNode(graph, nodeId) {
  const node = graph?.nodes?.find(candidate => candidate.id === nodeId);
  return Boolean(node && (node.type === "end" || graph.endNodeIds?.includes(nodeId)));
}

function appendUniqueTail(values, value) {
  const copy = Array.isArray(values) ? [...values] : [];
  if (copy.at(-1) !== value) copy.push(value);
  return copy;
}

function routeEvent(type, session, data = {}) {
  return {
    id: createId("route-event"),
    type,
    round: Number.isInteger(session.round) ? session.round : 0,
    timestamp: nowIso(),
    ...cloneData(data)
  };
}

function assertBlueprint(blueprint) {
  const result = validateChaseBlueprint(blueprint);
  if (!result.valid) throw routeError("INVALID_BLUEPRINT", "The Chase Blueprint is invalid.", { errors: result.errors });
}

function assertSessionBase(session) {
  const result = validateChaseSession(session);
  if (!result.valid) throw routeError("INVALID_SESSION", "The Chase Session is invalid.", { errors: result.errors });
  if (!session.blueprintSnapshot) throw routeError("MISSING_BLUEPRINT_SNAPSHOT", "Route traversal requires a blueprint snapshot on the session.");
  const graphResult = validateRouteGraph(session.blueprintSnapshot.graph);
  if (!graphResult.valid) throw routeError("INVALID_ROUTE_GRAPH", "The session route graph is invalid.", { errors: graphResult.errors });
}

function edgeState(session, group, edge, target, { context = {}, includeUndiscovered = false } = {}) {
  const reasons = [];
  if (!edge) reasons.push({ code: "EDGE_MISSING" });
  if (!target) reasons.push({ code: "TARGET_MISSING" });
  if (group?.position?.nodeId !== edge?.from) {
    reasons.push({ code: "SOURCE_MISMATCH", expected: group?.position?.nodeId ?? null, actual: edge?.from ?? null });
  }
  if (session.lockedEdgeIds?.includes(edge?.id)) reasons.push({ code: "EDGE_LOCKED" });

  const discoverable = ["hidden", "discoverable"].includes(edge?.visibility);
  const unlocked = session.unlockedEdgeIds?.includes(edge?.id);
  if (discoverable && !unlocked && !includeUndiscovered) reasons.push({ code: "EDGE_UNDISCOVERED" });

  const conditions = evaluateRouteConditions(edge?.conditions, { session, group, edge, target, context });
  if (!conditions.passed) {
    reasons.push({
      code: "CONDITION_FAILED",
      failures: conditions.results.filter(result => !result.passed).map(result => ({
        condition: cloneData(result.condition),
        actual: cloneData(result.actual),
        code: result.code
      }))
    });
  }

  return { available: reasons.length === 0, reasons, conditionResults: conditions.results };
}

function normalizeStartPositions(blueprint, startPositions = {}) {
  const graph = blueprint.graph;
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const resolved = {};
  for (const group of blueprint.groups) {
    const requested = startPositions[group.id] ?? graph.startNodeId;
    if (!nodeIds.has(requested)) {
      throw routeError("INVALID_START_POSITION", `Unknown start node '${requested}' for group '${group.id}'.`, { groupId: group.id, nodeId: requested });
    }
    resolved[group.id] = requested;
  }
  return resolved;
}

export function initializeRouteSession(blueprint, {
  sessionId = createId("session"),
  status = "draft",
  startPositions = {},
  activeGroupId = null,
  metadata = {}
} = {}) {
  assertBlueprint(blueprint);
  if (!SESSION_STATUSES.includes(status)) throw routeError("INVALID_SESSION_STATUS", `Unsupported session status '${status}'.`);
  const starts = normalizeStartPositions(blueprint, startPositions);
  const graph = blueprint.graph;
  const runtimeGroups = blueprint.groups.map(group => {
    const nodeId = starts[group.id];
    return {
      id: `runtime-${group.id}`,
      groupId: group.id,
      participantIds: group.participants.map(participant => participant.id),
      parentRuntimeGroupId: null,
      position: { nodeId, progress: 0 },
      routeHistory: [nodeId],
      edgeHistory: [],
      completed: isEndNode(graph, nodeId),
      metadata: {}
    };
  });
  const requestedActive = activeGroupId ?? runtimeGroups.find(group => !group.completed)?.id ?? runtimeGroups[0]?.id ?? null;
  if (requestedActive && !runtimeGroups.some(group => group.id === requestedActive)) {
    throw routeError("UNKNOWN_ACTIVE_GROUP", `Unknown active runtime group '${requestedActive}'.`);
  }
  return createChaseSession({
    id: sessionId,
    blueprintId: blueprint.id,
    blueprintSnapshot: blueprint,
    status,
    round: 0,
    activeGroupId: requestedActive,
    groups: runtimeGroups,
    nodeState: {},
    unlockedEdgeIds: [],
    lockedEdgeIds: [],
    events: [],
    metadata
  });
}

export function inspectRouteIntegrity(session) {
  const errors = [];
  try {
    assertSessionBase(session);
  } catch (error) {
    return { valid: false, errors: [{ code: error.code ?? "INVALID_SESSION", message: error.message, details: error.details ?? null }] };
  }

  const graph = getGraph(session);
  const { nodeById } = buildGraphIndex(graph);
  const edgeById = new Map(graph.edges.map(edge => [edge.id, edge]));
  const blueprintGroups = new Map(session.blueprintSnapshot.groups.map(group => [group.id, group]));

  for (const group of session.groups) {
    const blueprintGroup = blueprintGroups.get(group.groupId);
    if (!blueprintGroup) errors.push({ code: "UNKNOWN_BLUEPRINT_GROUP", groupId: group.id, blueprintGroupId: group.groupId });
    if (!nodeById.has(group.position?.nodeId)) errors.push({ code: "UNKNOWN_POSITION_NODE", groupId: group.id, nodeId: group.position?.nodeId ?? null });

    for (const nodeId of group.routeHistory ?? []) {
      if (!nodeById.has(nodeId)) errors.push({ code: "UNKNOWN_HISTORY_NODE", groupId: group.id, nodeId });
    }
    for (const edgeId of group.edgeHistory ?? []) {
      if (!edgeById.has(edgeId)) errors.push({ code: "UNKNOWN_HISTORY_EDGE", groupId: group.id, edgeId });
    }

    const expectedEdges = Math.max(0, (group.routeHistory?.length ?? 0) - 1);
    if ((group.edgeHistory?.length ?? 0) !== expectedEdges) {
      errors.push({ code: "HISTORY_LENGTH_MISMATCH", groupId: group.id, nodes: group.routeHistory?.length ?? 0, edges: group.edgeHistory?.length ?? 0 });
    } else {
      for (let index = 0; index < expectedEdges; index += 1) {
        const edge = edgeById.get(group.edgeHistory[index]);
        if (!edge) continue;
        const from = group.routeHistory[index];
        const to = group.routeHistory[index + 1];
        if (edge.from !== from || edge.to !== to) {
          errors.push({ code: "HISTORY_EDGE_MISMATCH", groupId: group.id, edgeId: edge.id, expected: { from, to }, actual: { from: edge.from, to: edge.to } });
        }
      }
    }

    const blueprintParticipantIds = new Set(blueprintGroup?.participants?.map(participant => participant.id) ?? []);
    for (const participantId of group.participantIds ?? []) {
      if (!blueprintParticipantIds.has(participantId)) errors.push({ code: "UNKNOWN_RUNTIME_PARTICIPANT", groupId: group.id, participantId });
    }

    const onEnd = isEndNode(graph, group.position?.nodeId);
    if (group.completed && !onEnd) errors.push({ code: "COMPLETED_OFF_END", groupId: group.id, nodeId: group.position?.nodeId ?? null });
  }

  for (const edgeId of [...(session.unlockedEdgeIds ?? []), ...(session.lockedEdgeIds ?? [])]) {
    if (!edgeById.has(edgeId)) errors.push({ code: "UNKNOWN_ROUTE_STATE_EDGE", edgeId });
  }

  return { valid: errors.length === 0, errors };
}

export function assertRouteIntegrity(session) {
  const result = inspectRouteIntegrity(session);
  if (!result.valid) throw routeError("ROUTE_INTEGRITY", "The Chase Session route state is inconsistent.", { errors: result.errors });
  return true;
}

export function listRouteTransitions(session, runtimeGroupId, options = {}) {
  assertRouteIntegrity(session);
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) throw routeError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  const graph = getGraph(session);
  const { outgoing, nodeById } = buildGraphIndex(graph);
  const edges = outgoing.get(group.position.nodeId) ?? [];
  return edges.map(edge => {
    const target = nodeById.get(edge.to) ?? null;
    const state = edgeState(session, group, edge, target, options);
    return {
      edge: cloneData(edge),
      target: cloneData(target),
      available: state.available,
      reasons: cloneData(state.reasons),
      conditionResults: cloneData(state.conditionResults)
    };
  });
}

export function getAvailableRouteTransitions(session, runtimeGroupId, options = {}) {
  return listRouteTransitions(session, runtimeGroupId, options).filter(transition => transition.available);
}

export function moveRuntimeGroup(session, runtimeGroupId, edgeId, options = {}) {
  assertRouteIntegrity(session);
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) throw routeError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  if (group.completed) throw routeError("GROUP_ALREADY_COMPLETE", `Runtime group '${runtimeGroupId}' already reached an ending.`);

  const transitions = listRouteTransitions(session, runtimeGroupId, options);
  const transition = transitions.find(candidate => candidate.edge.id === edgeId);
  if (!transition) throw routeError("EDGE_NOT_FROM_CURRENT_NODE", `Edge '${edgeId}' is not outgoing from the current node.`, { groupId: runtimeGroupId, nodeId: group.position.nodeId });
  if (!transition.available) throw routeError("EDGE_UNAVAILABLE", `Edge '${edgeId}' is not currently traversable.`, { reasons: transition.reasons });

  const next = cloneData(session);
  const nextGroup = getRuntimeGroup(next, runtimeGroupId);
  const fromNodeId = nextGroup.position.nodeId;
  const toNodeId = transition.edge.to;
  nextGroup.position = { nodeId: toNodeId, progress: 0 };
  nextGroup.routeHistory = appendUniqueTail(nextGroup.routeHistory, toNodeId);
  nextGroup.edgeHistory = [...(nextGroup.edgeHistory ?? []), transition.edge.id];
  nextGroup.completed = isEndNode(getGraph(next), toNodeId);
  next.updatedAt = nowIso();
  next.events = [...(next.events ?? []), routeEvent("routeMove", next, {
    groupId: runtimeGroupId,
    edgeId: transition.edge.id,
    fromNodeId,
    toNodeId,
    completed: nextGroup.completed
  })];
  return createChaseSession(next);
}

export function advanceRuntimeGroup(session, runtimeGroupId, options = {}) {
  const available = getAvailableRouteTransitions(session, runtimeGroupId, options);
  if (available.length === 0) throw routeError("NO_AVAILABLE_ROUTE", `Runtime group '${runtimeGroupId}' has no available route from its current node.`);
  if (available.length > 1) throw routeError("ROUTE_CHOICE_REQUIRED", `Runtime group '${runtimeGroupId}' has multiple available routes.`, { edgeIds: available.map(item => item.edge.id) });
  return moveRuntimeGroup(session, runtimeGroupId, available[0].edge.id, options);
}

export function resolveDeterministicRoute(session, runtimeGroupId, { context = {}, includeUndiscovered = false, maxSteps = null } = {}) {
  let next = cloneData(session);
  const graph = getGraph(next);
  const limit = maxSteps ?? Math.max(1, graph?.nodes?.length ?? 1);
  const traversedEdgeIds = [];

  for (let step = 0; step < limit; step += 1) {
    assertRouteIntegrity(next);
    const group = getRuntimeGroup(next, runtimeGroupId);
    if (!group) throw routeError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    if (group.completed) break;
    const node = graph.nodes.find(candidate => candidate.id === group.position.nodeId);
    if (!node || node.type === "card" || node.type === "choice" || node.type === "end") break;
    const available = getAvailableRouteTransitions(next, runtimeGroupId, { context, includeUndiscovered });
    if (available.length !== 1) break;
    traversedEdgeIds.push(available[0].edge.id);
    next = moveRuntimeGroup(next, runtimeGroupId, available[0].edge.id, { context, includeUndiscovered });
  }

  return { session: next, traversedEdgeIds };
}

function mutateRouteState(session, edgeIds, mode) {
  assertRouteIntegrity(session);
  const graph = getGraph(session);
  const existing = new Set(graph.edges.map(edge => edge.id));
  const requested = uniqueStrings(edgeIds);
  const unknown = requested.filter(id => !existing.has(id));
  if (unknown.length) throw routeError("UNKNOWN_ROUTE_EDGE", "Route state mutation references unknown edge ids.", { edgeIds: unknown });

  const next = cloneData(session);
  const unlocked = new Set(next.unlockedEdgeIds ?? []);
  const locked = new Set(next.lockedEdgeIds ?? []);
  for (const id of requested) {
    if (mode === "unlock") {
      unlocked.add(id);
      locked.delete(id);
    } else {
      locked.add(id);
      unlocked.delete(id);
    }
  }
  next.unlockedEdgeIds = [...unlocked];
  next.lockedEdgeIds = [...locked];
  next.updatedAt = nowIso();
  next.events = [...(next.events ?? []), routeEvent(mode === "unlock" ? "routeUnlock" : "routeLock", next, { edgeIds: requested })];
  return createChaseSession(next);
}

export function unlockRouteEdges(session, edgeIds) {
  return mutateRouteState(session, edgeIds, "unlock");
}

export function lockRouteEdges(session, edgeIds) {
  return mutateRouteState(session, edgeIds, "lock");
}

export function getRouteCompletion(session) {
  assertRouteIntegrity(session);
  const graph = getGraph(session);
  const completedGroupIds = [];
  const activeGroupIds = [];
  const endingsByGroup = {};
  for (const group of session.groups) {
    const onEnd = isEndNode(graph, group.position.nodeId);
    if (group.completed || onEnd) {
      completedGroupIds.push(group.id);
      endingsByGroup[group.id] = group.position.nodeId;
    } else {
      activeGroupIds.push(group.id);
    }
  }
  return {
    allGroupsCompleted: session.groups.length > 0 && activeGroupIds.length === 0,
    completedGroupIds,
    activeGroupIds,
    endingsByGroup
  };
}

export function getRuntimeGroupsAtNode(session, nodeId) {
  assertRouteIntegrity(session);
  const graph = getGraph(session);
  if (!graph.nodes.some(node => node.id === nodeId)) throw routeError("UNKNOWN_ROUTE_NODE", `Unknown route node '${nodeId}'.`);
  return session.groups.filter(group => group.position.nodeId === nodeId).map(cloneData);
}

export function createRouteGraphEngine() {
  return Object.freeze({
    initializeSession: initializeRouteSession,
    inspectIntegrity: inspectRouteIntegrity,
    assertIntegrity: assertRouteIntegrity,
    listTransitions: listRouteTransitions,
    availableTransitions: getAvailableRouteTransitions,
    moveGroup: moveRuntimeGroup,
    advanceGroup: advanceRuntimeGroup,
    resolveDeterministic: resolveDeterministicRoute,
    unlockEdges: unlockRouteEdges,
    lockEdges: lockRouteEdges,
    completion: getRouteCompletion,
    groupsAtNode: getRuntimeGroupsAtNode
  });
}
