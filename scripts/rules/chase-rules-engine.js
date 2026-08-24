import {
  CHASE_LENGTH_GUIDELINES,
  CHASE_TYPES,
  DEFAULT_CHASE_POINT_DELTAS,
  DEFAULTS,
  DEGREE_KEYS,
  GROUP_PACE_MODES
} from "../core/constants.js";
import { ChaseRulesError } from "../core/errors.js";
import { createChaseResult, createChaseSession } from "../data/factories.js";
import { buildGraphIndex, topologicalSort } from "../data/graph.js";
import { cloneData, createId, nowIso, uniqueStrings } from "../data/utils.js";
import { validateChaseSession } from "../data/validators.js";
import { createRouteGraphEngine } from "../engine/route-graph-engine.js";
import { degreeOfSuccess } from "./degree-of-success.js";
import { resolveApproachDc } from "./pf2e-dc.js";

function rulesError(code, message, details = null) {
  return new ChaseRulesError(message, { code, details });
}

function assertSession(session) {
  const result = validateChaseSession(session);
  if (!result.valid) throw rulesError("INVALID_SESSION", "The Chase Session is invalid for rules resolution.", { errors: result.errors });
  if (!session.blueprintSnapshot) throw rulesError("MISSING_BLUEPRINT_SNAPSHOT", "Chase rules resolution requires a blueprint snapshot.");
}

function event(type, session, data = {}) {
  return {
    id: createId("rules-event"),
    type,
    round: Number.isInteger(session.round) ? session.round : 0,
    timestamp: nowIso(),
    ...cloneData(data)
  };
}

function getRuntimeGroup(session, runtimeGroupId) {
  return session.groups.find(group => group.id === runtimeGroupId) ?? null;
}

function getBlueprintGroup(session, runtimeGroup) {
  return session.blueprintSnapshot.groups.find(group => group.id === runtimeGroup?.groupId) ?? null;
}

function getNode(session, nodeId) {
  return session.blueprintSnapshot.graph.nodes.find(node => node.id === nodeId) ?? null;
}

function currentNode(session, group) {
  return getNode(session, group.position.nodeId);
}

function isEndNode(session, nodeId) {
  const node = getNode(session, nodeId);
  return Boolean(node && (node.type === "end" || session.blueprintSnapshot.graph.endNodeIds.includes(nodeId)));
}

function groupRole(session, runtimeGroup) {
  return getBlueprintGroup(session, runtimeGroup)?.role ?? "participant";
}

function markRoundParticipant(next, participantId, { skipped = false } = {}) {
  next.roundState.actedParticipantIds = uniqueStrings([...(next.roundState.actedParticipantIds ?? []), participantId]);
  if (skipped) next.roundState.skippedParticipantIds = uniqueStrings([...(next.roundState.skippedParticipantIds ?? []), participantId]);
}

function assertActiveRound(session) {
  if (session.roundState?.phase !== "active") throw rulesError("ROUND_NOT_ACTIVE", "A chase contribution requires an active round.", { phase: session.roundState?.phase ?? null });
}

function assertParticipantTurn(session, group, participantId) {
  if (!participantId || !group.participantIds.includes(participantId)) {
    throw rulesError("PARTICIPANT_NOT_IN_GROUP", `Participant '${participantId ?? ""}' is not part of runtime group '${group.id}'.`, { runtimeGroupId: group.id, participantId });
  }
  if (session.roundState.actedParticipantIds.includes(participantId)) {
    throw rulesError("PARTICIPANT_ALREADY_ACTED", `Participant '${participantId}' already acted this round.`, { participantId, round: session.round });
  }
}

function nodeGroupRuleState(session, nodeId, runtimeGroupId) {
  return session.nodeState?.[nodeId]?.groups?.[runtimeGroupId] ?? null;
}

function isNodeCleared(session, nodeId, runtimeGroupId) {
  return nodeGroupRuleState(session, nodeId, runtimeGroupId)?.cleared === true;
}

function markNodeCleared(session, nodeId, runtimeGroupId, requiredPoints) {
  const next = cloneData(session);
  next.nodeState ??= {};
  next.nodeState[nodeId] ??= {};
  next.nodeState[nodeId].groups ??= {};
  next.nodeState[nodeId].groups[runtimeGroupId] = {
    ...(next.nodeState[nodeId].groups[runtimeGroupId] ?? {}),
    cleared: true,
    requiredPoints,
    clearedAtRound: next.round,
    clearedAt: nowIso()
  };
  return createChaseSession(next);
}

function resolveCard(cardResolver, session, runtimeGroupId) {
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  const node = currentNode(session, group);
  if (!node || node.type !== "card") throw rulesError("NO_ACTIVE_OBSTACLE", `Runtime group '${runtimeGroupId}' is not currently on a chase card.`, { nodeId: group.position.nodeId, nodeType: node?.type ?? null });
  if (!node.cardRef) throw rulesError("CARD_REFERENCE_MISSING", `Route node '${node.id}' has no Chase Card reference.`, { nodeId: node.id });
  const card = cardResolver(node.cardRef);
  if (!card) throw rulesError("CARD_NOT_FOUND", `Chase Card '${node.cardRef}' is not registered.`, { cardRef: node.cardRef, nodeId: node.id });
  return { group, node, card };
}

function findApproach(card, approachId) {
  if (!approachId) return null;
  const approach = card.approaches.find(candidate => candidate.id === approachId) ?? null;
  if (!approach) throw rulesError("APPROACH_NOT_FOUND", `Chase approach '${approachId}' is not defined on card '${card.id}'.`, { cardId: card.id, approachId });
  return approach;
}

function consequencesFor(card, approach, degree) {
  return [
    ...(approach?.outcomes?.[degree] ?? []),
    ...(card?.outcomes?.[degree] ?? [])
  ].map(cloneData);
}

function pointDeltaForConsequences(consequences, degree) {
  const pointConsequences = consequences.filter(consequence => consequence.kind === "chasePoints");
  if (pointConsequences.length === 0) return DEFAULT_CHASE_POINT_DELTAS[degree] ?? 0;
  return pointConsequences.reduce((total, consequence) => total + Number(consequence.payload?.value ?? 0), 0);
}

function deferredConsequences(consequences) {
  return consequences.filter(consequence => consequence.kind !== "chasePoints").map(cloneData);
}

function updateGroupProgress(session, runtimeGroupId, delta) {
  const next = cloneData(session);
  const group = getRuntimeGroup(next, runtimeGroupId);
  const before = group.position.progress;
  group.position.progress = Math.max(0, Math.trunc(before + Number(delta ?? 0)));
  next.updatedAt = nowIso();
  return { session: createChaseSession(next), before, after: group.position.progress };
}

function defaultPaceMode(blueprintGroup, explicit) {
  if (GROUP_PACE_MODES.includes(explicit)) return explicit;
  const metadataMode = blueprintGroup?.metadata?.paceMode ?? blueprintGroup?.metadata?.chasePaceMode;
  if (GROUP_PACE_MODES.includes(metadataMode)) return metadataMode;
  if (blueprintGroup?.metadata?.npc === true || blueprintGroup?.metadata?.controlledBy === "gm") return "steady";
  return DEFAULTS.groupPaceMode;
}

function afterMoveRouteChoiceRequired(session, runtimeGroupId, routeEngine, context = {}) {
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group || group.completed) return false;
  const node = currentNode(session, group);
  if (!node) return false;
  if (node.type === "choice") return routeEngine.availableTransitions(session, runtimeGroupId, { context }).length > 1;
  if (node.type === "card" && isNodeCleared(session, node.id, runtimeGroupId)) return routeEngine.availableTransitions(session, runtimeGroupId, { context }).length > 1;
  return false;
}

function advanceFromClearedCard(session, runtimeGroupId, routeEngine, { context = {}, edgeId = null } = {}) {
  let next = session;
  const group = getRuntimeGroup(next, runtimeGroupId);
  const node = currentNode(next, group);
  if (!node || node.type !== "card") throw rulesError("NO_CLEARED_CARD", "Route advancement after an obstacle requires a card node.", { runtimeGroupId, nodeId: node?.id ?? null });
  if (!isNodeCleared(next, node.id, runtimeGroupId)) throw rulesError("OBSTACLE_NOT_CLEARED", `Card '${node.id}' has not been cleared by '${runtimeGroupId}'.`);

  const available = routeEngine.availableTransitions(next, runtimeGroupId, { context });
  if (available.length === 0) throw rulesError("NO_AVAILABLE_ROUTE", `Cleared obstacle '${node.id}' has no available outgoing route.`, { runtimeGroupId, nodeId: node.id });
  if (available.length > 1 && !edgeId) {
    return { session: next, routeChoiceRequired: true, traversedEdgeIds: [] };
  }

  const selected = edgeId ? available.find(item => item.edge.id === edgeId) : available[0];
  if (!selected) throw rulesError("ROUTE_CHOICE_INVALID", `Selected edge '${edgeId}' is not available after obstacle '${node.id}'.`, { edgeId, availableEdgeIds: available.map(item => item.edge.id) });

  const traversed = [selected.edge.id];
  next = routeEngine.moveGroup(next, runtimeGroupId, selected.edge.id, { context });
  const deterministic = routeEngine.resolveDeterministic(next, runtimeGroupId, { context });
  next = deterministic.session;
  traversed.push(...deterministic.traversedEdgeIds);
  return {
    session: next,
    routeChoiceRequired: afterMoveRouteChoiceRequired(next, runtimeGroupId, routeEngine, context),
    traversedEdgeIds: traversed
  };
}

function moveThroughChoice(session, runtimeGroupId, edgeId, routeEngine, { context = {} } = {}) {
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  const node = currentNode(session, group);
  if (!node) throw rulesError("UNKNOWN_ROUTE_NODE", `Unknown route node '${group.position.nodeId}'.`);

  if (node.type === "card") {
    if (!isNodeCleared(session, node.id, runtimeGroupId)) throw rulesError("OBSTACLE_NOT_CLEARED", "A route cannot be chosen from an uncleared chase card.", { nodeId: node.id, runtimeGroupId });
    return advanceFromClearedCard(session, runtimeGroupId, routeEngine, { context, edgeId });
  }
  if (node.type !== "choice") throw rulesError("ROUTE_CHOICE_NOT_AVAILABLE", `Runtime group '${runtimeGroupId}' is not at a route choice.`, { nodeId: node.id, nodeType: node.type });

  let next = routeEngine.moveGroup(session, runtimeGroupId, edgeId, { context });
  const deterministic = routeEngine.resolveDeterministic(next, runtimeGroupId, { context });
  next = deterministic.session;
  return {
    session: next,
    routeChoiceRequired: afterMoveRouteChoiceRequired(next, runtimeGroupId, routeEngine, context),
    traversedEdgeIds: [edgeId, ...deterministic.traversedEdgeIds]
  };
}

function setPendingSeparatedBonus(session, runtimeGroupId) {
  const next = cloneData(session);
  const group = getRuntimeGroup(next, runtimeGroupId);
  group.rules.pendingCheckBonus = {
    value: 2,
    type: "circumstance",
    source: "separatedCriticalSuccess",
    grantedAtRound: next.round
  };
  next.events = [...(next.events ?? []), event("separatedCriticalBonus", next, { runtimeGroupId, value: 2 })];
  next.updatedAt = nowIso();
  return createChaseSession(next);
}

function resolveCardDistanceFromStart(session) {
  const graph = session.blueprintSnapshot.graph;
  const order = topologicalSort(graph);
  const { outgoing, nodeById } = buildGraphIndex(graph);
  const distance = new Map(graph.nodes.map(node => [node.id, Number.POSITIVE_INFINITY]));
  distance.set(graph.startNodeId, 0);
  for (const nodeId of order) {
    const base = distance.get(nodeId);
    if (!Number.isFinite(base)) continue;
    for (const edge of outgoing.get(nodeId) ?? []) {
      const target = nodeById.get(edge.to);
      const increment = target?.type === "card" ? 1 : 0;
      distance.set(edge.to, Math.min(distance.get(edge.to), base + increment));
    }
  }
  return distance;
}

function obstacleIndex(session, runtimeGroupId) {
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  const graph = session.blueprintSnapshot.graph;
  const distance = resolveCardDistanceFromStart(session);
  const history = group.routeHistory ?? [];
  if (history.length === 0) return Number.isFinite(distance.get(group.position.nodeId)) ? distance.get(group.position.nodeId) : 0;
  const first = history[0];
  let index = Number.isFinite(distance.get(first)) ? distance.get(first) : 0;
  for (const nodeId of history.slice(1)) {
    if (graph.nodes.find(node => node.id === nodeId)?.type === "card") index += 1;
  }
  return index;
}

function roleGroups(session, role) {
  return session.groups.filter(group => groupRole(session, group) === role);
}

function groupsSharingNode(firstGroups, secondGroups) {
  const matches = [];
  for (const first of firstGroups) {
    for (const second of secondGroups) {
      if (first.id !== second.id && first.position.nodeId === second.position.nodeId) matches.push([first, second]);
    }
  }
  return matches;
}

function completedGroups(session, groups = session.groups) {
  return groups.filter(group => group.completed || isEndNode(session, group.position.nodeId));
}

function makeEvaluation(outcome, { winners = [], losers = [], endingNodeId = null, reason = null, details = {} } = {}) {
  return Object.freeze({
    ended: true,
    outcome,
    winnerGroupIds: winners.map(group => typeof group === "string" ? group : group.id),
    loserGroupIds: losers.map(group => typeof group === "string" ? group : group.id),
    endingNodeId,
    reason,
    details: cloneData(details)
  });
}

export function recommendObstaclePoints(groupSize) {
  const size = Math.max(1, Math.trunc(Number(groupSize) || 1));
  return Object.freeze({
    groupSize: size,
    oneLess: Math.max(1, size - 1),
    twoLess: Math.max(1, size - 2)
  });
}

export function getChaseLengthGuideline(length) {
  if (!Object.hasOwn(CHASE_LENGTH_GUIDELINES, length)) throw rulesError("UNKNOWN_CHASE_LENGTH", `No fixed obstacle guideline exists for chase length '${length}'.`, { length });
  return CHASE_LENGTH_GUIDELINES[length];
}

function initialCardSpine(graph) {
  const { outgoing, nodeById } = buildGraphIndex(graph);
  const cards = [];
  let nodeId = graph.startNodeId;
  const visited = new Set();
  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (node?.type === "card") cards.push(node.id);
    if (node?.type === "end" || node?.type === "choice") break;
    const edges = outgoing.get(nodeId) ?? [];
    if (edges.length !== 1) break;
    nodeId = edges[0].to;
  }
  return cards;
}

export function deriveChaseStartPositions(blueprint, { startDistance = null } = {}) {
  const graph = blueprint?.graph;
  if (!graph?.startNodeId || !Array.isArray(blueprint?.groups)) throw rulesError("INVALID_BLUEPRINT", "Start-position derivation requires a Chase Blueprint graph and groups.");
  const cards = initialCardSpine(graph);
  if (cards.length === 0) return Object.fromEntries(blueprint.groups.map(group => [group.id, graph.startNodeId]));

  const type = blueprint.settings?.chaseType ?? DEFAULTS.chaseType;
  const distance = Math.max(0, Math.trunc(Number(startDistance ?? blueprint.settings?.startDistance ?? 0) || 0));
  const baseNode = cards[0];
  const positions = Object.fromEntries(blueprint.groups.map(group => [group.id, baseNode]));

  if (["pursuit", "escape"].includes(type) && distance > 0) {
    const quarryNode = cards[distance];
    if (!quarryNode) {
      return Object.freeze({ ...positions });
    }
    for (const group of blueprint.groups) {
      if (group.role === "quarry") positions[group.id] = quarryNode;
    }
  }
  return Object.freeze(positions);
}

export function getTurnPolicy(session) {
  assertSession(session);
  const type = session.blueprintSnapshot.settings.chaseType;
  const quarry = roleGroups(session, "quarry").map(group => group.id);
  const others = session.groups.filter(group => !quarry.includes(group.id)).map(group => group.id);
  if (type === "race") {
    return Object.freeze({ mode: "initiative", quarryFirst: false, initiativeRequired: true, suggestedOrder: [...session.roundState.initiativeOrder] });
  }
  if (["pursuit", "escape"].includes(type)) {
    return Object.freeze({ mode: "quarryFirst", quarryFirst: true, initiativeRequired: false, suggestedOrder: [...quarry, ...others] });
  }
  return Object.freeze({ mode: "free", quarryFirst: false, initiativeRequired: false, suggestedOrder: session.groups.map(group => group.id) });
}

export function createChaseRulesEngine({ registries = null, cardResolver = null, routeEngine = createRouteGraphEngine() } = {}) {
  const resolveCardRef = cardResolver ?? (id => registries?.getCard?.(id, { includeDisabled: true }) ?? null);

  function initializeSession(blueprint, {
    status = "active",
    autoResolveStart = true,
    paceModes = {},
    obstaclesPerRound = {},
    roundLimit = null,
    escapeLead = null,
    startPositions = null,
    ...routeOptions
  } = {}) {
    const resolvedStartPositions = startPositions && Object.keys(startPositions).length > 0
      ? startPositions
      : deriveChaseStartPositions(blueprint);
    let session = routeEngine.initializeSession(blueprint, { status, startPositions: resolvedStartPositions, ...routeOptions });
    const next = cloneData(session);
    next.rules = {
      roundLimit: roundLimit ?? blueprint.settings?.victory?.roundLimit ?? null,
      escapeLead: escapeLead ?? blueprint.settings?.victory?.escapeLead ?? DEFAULTS.escapeLead
    };
    for (const runtimeGroup of next.groups) {
      const blueprintGroup = getBlueprintGroup(next, runtimeGroup);
      const explicitMode = paceModes[runtimeGroup.id] ?? paceModes[runtimeGroup.groupId];
      runtimeGroup.rules.paceMode = defaultPaceMode(blueprintGroup, explicitMode);
      const explicitRate = obstaclesPerRound[runtimeGroup.id] ?? obstaclesPerRound[runtimeGroup.groupId] ?? blueprintGroup?.metadata?.obstaclesPerRound;
      if (Number.isFinite(Number(explicitRate))) runtimeGroup.rules.obstaclesPerRound = Math.max(0, Number(explicitRate));
    }
    if (status === "active") next.startedAt ??= nowIso();
    session = createChaseSession(next);

    if (autoResolveStart) {
      for (const group of session.groups) {
        if (group.completed) continue;
        session = routeEngine.resolveDeterministic(session, group.id).session;
      }
    }
    return session;
  }

  function configureGroupPace(session, runtimeGroupId, { mode = null, obstaclesPerRound: rate = null } = {}) {
    assertSession(session);
    const next = cloneData(session);
    const group = getRuntimeGroup(next, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    if (mode !== null && !GROUP_PACE_MODES.includes(mode)) throw rulesError("INVALID_PACE_MODE", `Unsupported pace mode '${mode}'.`, { mode });
    if (rate !== null && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) throw rulesError("INVALID_PACE_RATE", "Steady pace must be a non-negative finite number.", { obstaclesPerRound: rate });
    if (mode !== null) group.rules.paceMode = mode;
    if (rate !== null) group.rules.obstaclesPerRound = Number(rate);
    next.updatedAt = nowIso();
    next.events = [...(next.events ?? []), event("groupPaceConfigured", next, { runtimeGroupId, paceMode: group.rules.paceMode, obstaclesPerRound: group.rules.obstaclesPerRound })];
    return createChaseSession(next);
  }

  function beginRound(session, { initiativeOrder = null } = {}) {
    assertSession(session);
    if (session.roundState.phase === "active") throw rulesError("ROUND_ALREADY_ACTIVE", `Round ${session.round} is already active.`);
    const next = cloneData(session);
    next.round += 1;
    next.status = next.status === "draft" ? "active" : next.status;
    next.startedAt ??= nowIso();
    next.roundState = {
      phase: "active",
      actedParticipantIds: [],
      skippedParticipantIds: [],
      initiativeOrder: initiativeOrder ? uniqueStrings(initiativeOrder) : [],
      startedAt: nowIso(),
      endedAt: null
    };
    if (!initiativeOrder) next.roundState.initiativeOrder = getTurnPolicy(createChaseSession(next)).suggestedOrder;
    next.events = [...(next.events ?? []), event("roundStarted", next, { round: next.round, initiativeOrder: next.roundState.initiativeOrder })];
    next.updatedAt = nowIso();
    return createChaseSession(next);
  }

  function currentObstacle(session, runtimeGroupId) {
    assertSession(session);
    const { group, node, card } = resolveCard(resolveCardRef, session, runtimeGroupId);
    return Object.freeze({
      runtimeGroupId,
      node: cloneData(node),
      card: cloneData(card),
      progress: group.position.progress,
      requiredPoints: card.obstacle.requiredPoints,
      cleared: isNodeCleared(session, node.id, runtimeGroupId),
      separated: group.participantIds.length === 1
    });
  }

  function pendingCheckBonus(session, runtimeGroupId) {
    assertSession(session);
    const group = getRuntimeGroup(session, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    return cloneData(group.rules.pendingCheckBonus);
  }

  function consumePendingCheckBonus(session, runtimeGroupId) {
    assertSession(session);
    const next = cloneData(session);
    const group = getRuntimeGroup(next, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    const bonus = cloneData(group.rules.pendingCheckBonus);
    group.rules.pendingCheckBonus = null;
    if (bonus) {
      next.events = [...(next.events ?? []), event("pendingCheckBonusConsumed", next, { runtimeGroupId, bonus })];
      next.updatedAt = nowIso();
    }
    return { session: createChaseSession(next), bonus };
  }

  function applyDegree(session, {
    runtimeGroupId,
    participantId,
    degree,
    approachId = null,
    context = {}
  } = {}) {
    assertSession(session);
    assertActiveRound(session);
    if (!DEGREE_KEYS.includes(degree)) throw rulesError("INVALID_DEGREE", `Unsupported chase degree '${degree}'.`, { degree });
    const resolved = resolveCard(resolveCardRef, session, runtimeGroupId);
    const { group, node, card } = resolved;
    if (group.rules.paceMode !== "roll") throw rulesError("GROUP_USES_STEADY_PACE", `Runtime group '${runtimeGroupId}' uses steady pace and does not take participant check turns.`);
    assertParticipantTurn(session, group, participantId);
    if (isNodeCleared(session, node.id, runtimeGroupId)) throw rulesError("OBSTACLE_ALREADY_CLEARED", `Obstacle '${node.id}' is already cleared by '${runtimeGroupId}'.`);

    const approach = findApproach(card, approachId);
    const allConsequences = consequencesFor(card, approach, degree);
    const delta = pointDeltaForConsequences(allConsequences, degree);
    const requiredPoints = card.obstacle.requiredPoints;
    const separatedSuccess = group.participantIds.length === 1 && ["success", "criticalSuccess"].includes(degree);

    let changed = updateGroupProgress(session, runtimeGroupId, delta);
    let next = changed.session;
    let nextGroup = getRuntimeGroup(next, runtimeGroupId);
    markRoundParticipant(next, participantId);
    next.events = [...(next.events ?? []), event("checkResolved", next, {
      runtimeGroupId,
      participantId,
      nodeId: node.id,
      cardId: card.id,
      approachId,
      degree,
      chasePointDelta: delta,
      progressBefore: changed.before,
      progressAfter: nextGroup.position.progress
    })];
    next = createChaseSession(next);

    const obstacleCleared = separatedSuccess || getRuntimeGroup(next, runtimeGroupId).position.progress >= requiredPoints;
    let routeChoiceRequired = false;
    let traversedEdgeIds = [];
    if (obstacleCleared) {
      const copy = cloneData(next);
      getRuntimeGroup(copy, runtimeGroupId).position.progress = requiredPoints;
      next = markNodeCleared(createChaseSession(copy), node.id, runtimeGroupId, requiredPoints);
      if (group.participantIds.length === 1 && degree === "criticalSuccess") next = setPendingSeparatedBonus(next, runtimeGroupId);
      const route = advanceFromClearedCard(next, runtimeGroupId, routeEngine, { context });
      next = route.session;
      routeChoiceRequired = route.routeChoiceRequired;
      traversedEdgeIds = route.traversedEdgeIds;
    }

    const currentGroup = getRuntimeGroup(next, runtimeGroupId);
    return Object.freeze({
      session: next,
      degree,
      chasePointDelta: delta,
      progressBefore: changed.before,
      progressAfter: currentGroup.position.progress,
      requiredPoints,
      obstacleCleared,
      routeChoiceRequired,
      traversedEdgeIds: [...traversedEdgeIds],
      deferredConsequences: deferredConsequences(allConsequences),
      pendingCheckBonus: cloneData(currentGroup.rules.pendingCheckBonus)
    });
  }

  function resolveCheck(session, {
    runtimeGroupId,
    participantId,
    approachId,
    total,
    natural = null,
    gmDc = null,
    partyLevel = null,
    pendingBonusAlreadyApplied = false,
    context = {}
  } = {}) {
    assertSession(session);
    const { card } = resolveCard(resolveCardRef, session, runtimeGroupId);
    const approach = findApproach(card, approachId);
    if (!approach) throw rulesError("APPROACH_REQUIRED", "Check resolution requires a Chase Card approach.", { cardId: card.id });
    const dc = resolveApproachDc(approach, {
      partyLevel: partyLevel ?? session.blueprintSnapshot.settings.partyLevel,
      gmDc
    });
    if (dc.value === null) throw rulesError("CHECK_DC_UNAVAILABLE", `Approach '${approach.id}' does not use a check DC.`);

    let working = session;
    const pending = pendingCheckBonus(working, runtimeGroupId);
    let appliedPendingBonus = 0;
    if (pending) {
      const consumed = consumePendingCheckBonus(working, runtimeGroupId);
      working = consumed.session;
      if (!pendingBonusAlreadyApplied) appliedPendingBonus = Number(consumed.bonus?.value ?? 0);
    }
    const rawTotal = Number(total);
    if (!Number.isFinite(rawTotal)) throw rulesError("INVALID_CHECK_TOTAL", "Chase check total must be finite.", { total });
    const effectiveTotal = rawTotal + appliedPendingBonus;
    const degree = degreeOfSuccess({ total: effectiveTotal, dc: dc.value, natural });
    const applied = applyDegree(working, { runtimeGroupId, participantId, approachId, degree, context });
    return Object.freeze({
      ...applied,
      dc,
      rawTotal,
      effectiveTotal,
      natural,
      appliedPendingBonus
    });
  }

  function applyAutomaticContribution(session, {
    runtimeGroupId,
    participantId,
    points = 1,
    label = "automatic",
    context = {}
  } = {}) {
    assertSession(session);
    assertActiveRound(session);
    const amount = Number(points);
    if (!Number.isFinite(amount) || amount < 0) throw rulesError("INVALID_AUTOMATIC_POINTS", "Automatic chase contribution points must be a non-negative finite number.", { points });
    const { group, node, card } = resolveCard(resolveCardRef, session, runtimeGroupId);
    if (group.rules.paceMode !== "roll") throw rulesError("GROUP_USES_STEADY_PACE", `Runtime group '${runtimeGroupId}' uses steady pace and does not take participant turns.`);
    assertParticipantTurn(session, group, participantId);
    if (isNodeCleared(session, node.id, runtimeGroupId)) throw rulesError("OBSTACLE_ALREADY_CLEARED", `Obstacle '${node.id}' is already cleared by '${runtimeGroupId}'.`);

    const changed = updateGroupProgress(session, runtimeGroupId, amount);
    let next = changed.session;
    markRoundParticipant(next, participantId);
    next.events = [...(next.events ?? []), event("automaticContribution", next, { runtimeGroupId, participantId, nodeId: node.id, cardId: card.id, points: amount, label })];
    next = createChaseSession(next);

    const requiredPoints = card.obstacle.requiredPoints;
    const obstacleCleared = getRuntimeGroup(next, runtimeGroupId).position.progress >= requiredPoints;
    let routeChoiceRequired = false;
    let traversedEdgeIds = [];
    if (obstacleCleared) {
      const copy = cloneData(next);
      getRuntimeGroup(copy, runtimeGroupId).position.progress = requiredPoints;
      next = markNodeCleared(createChaseSession(copy), node.id, runtimeGroupId, requiredPoints);
      const route = advanceFromClearedCard(next, runtimeGroupId, routeEngine, { context });
      next = route.session;
      routeChoiceRequired = route.routeChoiceRequired;
      traversedEdgeIds = route.traversedEdgeIds;
    }
    return Object.freeze({ session: next, points: amount, obstacleCleared, routeChoiceRequired, traversedEdgeIds });
  }

  function skipParticipantTurn(session, { runtimeGroupId, participantId, allowNoObstacle = false } = {}) {
    assertSession(session);
    assertActiveRound(session);
    const group = getRuntimeGroup(session, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    if (group.rules.paceMode !== "roll") throw rulesError("GROUP_USES_STEADY_PACE", `Runtime group '${runtimeGroupId}' uses steady pace.`);
    assertParticipantTurn(session, group, participantId);

    let next = cloneData(session);
    let penaltyApplied = false;
    const node = currentNode(next, getRuntimeGroup(next, runtimeGroupId));
    if (node?.type === "card" && !isNodeCleared(next, node.id, runtimeGroupId)) {
      const changed = updateGroupProgress(next, runtimeGroupId, -1);
      next = changed.session;
      penaltyApplied = true;
    } else if (!allowNoObstacle) {
      throw rulesError("NO_ACTIVE_OBSTACLE", `Cannot apply the skipped-turn Chase Point penalty while '${runtimeGroupId}' is not on an uncleared card.`, { nodeId: node?.id ?? null, nodeType: node?.type ?? null });
    }

    markRoundParticipant(next, participantId, { skipped: true });
    next.events = [...(next.events ?? []), event("participantSkipped", next, { runtimeGroupId, participantId, penalty: penaltyApplied ? -1 : 0, penaltyApplied })];
    next.updatedAt = nowIso();
    return Object.freeze({ session: createChaseSession(next), penaltyApplied, chasePointDelta: penaltyApplied ? -1 : 0 });
  }

  function chooseRoute(session, { runtimeGroupId, edgeId, context = {} } = {}) {
    assertSession(session);
    return Object.freeze(moveThroughChoice(session, runtimeGroupId, edgeId, routeEngine, { context }));
  }

  function advanceSteadyGroup(session, runtimeGroupId, { obstacles = 1, edgeId = null, context = {} } = {}) {
    assertSession(session);
    let next = session;
    const requested = Math.max(0, Math.trunc(Number(obstacles) || 0));
    const traversedEdgeIds = [];
    let advancedObstacles = 0;
    let routeChoiceRequired = false;

    for (let count = 0; count < requested; count += 1) {
      let group = getRuntimeGroup(next, runtimeGroupId);
      if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
      if (group.completed) break;

      let node = currentNode(next, group);
      if (node?.type === "choice") {
        if (!edgeId) {
          routeChoiceRequired = true;
          break;
        }
        const chosen = moveThroughChoice(next, runtimeGroupId, edgeId, routeEngine, { context });
        next = chosen.session;
        traversedEdgeIds.push(...chosen.traversedEdgeIds);
        edgeId = null;
        group = getRuntimeGroup(next, runtimeGroupId);
        node = currentNode(next, group);
      }

      if (node?.type !== "card") {
        const deterministic = routeEngine.resolveDeterministic(next, runtimeGroupId, { context });
        next = deterministic.session;
        traversedEdgeIds.push(...deterministic.traversedEdgeIds);
        group = getRuntimeGroup(next, runtimeGroupId);
        if (group.completed) break;
        node = currentNode(next, group);
      }

      if (node?.type !== "card") {
        routeChoiceRequired = node?.type === "choice";
        break;
      }

      if (isNodeCleared(next, node.id, runtimeGroupId)) {
        const route = advanceFromClearedCard(next, runtimeGroupId, routeEngine, { context, edgeId });
        next = route.session;
        traversedEdgeIds.push(...route.traversedEdgeIds);
        edgeId = null;
        if (route.routeChoiceRequired) {
          routeChoiceRequired = true;
          break;
        }
        group = getRuntimeGroup(next, runtimeGroupId);
        if (group.completed) break;
        node = currentNode(next, group);
      }

      if (node?.type !== "card") {
        routeChoiceRequired = node?.type === "choice";
        break;
      }

      const { card } = resolveCard(resolveCardRef, next, runtimeGroupId);
      const copy = cloneData(next);
      getRuntimeGroup(copy, runtimeGroupId).position.progress = card.obstacle.requiredPoints;
      next = markNodeCleared(createChaseSession(copy), node.id, runtimeGroupId, card.obstacle.requiredPoints);
      const route = advanceFromClearedCard(next, runtimeGroupId, routeEngine, { context, edgeId });
      next = route.session;
      traversedEdgeIds.push(...route.traversedEdgeIds);
      edgeId = null;
      advancedObstacles += 1;
      routeChoiceRequired = route.routeChoiceRequired;
      if (routeChoiceRequired) break;
    }

    const copy = cloneData(next);
    copy.events = [...(copy.events ?? []), event("steadyPaceAdvanced", copy, { runtimeGroupId, advancedObstacles, traversedEdgeIds, routeChoiceRequired })];
    copy.updatedAt = nowIso();
    return Object.freeze({ session: createChaseSession(copy), advancedObstacles, traversedEdgeIds, routeChoiceRequired });
  }

  function endRound(session, { autoSkipUnacted = true, advanceSteady = true, routeChoices = {}, context = {}, completeOnOutcome = true } = {}) {
    assertSession(session);
    assertActiveRound(session);
    let next = session;
    const skipped = [];
    const steadyAdvances = [];

    if (autoSkipUnacted) {
      for (const runtimeGroup of [...next.groups]) {
        const current = getRuntimeGroup(next, runtimeGroup.id);
        if (!current || current.completed || current.rules.paceMode !== "roll") continue;
        for (const participantId of current.participantIds) {
          if (next.roundState.actedParticipantIds.includes(participantId)) continue;
          const result = skipParticipantTurn(next, { runtimeGroupId: current.id, participantId, allowNoObstacle: true });
          next = result.session;
          skipped.push({ runtimeGroupId: current.id, participantId, penaltyApplied: result.penaltyApplied });
        }
      }
    }

    if (advanceSteady) {
      for (const runtimeGroup of [...next.groups]) {
        let current = getRuntimeGroup(next, runtimeGroup.id);
        if (!current || current.completed || current.rules.paceMode !== "steady") continue;
        const copy = cloneData(next);
        current = getRuntimeGroup(copy, runtimeGroup.id);
        current.rules.steadyProgress += current.rules.obstaclesPerRound;
        next = createChaseSession(copy);
        while (getRuntimeGroup(next, runtimeGroup.id).rules.steadyProgress >= 1 && !getRuntimeGroup(next, runtimeGroup.id).completed) {
          const choice = routeChoices[runtimeGroup.id] ?? routeChoices[runtimeGroup.groupId] ?? null;
          const advanced = advanceSteadyGroup(next, runtimeGroup.id, { obstacles: 1, edgeId: choice, context });
          if (advanced.advancedObstacles === 0) {
            steadyAdvances.push({ runtimeGroupId: runtimeGroup.id, advancedObstacles: 0, routeChoiceRequired: advanced.routeChoiceRequired });
            break;
          }
          const advancedCopy = cloneData(advanced.session);
          getRuntimeGroup(advancedCopy, runtimeGroup.id).rules.steadyProgress = Math.max(0, getRuntimeGroup(advancedCopy, runtimeGroup.id).rules.steadyProgress - 1);
          next = createChaseSession(advancedCopy);
          steadyAdvances.push({ runtimeGroupId: runtimeGroup.id, advancedObstacles: advanced.advancedObstacles, routeChoiceRequired: advanced.routeChoiceRequired });
          if (advanced.routeChoiceRequired) break;
        }
      }
    }

    const copy = cloneData(next);
    copy.roundState.phase = "ended";
    copy.roundState.endedAt = nowIso();
    copy.events = [...(copy.events ?? []), event("roundEnded", copy, { round: copy.round, skipped, steadyAdvances })];
    copy.updatedAt = nowIso();
    next = createChaseSession(copy);

    const outcome = evaluateOutcome(next, { phase: "endOfRound" });
    if (completeOnOutcome && outcome.ended) next = completeSession(next, outcome).session;
    return Object.freeze({ session: next, skipped, steadyAdvances, outcome });
  }

  function getObstacleIndex(session, runtimeGroupId) {
    assertSession(session);
    return obstacleIndex(session, runtimeGroupId);
  }

  function getObstacleLead(session, quarryGroupId, pursuerGroupId) {
    assertSession(session);
    return obstacleIndex(session, quarryGroupId) - obstacleIndex(session, pursuerGroupId);
  }

  function evaluateOutcome(session, { phase = "immediate" } = {}) {
    assertSession(session);
    const type = session.blueprintSnapshot.settings.chaseType;
    if (!CHASE_TYPES.includes(type)) return Object.freeze({ ended: false, outcome: null });

    const quarry = roleGroups(session, "quarry");
    const pursuers = roleGroups(session, "pursuer");
    const competitors = roleGroups(session, "competitor");

    if (["pursuit", "escape"].includes(type)) {
      const escaped = completedGroups(session, quarry);
      if (escaped.length > 0) {
        return makeEvaluation("quarryEscaped", {
          winners: escaped,
          losers: pursuers,
          endingNodeId: escaped[0].position.nodeId,
          reason: "escapeEndpoint"
        });
      }

      const catches = groupsSharingNode(quarry, pursuers);
      if (catches.length > 0) {
        const caughtQuarry = [...new Set(catches.map(([q]) => q))];
        const catchingPursuers = [...new Set(catches.map(([, p]) => p))];
        return makeEvaluation("quarryCaught", {
          winners: catchingPursuers,
          losers: caughtQuarry,
          endingNodeId: catches[0][0].position.nodeId,
          reason: "samePosition"
        });
      }

      if (type === "escape" && phase === "startOfRound" && quarry.length > 0 && pursuers.length > 0) {
        for (const quarryGroup of quarry) {
          const nearestLead = Math.min(...pursuers.map(pursuer => getObstacleLead(session, quarryGroup.id, pursuer.id)));
          if (nearestLead >= session.rules.escapeLead) {
            return makeEvaluation("quarryEscaped", {
              winners: [quarryGroup],
              losers: pursuers,
              reason: "leadThreshold",
              details: { lead: nearestLead, threshold: session.rules.escapeLead }
            });
          }
        }
      }
      return Object.freeze({ ended: false, outcome: null });
    }

    if (type === "againstClock") {
      const goalGroups = session.groups.filter(group => groupRole(session, group) !== "competitor");
      const reached = completedGroups(session, goalGroups);
      if (reached.length > 0) {
        return makeEvaluation("goalReached", { winners: reached, endingNodeId: reached[0].position.nodeId, reason: "goalEndpoint" });
      }
      const limit = session.rules.roundLimit;
      if (limit !== null && ["endOfRound", "startOfRound"].includes(phase) && session.round >= limit) {
        return makeEvaluation("timeExpired", { losers: goalGroups, reason: "roundLimit", details: { round: session.round, roundLimit: limit } });
      }
      return Object.freeze({ ended: false, outcome: null });
    }

    if (type === "race") {
      const racers = competitors.length > 0 ? competitors : session.groups;
      const winners = completedGroups(session, racers);
      if (winners.length > 0) {
        const loserIds = racers.filter(group => !winners.some(winner => winner.id === group.id));
        return makeEvaluation("raceWon", { winners, losers: loserIds, endingNodeId: winners[0].position.nodeId, reason: "raceEndpoint" });
      }
      return Object.freeze({ ended: false, outcome: null });
    }

    return Object.freeze({ ended: false, outcome: null });
  }

  function completeSession(session, evaluation) {
    assertSession(session);
    if (!evaluation?.ended) throw rulesError("CHASE_NOT_ENDED", "Cannot complete a Chase Session without an ending evaluation.");
    const next = cloneData(session);
    next.status = "completed";
    next.endedAt = next.endedAt ?? nowIso();
    next.events = [...(next.events ?? []), event("chaseCompleted", next, { outcome: evaluation.outcome, winnerGroupIds: evaluation.winnerGroupIds, loserGroupIds: evaluation.loserGroupIds, reason: evaluation.reason })];
    next.updatedAt = nowIso();
    const normalized = createChaseSession(next);
    const result = createChaseResult({
      sessionId: normalized.id,
      blueprintId: normalized.blueprintId,
      outcome: evaluation.outcome,
      endingNodeId: evaluation.endingNodeId,
      winnerGroupIds: evaluation.winnerGroupIds,
      loserGroupIds: evaluation.loserGroupIds,
      rounds: normalized.round,
      routes: Object.fromEntries(normalized.groups.map(group => [group.id, { nodes: [...group.routeHistory], edges: [...group.edgeHistory] }])),
      events: normalized.events,
      startedAt: normalized.startedAt,
      endedAt: normalized.endedAt,
      metadata: { reason: evaluation.reason, details: cloneData(evaluation.details ?? {}) }
    });
    return Object.freeze({ session: normalized, result });
  }

  return Object.freeze({
    initializeSession,
    configureGroupPace,
    beginRound,
    endRound,
    currentObstacle,
    resolveCheck,
    applyDegree,
    applyAutomaticContribution,
    skipParticipantTurn,
    chooseRoute,
    advanceSteadyGroup,
    pendingCheckBonus,
    consumePendingCheckBonus,
    getTurnPolicy,
    getObstacleIndex,
    getObstacleLead,
    evaluateOutcome,
    completeSession,
    recommendObstaclePoints,
    getChaseLengthGuideline,
    deriveStartPositions: deriveChaseStartPositions
  });
}
