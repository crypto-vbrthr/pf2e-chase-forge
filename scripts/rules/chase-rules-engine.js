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
import { effectiveObstaclePoints, recommendObstaclePoints } from "./chase-guidelines.js";

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

function groupOrderMode(session) {
  return session?.metadata?.runner?.groupOrderMode === "manual" ? "manual" : "automatic";
}

function isGroupResolved(group) {
  return Boolean(group?.completed || group?.metadata?.runtimeResolution?.terminal === true);
}

function unactedParticipantIds(session, group) {
  const acted = new Set(session?.roundState?.actedParticipantIds ?? []);
  return (group?.participantIds ?? []).filter(id => !acted.has(id));
}

function rolePhase(session) {
  const type = session?.blueprintSnapshot?.settings?.chaseType;
  if (!["pursuit", "escape"].includes(type) || session?.roundState?.phase !== "active") return null;
  const quarryPending = session.groups.some(group => groupRole(session, group) === "quarry" && !isGroupResolved(group) && !groupFinishedRoundTurn(session, group));
  return quarryPending ? "quarry" : "other";
}

function eligibleRollingGroups(session, { role = null } = {}) {
  if (session?.roundState?.phase !== "active") return [];
  return (session.groups ?? []).filter(group => {
    if (!group || isGroupResolved(group) || group.rules?.paceMode !== "roll") return false;
    if (role === "other" && groupRole(session, group) === "quarry") return false;
    if (role && role !== "other" && groupRole(session, group) !== role) return false;
    return !groupFinishedRoundTurn(session, group);
  });
}

function outgoingUnlockedEdges(session, nodeId) {
  const locked = new Set(session?.lockedEdgeIds ?? []);
  const unlocked = new Set(session?.unlockedEdgeIds ?? []);
  return (session?.blueprintSnapshot?.graph?.edges ?? []).filter(edge => {
    if (edge.from !== nodeId || locked.has(edge.id)) return false;
    if (["hidden", "discoverable"].includes(edge.visibility) && !unlocked.has(edge.id)) return false;
    return true;
  });
}

function shortestRemainingCardDistance(session, runtimeGroupId) {
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group) return Number.POSITIVE_INFINITY;
  const graph = session?.blueprintSnapshot?.graph;
  if (!graph) return Number.POSITIVE_INFINITY;
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const ends = new Set(graph.endNodeIds ?? []);
  const queue = [{ nodeId: group.position.nodeId, cost: 0 }];
  const best = new Map([[group.position.nodeId, 0]]);
  let answer = Number.POSITIVE_INFINITY;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current.cost !== best.get(current.nodeId)) continue;
    const node = nodeById.get(current.nodeId);
    if (!node) continue;
    const end = node.type === "end" || ends.has(node.id);
    if (end) { answer = Math.min(answer, current.cost); continue; }
    for (const edge of outgoingUnlockedEdges(session, current.nodeId)) {
      const target = nodeById.get(edge.to);
      if (!target) continue;
      const increment = target.type === "card" ? 1 : 0;
      const nextCost = current.cost + increment;
      if (nextCost < (best.get(target.id) ?? Number.POSITIVE_INFINITY)) {
        best.set(target.id, nextCost);
        queue.push({ nodeId: target.id, cost: nextCost });
      }
    }
  }
  const currentNode = nodeById.get(group.position.nodeId);
  const currentObstacleCost = currentNode?.type === "card" && !isNodeCleared(session, currentNode.id, group.id) ? 1 : 0;
  return Number.isFinite(answer) ? answer + currentObstacleCost : answer;
}

function groupOrderCandidates(session) {
  const type = session?.blueprintSnapshot?.settings?.chaseType;
  if (!["pursuit", "escape"].includes(type) || session?.roundState?.phase !== "active") return [];
  const phaseRole = rolePhase(session);
  const groups = eligibleRollingGroups(session, { role: phaseRole });
  return groups.map(group => {
    const unacted = unactedParticipantIds(session, group);
    return {
      runtimeGroupId: group.id,
      groupId: group.groupId,
      role: groupRole(session, group),
      distance: shortestRemainingCardDistance(session, group.id),
      unactedCount: unacted.length,
      actedCount: Math.max(0, (group.participantIds?.length ?? 0) - unacted.length),
      participantCount: group.participantIds?.length ?? 0
    };
  }).sort((a, b) => {
    const da = Number.isFinite(a.distance) ? a.distance : -1;
    const db = Number.isFinite(b.distance) ? b.distance : -1;
    return (db - da) || (a.actedCount - b.actedCount) || (a.participantCount - b.participantCount) || String(a.runtimeGroupId).localeCompare(String(b.runtimeGroupId));
  });
}

function recommendedActiveGroupId(session) {
  return groupOrderCandidates(session)[0]?.runtimeGroupId ?? null;
}

function activeGroupEligible(session, runtimeGroupId) {
  if (!runtimeGroupId) return false;
  return groupOrderCandidates(session).some(item => item.runtimeGroupId === runtimeGroupId);
}

function refreshActiveGroup(session, { preserveCurrent = true } = {}) {
  const type = session?.blueprintSnapshot?.settings?.chaseType;
  if (!["pursuit", "escape"].includes(type) || session?.roundState?.phase !== "active") return createChaseSession(session);
  const next = cloneData(session);
  const candidates = groupOrderCandidates(next);
  if (candidates.length === 0) { next.activeGroupId = null; return createChaseSession(next); }
  if (preserveCurrent && activeGroupEligible(next, next.activeGroupId)) return createChaseSession(next);
  next.activeGroupId = groupOrderMode(next) === "manual" ? null : candidates[0].runtimeGroupId;
  return createChaseSession(next);
}

function markRoundParticipant(next, participantId, { skipped = false } = {}) {
  next.roundState.actedParticipantIds = uniqueStrings([...(next.roundState.actedParticipantIds ?? []), participantId]);
  if (skipped) next.roundState.skippedParticipantIds = uniqueStrings([...(next.roundState.skippedParticipantIds ?? []), participantId]);
}

function assertActiveRound(session) {
  if (session.roundState?.phase !== "active") throw rulesError("ROUND_NOT_ACTIVE", "A chase contribution requires an active round.", { phase: session.roundState?.phase ?? null });
}

function steadyTurnEvent(session, runtimeGroupId) {
  return [...(session.events ?? [])].reverse().find(item =>
    item?.type === "steadyPaceTurn"
    && item?.round === session.round
    && item?.runtimeGroupId === runtimeGroupId
  ) ?? null;
}

function groupFinishedRoundTurn(session, group) {
  if (!group || isGroupResolved(group)) return true;
  if (group.rules?.paceMode === "steady") {
    const turn = steadyTurnEvent(session, group.id);
    if (!turn) return false;
    if (!turn.routeChoiceRequired) return true;
    const node = currentNode(session, group);
    if (!node) return true;
    if (node.type === "choice") return false;
    if (node.type === "card" && isNodeCleared(session, node.id, group.id)) return false;
    return true;
  }
  const participants = group.participantIds ?? [];
  if (participants.length === 0) return true;
  const allActed = participants.every(participantId => session.roundState.actedParticipantIds.includes(participantId));
  if (!allActed) return false;
  const node = currentNode(session, group);
  if (node?.type === "choice") return false;
  if (node?.type === "card" && isNodeCleared(session, node.id, group.id)) {
    const choices = outgoingUnlockedEdges(session, node.id);
    if (choices.length > 1) return false;
  }
  return true;
}

function raceInitiativeEntries(session) {
  const entries = [];
  for (const group of session.groups ?? []) {
    if (group.completed || group.rules?.paceMode !== "roll") continue;
    const definition = getBlueprintGroup(session, group);
    for (const participantId of group.participantIds ?? []) {
      const participant = definition?.participants?.find?.(item => item.id === participantId) ?? null;
      entries.push({
        participantId,
        runtimeGroupId: group.id,
        groupId: group.groupId,
        participantName: participant?.name || participantId,
        groupName: definition?.name || group.groupId
      });
    }
  }
  return entries;
}

function normalizeRaceInitiativeOrder(session, initiativeOrder) {
  const entries = raceInitiativeEntries(session);
  if (entries.length === 0) return [];
  if (!Array.isArray(initiativeOrder) || initiativeOrder.length === 0) {
    throw rulesError("RACE_INITIATIVE_REQUIRED", "A race round requires an initiative order for all rolling participants.", { participantIds: entries.map(item => item.participantId) });
  }
  const byParticipant = new Map(entries.map(item => [item.participantId, item]));
  const byGroup = new Map();
  for (const entry of entries) {
    const list = byGroup.get(entry.runtimeGroupId) ?? [];
    list.push(entry.participantId);
    byGroup.set(entry.runtimeGroupId, list);
  }
  const expanded = [];
  for (const rawId of initiativeOrder) {
    const id = String(rawId ?? "");
    if (byParticipant.has(id)) expanded.push(id);
    else if (byGroup.has(id)) expanded.push(...byGroup.get(id));
  }
  const normalized = uniqueStrings(expanded).filter(id => byParticipant.has(id));
  const missing = entries.map(item => item.participantId).filter(id => !normalized.includes(id));
  if (missing.length > 0) {
    throw rulesError("RACE_INITIATIVE_INCOMPLETE", "Race initiative must include every rolling participant exactly once.", { missingParticipantIds: missing, initiativeOrder: normalized });
  }
  return normalized;
}

function nextRaceParticipantId(session) {
  if (session.blueprintSnapshot?.settings?.chaseType !== "race" || session.roundState?.phase !== "active") return null;
  const entries = new Map(raceInitiativeEntries(session).map(item => [item.participantId, item]));
  for (const participantId of session.roundState?.initiativeOrder ?? []) {
    const entry = entries.get(participantId);
    if (!entry) continue;
    if (session.roundState.actedParticipantIds.includes(participantId)) continue;
    const group = getRuntimeGroup(session, entry.runtimeGroupId);
    if (!group || group.completed) continue;
    return participantId;
  }
  return null;
}

function runtimeGroupCanAct(session, runtimeGroupId) {
  if (session.roundState?.phase !== "active") return false;
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group || isGroupResolved(group)) return false;
  const type = session.blueprintSnapshot?.settings?.chaseType;
  if (type === "race") {
    if (group.rules?.paceMode !== "roll") return false;
    const nextParticipantId = nextRaceParticipantId(session);
    return nextParticipantId ? group.participantIds.includes(nextParticipantId) : false;
  }
  if (!["pursuit", "escape"].includes(type)) return true;
  if (group.rules?.paceMode !== "roll") return false;
  const phaseRole = rolePhase(session);
  if (phaseRole === "quarry" && groupRole(session, group) !== "quarry") return false;
  if (phaseRole === "other" && groupRole(session, group) === "quarry") return false;
  const candidates = groupOrderCandidates(session);
  if (!candidates.some(item => item.runtimeGroupId === runtimeGroupId)) return false;
  if (candidates.length === 1) return true;
  const activeId = activeGroupEligible(session, session.activeGroupId)
    ? session.activeGroupId
    : (groupOrderMode(session) === "automatic" ? candidates[0]?.runtimeGroupId ?? null : null);
  return activeId === runtimeGroupId;
}

function participantCanAct(session, runtimeGroupId, participantId) {
  if (session.roundState?.phase !== "active") return false;
  const group = getRuntimeGroup(session, runtimeGroupId);
  if (!group || isGroupResolved(group) || group.rules?.paceMode !== "roll") return false;
  if (!participantId || !group.participantIds.includes(participantId)) return false;
  if (session.roundState.actedParticipantIds.includes(participantId)) return false;
  if (!runtimeGroupCanAct(session, runtimeGroupId)) return false;
  if (session.blueprintSnapshot?.settings?.chaseType === "race") return nextRaceParticipantId(session) === participantId;
  return true;
}

function assertParticipantTurn(session, group, participantId) {
  if (!participantId || !group.participantIds.includes(participantId)) {
    throw rulesError("PARTICIPANT_NOT_IN_GROUP", `Participant '${participantId ?? ""}' is not part of runtime group '${group.id}'.`, { runtimeGroupId: group.id, participantId });
  }
  if (session.roundState.actedParticipantIds.includes(participantId)) {
    throw rulesError("PARTICIPANT_ALREADY_ACTED", `Participant '${participantId}' already acted this round.`, { participantId, round: session.round });
  }
  if (!participantCanAct(session, group.id, participantId)) {
    const race = session.blueprintSnapshot?.settings?.chaseType === "race";
    throw rulesError(
      race ? "INITIATIVE_TURN_BLOCKED" : "GROUP_TURN_BLOCKED",
      race
        ? `Participant '${participantId}' must wait for their place in the race initiative order.`
        : `Runtime group '${group.id}' is not the active chase group for this phase.`,
      { runtimeGroupId: group.id, participantId, round: session.round, nextParticipantId: race ? nextRaceParticipantId(session) : null }
    );
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
  const card = cardResolver(node.cardRef, session);
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

function hasRouteConsequences(consequences) {
  return consequences.some(consequence => ["routeUnlock", "routeLock", "routeSelect"].includes(consequence.kind));
}

function consequenceOccurrences(consequences, context = {}) {
  return deferredConsequences(consequences).map(consequence => ({
    occurrenceId: `${context.sourceEventId}:${consequence.id}`,
    consequence: cloneData(consequence),
    sourceEventId: context.sourceEventId,
    runtimeGroupId: context.runtimeGroupId ?? null,
    participantId: context.participantId ?? null,
    nodeId: context.nodeId ?? null,
    cardId: context.cardId ?? null,
    approachId: context.approachId ?? null,
    degree: context.degree ?? null
  }));
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

function pendingBonusesForGroup(group) {
  if (!group?.rules) return [];
  if (Array.isArray(group.rules.pendingCheckBonuses)) return group.rules.pendingCheckBonuses;
  return group.rules.pendingCheckBonus ? [group.rules.pendingCheckBonus] : [];
}

function setGroupPendingBonuses(group, bonuses = []) {
  group.rules ??= {};
  const list = Array.isArray(bonuses) ? bonuses.filter(Boolean).map(cloneData) : [];
  group.rules.pendingCheckBonuses = list;
  // Keep a legacy mirror so external integrations reading the pre-rc.3 field do
  // not break. All authoritative rules logic uses the participant-bound array.
  group.rules.pendingCheckBonus = list[0] ? cloneData(list[0]) : null;
  return group;
}

function setPendingSeparatedBonus(session, runtimeGroupId, participantId) {
  const next = cloneData(session);
  const group = getRuntimeGroup(next, runtimeGroupId);
  if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
  if (!participantId || !(group.participantIds ?? []).includes(participantId)) {
    throw rulesError("PARTICIPANT_NOT_IN_GROUP", `Participant '${participantId ?? ""}' does not belong to runtime group '${runtimeGroupId}'.`, { runtimeGroupId, participantId });
  }
  const bonus = {
    participantId,
    value: 2,
    type: "circumstance",
    source: "separatedCriticalSuccess",
    grantedAtRound: next.round
  };
  const existing = pendingBonusesForGroup(group).filter(item => item?.participantId !== participantId);
  setGroupPendingBonuses(group, [...existing, bonus]);
  next.events = [...(next.events ?? []), event("separatedCriticalBonus", next, { runtimeGroupId, participantId, value: 2 })];
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

export { recommendObstaclePoints } from "./chase-guidelines.js";

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
    const entries = raceInitiativeEntries(session);
    return Object.freeze({
      mode: "initiative",
      quarryFirst: false,
      initiativeRequired: entries.length > 0,
      suggestedOrder: [...session.roundState.initiativeOrder],
      currentParticipantId: nextRaceParticipantId(session),
      entries: entries.map(item => Object.freeze({ ...item }))
    });
  }
  if (["pursuit", "escape"].includes(type)) {
    return Object.freeze({ mode: "quarryFirst", quarryFirst: true, initiativeRequired: false, suggestedOrder: [...quarry, ...others] });
  }
  return Object.freeze({ mode: "free", quarryFirst: false, initiativeRequired: false, suggestedOrder: session.groups.map(group => group.id) });
}

export function createChaseRulesEngine({ registries = null, cardResolver = null, routeEngine = createRouteGraphEngine() } = {}) {
  const resolveCardRef = cardResolver ?? ((id, session = null) => {
    const snapshot = session?.blueprintSnapshot?.contentSnapshots?.cards?.find?.(record => record.ref === id)?.data ?? null;
    if (session?.blueprintSnapshot?.contentSnapshots?.mode === "snapshot" && snapshot) return cloneData(snapshot);
    const live = registries?.getCard?.(id, { includeDisabled: true }) ?? null;
    if (live) return live;
    return snapshot ? cloneData(snapshot) : null;
  });

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

  function canSplitRuntimeGroup(session, runtimeGroupId) {
    assertSession(session);
    const group = getRuntimeGroup(session, runtimeGroupId);
    if (!group) return Object.freeze({ allowed: false, reason: "unknownGroup" });
    if (isGroupResolved(group)) return Object.freeze({ allowed: false, reason: "resolved" });
    if ((group.participantIds?.length ?? 0) < 2) return Object.freeze({ allowed: false, reason: "singleParticipant" });
    const node = currentNode(session, group);
    if (!node) return Object.freeze({ allowed: false, reason: "unknownNode" });
    if (node.type === "card" && !isNodeCleared(session, node.id, group.id) && Number(group.position?.progress ?? 0) > 0) {
      return Object.freeze({ allowed: false, reason: "obstacleInProgress" });
    }
    return Object.freeze({ allowed: true, reason: null, nodeId: node.id, nodeType: node.type });
  }

  function splitRuntimeGroup(session, { runtimeGroupId, participantIds = [] } = {}) {
    assertSession(session);
    const eligibility = canSplitRuntimeGroup(session, runtimeGroupId);
    if (!eligibility.allowed) throw rulesError("GROUP_SPLIT_NOT_ALLOWED", `Runtime group '${runtimeGroupId}' cannot be split at its current position.`, eligibility);
    const selected = uniqueStrings(participantIds);
    const next = cloneData(session);
    const source = getRuntimeGroup(next, runtimeGroupId);
    const sourceSet = new Set(source.participantIds ?? []);
    if (selected.length === 0 || selected.some(id => !sourceSet.has(id))) {
      throw rulesError("GROUP_SPLIT_PARTICIPANTS_INVALID", "Split participants must be a non-empty subset of the runtime group.", { runtimeGroupId, participantIds: selected });
    }
    if (selected.length >= source.participantIds.length) {
      throw rulesError("GROUP_SPLIT_WHOLE_GROUP", "At least one participant must remain in the original runtime group.", { runtimeGroupId, participantIds: selected });
    }
    const originalPendingBonuses = pendingBonusesForGroup(source).map(cloneData);
    const remaining = source.participantIds.filter(id => !selected.includes(id));
    source.participantIds = remaining;
    const childId = createId("runtime-group");
    const child = cloneData(source);
    child.id = childId;
    child.participantIds = selected;
    setGroupPendingBonuses(source, originalPendingBonuses.filter(bonus => bonus.participantId === null || remaining.includes(bonus.participantId)));
    setGroupPendingBonuses(child, originalPendingBonuses.filter(bonus => bonus.participantId && selected.includes(bonus.participantId)));
    child.parentRuntimeGroupId = runtimeGroupId;
    child.metadata = {
      ...(child.metadata ?? {}),
      splitFromRuntimeGroupId: runtimeGroupId,
      splitAtRound: next.round,
      splitAtNodeId: source.position.nodeId
    };
    next.groups.push(child);

    // A cleared obstacle belongs to the whole pre-split group. Both resulting
    // subgroups may therefore leave that obstacle independently.
    const nodeId = source.position.nodeId;
    const sourceNodeState = next.nodeState?.[nodeId]?.groups?.[runtimeGroupId];
    if (sourceNodeState?.cleared === true) {
      next.nodeState[nodeId].groups[childId] = cloneData(sourceNodeState);
    }

    if (next.activeGroupId === runtimeGroupId) {
      const sourceHasTurn = unactedParticipantIds(next, source).length > 0;
      const childHasTurn = unactedParticipantIds(next, child).length > 0;
      if (!sourceHasTurn && childHasTurn) next.activeGroupId = childId;
    }
    next.events = [...(next.events ?? []), event("runtimeGroupSplit", next, {
      runtimeGroupId,
      childRuntimeGroupId: childId,
      participantIds: selected,
      remainingParticipantIds: remaining,
      nodeId
    })];
    next.updatedAt = nowIso();
    const normalized = refreshActiveGroup(createChaseSession(next), { preserveCurrent: groupOrderMode(next) === "manual" });
    return Object.freeze({ session: normalized, runtimeGroupId, childRuntimeGroupId: childId });
  }

  function mergeCompatibility(session, firstId, secondId) {
    const first = getRuntimeGroup(session, firstId);
    const second = getRuntimeGroup(session, secondId);
    if (!first || !second || first.id === second.id) return { allowed: false, reason: "unknownGroup" };
    if (isGroupResolved(first) || isGroupResolved(second)) return { allowed: false, reason: "resolved" };
    if (first.groupId !== second.groupId) return { allowed: false, reason: "differentBlueprintGroup" };
    if (first.position?.nodeId !== second.position?.nodeId) return { allowed: false, reason: "differentPosition" };
    return { allowed: true, reason: null, nodeId: first.position.nodeId };
  }

  function canMergeRuntimeGroups(session, runtimeGroupIds = []) {
    assertSession(session);
    const ids = uniqueStrings(runtimeGroupIds);
    if (ids.length < 2) return Object.freeze({ allowed: false, reason: "tooFewGroups" });
    const anchor = ids[0];
    for (const id of ids.slice(1)) {
      const compatible = mergeCompatibility(session, anchor, id);
      if (!compatible.allowed) return Object.freeze(compatible);
    }
    return Object.freeze({ allowed: true, reason: null, nodeId: getRuntimeGroup(session, anchor)?.position?.nodeId ?? null });
  }

  function mergeRuntimeGroups(session, { runtimeGroupIds = [], targetRuntimeGroupId = null, context = {} } = {}) {
    assertSession(session);
    const ids = uniqueStrings(runtimeGroupIds);
    const compatibility = canMergeRuntimeGroups(session, ids);
    if (!compatibility.allowed) throw rulesError("GROUP_MERGE_NOT_ALLOWED", "The selected runtime groups cannot be merged.", compatibility);
    const targetId = targetRuntimeGroupId && ids.includes(targetRuntimeGroupId) ? targetRuntimeGroupId : ids[0];
    const next = cloneData(session);
    const groups = ids.map(id => getRuntimeGroup(next, id));
    const target = getRuntimeGroup(next, targetId);
    const removedIds = ids.filter(id => id !== targetId);
    const mergedSnapshots = groups.map(group => ({
      runtimeGroupId: group.id,
      participantIds: [...(group.participantIds ?? [])],
      routeHistory: [...(group.routeHistory ?? [])],
      edgeHistory: [...(group.edgeHistory ?? [])]
    }));
    target.participantIds = uniqueStrings(groups.flatMap(group => group.participantIds ?? []));
    target.position.progress = groups.reduce((sum, group) => sum + Number(group.position?.progress ?? 0), 0);
    target.parentRuntimeGroupId = target.parentRuntimeGroupId ?? groups.find(group => group.id !== targetId)?.parentRuntimeGroupId ?? null;
    const mergedPendingBonuses = [];
    const seenPendingParticipants = new Set();
    for (const group of groups) {
      for (const bonus of pendingBonusesForGroup(group)) {
        const participantId = bonus?.participantId ?? null;
        if (participantId && seenPendingParticipants.has(participantId)) continue;
        if (participantId) seenPendingParticipants.add(participantId);
        mergedPendingBonuses.push(cloneData(bonus));
      }
    }
    setGroupPendingBonuses(target, mergedPendingBonuses);
    target.metadata = {
      ...(target.metadata ?? {}),
      mergedAtRound: next.round,
      mergedAtNodeId: target.position.nodeId,
      mergedRuntimeGroups: [...(target.metadata?.mergedRuntimeGroups ?? []), ...mergedSnapshots]
    };
    next.groups = next.groups.filter(group => !removedIds.includes(group.id));
    if (removedIds.includes(next.activeGroupId)) next.activeGroupId = targetId;

    const node = currentNode(next, target);
    if (node?.type === "card") {
      next.nodeState ??= {};
      next.nodeState[node.id] ??= {};
      next.nodeState[node.id].groups ??= {};
      const cleared = groups.some(group => session.nodeState?.[node.id]?.groups?.[group.id]?.cleared === true);
      if (cleared) {
        const state = groups.map(group => session.nodeState?.[node.id]?.groups?.[group.id]).find(item => item?.cleared === true) ?? {};
        next.nodeState[node.id].groups[targetId] = cloneData(state);
      } else {
        next.nodeState[node.id].groups[targetId] = {
          ...(next.nodeState[node.id].groups[targetId] ?? {}),
          cleared: false
        };
      }
    }

    next.events = [...(next.events ?? []), event("runtimeGroupsMerged", next, {
      runtimeGroupIds: ids,
      targetRuntimeGroupId: targetId,
      participantIds: [...target.participantIds],
      nodeId: target.position.nodeId
    })];
    next.updatedAt = nowIso();
    let normalized = createChaseSession(next);

    // Re-evaluate the Chase Point target after the group size changed. Existing
    // points remain; a larger merged group can therefore need additional points.
    const current = getRuntimeGroup(normalized, targetId);
    const currentRouteNode = currentNode(normalized, current);
    let routeChoiceRequired = false;
    let traversedEdgeIds = [];
    if (currentRouteNode?.type === "card" && !isNodeCleared(normalized, currentRouteNode.id, targetId)) {
      const { card } = resolveCard(resolveCardRef, normalized, targetId);
      const requiredPoints = effectiveObstaclePoints(card, current);
      if (current.position.progress >= requiredPoints) {
        const copy = cloneData(normalized);
        getRuntimeGroup(copy, targetId).position.progress = requiredPoints;
        normalized = markNodeCleared(createChaseSession(copy), currentRouteNode.id, targetId, requiredPoints);
        const advanced = advanceFromClearedCard(normalized, targetId, routeEngine, { context });
        normalized = advanced.session;
        routeChoiceRequired = advanced.routeChoiceRequired;
        traversedEdgeIds = advanced.traversedEdgeIds;
      }
    }
    normalized = refreshActiveGroup(normalized);
    return Object.freeze({ session: normalized, targetRuntimeGroupId: targetId, removedRuntimeGroupIds: removedIds, routeChoiceRequired, traversedEdgeIds });
  }

  function canTransferParticipants(session, fromRuntimeGroupId, toRuntimeGroupId) {
    assertSession(session);
    const compatibility = mergeCompatibility(session, fromRuntimeGroupId, toRuntimeGroupId);
    if (!compatibility.allowed) return Object.freeze(compatibility);
    for (const runtimeGroupId of [fromRuntimeGroupId, toRuntimeGroupId]) {
      const group = getRuntimeGroup(session, runtimeGroupId);
      const node = currentNode(session, group);
      if (node?.type === "card" && !isNodeCleared(session, node.id, runtimeGroupId) && Number(group.position?.progress ?? 0) > 0) {
        return Object.freeze({ allowed: false, reason: "obstacleInProgress", runtimeGroupId, nodeId: node.id });
      }
    }
    return Object.freeze({ allowed: true, reason: null, nodeId: compatibility.nodeId });
  }

  function transferParticipants(session, { fromRuntimeGroupId, toRuntimeGroupId, participantIds = [] } = {}) {
    assertSession(session);
    const compatibility = canTransferParticipants(session, fromRuntimeGroupId, toRuntimeGroupId);
    if (!compatibility.allowed) throw rulesError("GROUP_TRANSFER_NOT_ALLOWED", "Participants can only move between compatible co-located runtime groups before Chase Point progress is accumulated.", compatibility);
    const selected = uniqueStrings(participantIds);
    const next = cloneData(session);
    const source = getRuntimeGroup(next, fromRuntimeGroupId);
    const target = getRuntimeGroup(next, toRuntimeGroupId);
    if (selected.length === 0 || selected.some(id => !source.participantIds.includes(id))) {
      throw rulesError("GROUP_TRANSFER_PARTICIPANTS_INVALID", "Transfer participants must belong to the source runtime group.", { participantIds: selected });
    }
    if (selected.length >= source.participantIds.length) {
      const merged = mergeRuntimeGroups(session, { runtimeGroupIds: [fromRuntimeGroupId, toRuntimeGroupId], targetRuntimeGroupId: toRuntimeGroupId });
      return Object.freeze({ ...merged, transferredParticipantIds: selected });
    }
    const sourcePending = pendingBonusesForGroup(source).map(cloneData);
    const targetPending = pendingBonusesForGroup(target).map(cloneData);
    const movingPending = sourcePending.filter(bonus => bonus.participantId && selected.includes(bonus.participantId));
    source.participantIds = source.participantIds.filter(id => !selected.includes(id));
    target.participantIds = uniqueStrings([...(target.participantIds ?? []), ...selected]);
    setGroupPendingBonuses(source, sourcePending.filter(bonus => !bonus.participantId || !selected.includes(bonus.participantId)));
    const targetParticipantBonusIds = new Set(targetPending.map(bonus => bonus?.participantId).filter(Boolean));
    setGroupPendingBonuses(target, [...targetPending, ...movingPending.filter(bonus => !targetParticipantBonusIds.has(bonus.participantId))]);
    next.events = [...(next.events ?? []), event("runtimeParticipantsTransferred", next, {
      fromRuntimeGroupId, toRuntimeGroupId, participantIds: selected, nodeId: source.position.nodeId
    })];
    next.updatedAt = nowIso();
    return Object.freeze({ session: refreshActiveGroup(createChaseSession(next)), transferredParticipantIds: selected });
  }

  function setGroupOrderMode(session, mode = "automatic") {
    assertSession(session);
    if (!["automatic", "manual"].includes(mode)) throw rulesError("INVALID_GROUP_ORDER_MODE", `Unknown group order mode '${mode}'.`);
    const next = cloneData(session);
    next.metadata ??= {};
    next.metadata.runner ??= {};
    next.metadata.runner.groupOrderMode = mode;
    next.activeGroupId = null;
    next.events = [...(next.events ?? []), event("groupOrderModeChanged", next, { mode })];
    next.updatedAt = nowIso();
    return refreshActiveGroup(createChaseSession(next), { preserveCurrent: false });
  }

  function selectActiveGroup(session, runtimeGroupId) {
    assertSession(session);
    if (session.blueprintSnapshot?.settings?.chaseType === "race") throw rulesError("GROUP_SELECTION_NOT_USED_IN_RACE", "Race order is controlled by initiative.");
    if (!activeGroupEligible(session, runtimeGroupId)) throw rulesError("GROUP_NOT_ELIGIBLE", `Runtime group '${runtimeGroupId}' cannot act in the current chase phase.`);
    const next = cloneData(session);
    next.activeGroupId = runtimeGroupId;
    next.events = [...(next.events ?? []), event("activeRuntimeGroupSelected", next, { runtimeGroupId })];
    next.updatedAt = nowIso();
    return createChaseSession(next);
  }

  function getGroupOrderState(session) {
    assertSession(session);
    const candidates = groupOrderCandidates(session);
    const activeId = activeGroupEligible(session, session.activeGroupId)
      ? session.activeGroupId
      : (groupOrderMode(session) === "automatic" ? candidates[0]?.runtimeGroupId ?? null : null);
    return Object.freeze({
      mode: groupOrderMode(session),
      phaseRole: rolePhase(session),
      activeRuntimeGroupId: activeId,
      recommendedRuntimeGroupId: candidates[0]?.runtimeGroupId ?? null,
      candidates: candidates.map(item => Object.freeze({ ...item }))
    });
  }

  function shortestGroupDistance(session, firstRuntimeGroupId, secondRuntimeGroupId) {
    assertSession(session);
    const first = getRuntimeGroup(session, firstRuntimeGroupId);
    const second = getRuntimeGroup(session, secondRuntimeGroupId);
    if (!first || !second) return null;
    if (first.position.nodeId === second.position.nodeId) return 0;
    const graph = session.blueprintSnapshot.graph;
    const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
    const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
    for (const edge of graph.edges) {
      if (session.lockedEdgeIds?.includes(edge.id)) continue;
      if (["hidden", "discoverable"].includes(edge.visibility) && !session.unlockedEdgeIds?.includes(edge.id)) continue;
      const a = nodeById.get(edge.from);
      const b = nodeById.get(edge.to);
      if (!a || !b) continue;
      const weight = a.type === "card" && b.type === "card" ? 1 : (a.type === "card" || b.type === "card" ? 0.5 : 0);
      adjacency.get(a.id).push({ nodeId: b.id, weight });
      adjacency.get(b.id).push({ nodeId: a.id, weight });
    }
    const best = new Map([[first.position.nodeId, 0]]);
    const queue = [{ nodeId: first.position.nodeId, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (current.cost !== best.get(current.nodeId)) continue;
      if (current.nodeId === second.position.nodeId) return Math.max(0, Math.ceil(current.cost));
      for (const step of adjacency.get(current.nodeId) ?? []) {
        const nextCost = current.cost + step.weight;
        if (nextCost < (best.get(step.nodeId) ?? Number.POSITIVE_INFINITY)) {
          best.set(step.nodeId, nextCost);
          queue.push({ nodeId: step.nodeId, cost: nextCost });
        }
      }
    }
    return null;
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
      initiativeOrder: [],
      startedAt: nowIso(),
      endedAt: null
    };
    const provisional = createChaseSession(next);
    if (provisional.blueprintSnapshot?.settings?.chaseType === "race") {
      next.roundState.initiativeOrder = normalizeRaceInitiativeOrder(provisional, initiativeOrder);
    } else {
      next.roundState.initiativeOrder = initiativeOrder ? uniqueStrings(initiativeOrder) : getTurnPolicy(provisional).suggestedOrder;
    }
    next.events = [...(next.events ?? []), event("roundStarted", next, { round: next.round, initiativeOrder: next.roundState.initiativeOrder })];
    next.updatedAt = nowIso();
    let started = createChaseSession(next);

    // PF2e chase order: the quarry acts first in pursuit/escape rounds.
    // A steady-pace quarry therefore takes its abstract movement immediately
    // when the round begins, before pursuers can contribute.
    const policy = getTurnPolicy(started);
    if (policy.quarryFirst) {
      for (const quarry of roleGroups(started, "quarry")) {
        const current = getRuntimeGroup(started, quarry.id);
        if (!current || current.completed || current.rules.paceMode !== "steady") continue;
        started = applySteadyPaceTurn(started, current.id).session;
      }
    }
    return refreshActiveGroup(started, { preserveCurrent: false });
  }

  function currentObstacle(session, runtimeGroupId) {
    assertSession(session);
    const { group, node, card } = resolveCard(resolveCardRef, session, runtimeGroupId);
    return Object.freeze({
      runtimeGroupId,
      node: cloneData(node),
      card: cloneData(card),
      progress: group.position.progress,
      requiredPoints: effectiveObstaclePoints(card, group),
      cleared: isNodeCleared(session, node.id, runtimeGroupId),
      separated: group.participantIds.length === 1
    });
  }

  function pendingCheckBonus(session, runtimeGroupId, participantId = null) {
    assertSession(session);
    const group = getRuntimeGroup(session, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    const bonuses = pendingBonusesForGroup(group);
    const bonus = participantId
      ? bonuses.find(item => item?.participantId === participantId) ?? null
      : bonuses[0] ?? null;
    return cloneData(bonus);
  }

  function consumePendingCheckBonus(session, runtimeGroupId, participantId = null) {
    assertSession(session);
    const next = cloneData(session);
    const group = getRuntimeGroup(next, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    const bonuses = pendingBonusesForGroup(group).map(cloneData);
    const index = participantId
      ? bonuses.findIndex(item => item?.participantId === participantId)
      : (bonuses.length > 0 ? 0 : -1);
    const bonus = index >= 0 ? bonuses.splice(index, 1)[0] : null;
    setGroupPendingBonuses(group, bonuses);
    if (bonus) {
      next.events = [...(next.events ?? []), event("pendingCheckBonusConsumed", next, { runtimeGroupId, participantId: bonus.participantId ?? participantId ?? null, bonus })];
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
    const requiredPoints = effectiveObstaclePoints(card, group);
    const separatedSuccess = group.participantIds.length === 1 && ["success", "criticalSuccess"].includes(degree);

    let changed = updateGroupProgress(session, runtimeGroupId, delta);
    let next = changed.session;
    let nextGroup = getRuntimeGroup(next, runtimeGroupId);
    markRoundParticipant(next, participantId);
    const resolutionEvent = event("checkResolved", next, {
      runtimeGroupId,
      participantId,
      nodeId: node.id,
      cardId: card.id,
      approachId,
      degree,
      chasePointDelta: delta,
      progressBefore: changed.before,
      progressAfter: nextGroup.position.progress
    });
    next.events = [...(next.events ?? []), resolutionEvent];
    next = createChaseSession(next);

    const obstacleCleared = separatedSuccess || getRuntimeGroup(next, runtimeGroupId).position.progress >= requiredPoints;
    const routeResolutionDeferred = obstacleCleared && hasRouteConsequences(allConsequences);
    let routeChoiceRequired = false;
    let traversedEdgeIds = [];
    if (obstacleCleared) {
      const copy = cloneData(next);
      getRuntimeGroup(copy, runtimeGroupId).position.progress = requiredPoints;
      next = markNodeCleared(createChaseSession(copy), node.id, runtimeGroupId, requiredPoints);
      if (group.participantIds.length === 1 && degree === "criticalSuccess") next = setPendingSeparatedBonus(next, runtimeGroupId, participantId);
      if (!routeResolutionDeferred) {
        const route = advanceFromClearedCard(next, runtimeGroupId, routeEngine, { context });
        next = route.session;
        routeChoiceRequired = route.routeChoiceRequired;
        traversedEdgeIds = route.traversedEdgeIds;
      }
    }

    next = refreshActiveGroup(next);
    const currentGroup = getRuntimeGroup(next, runtimeGroupId);
    return Object.freeze({
      session: next,
      degree,
      chasePointDelta: delta,
      progressBefore: changed.before,
      progressAfter: currentGroup.position.progress,
      requiredPoints,
      obstacleCleared,
      routeResolutionDeferred,
      routeChoiceRequired,
      traversedEdgeIds: [...traversedEdgeIds],
      deferredConsequences: deferredConsequences(allConsequences),
      consequenceContext: Object.freeze({
        sourceEventId: resolutionEvent.id,
        runtimeGroupId,
        participantId,
        nodeId: node.id,
        cardId: card.id,
        approachId,
        degree
      }),
      consequenceOccurrences: consequenceOccurrences(allConsequences, {
        sourceEventId: resolutionEvent.id,
        runtimeGroupId,
        participantId,
        nodeId: node.id,
        cardId: card.id,
        approachId,
        degree
      }),
      pendingCheckBonus: pendingCheckBonus(next, runtimeGroupId, participantId)
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
    const pending = pendingCheckBonus(working, runtimeGroupId, participantId);
    let appliedPendingBonus = 0;
    if (pending) {
      const consumed = consumePendingCheckBonus(working, runtimeGroupId, participantId);
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

    const requiredPoints = effectiveObstaclePoints(card, group);
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
    next = refreshActiveGroup(next);
    return Object.freeze({ session: next, points: amount, obstacleCleared, routeChoiceRequired, traversedEdgeIds });
  }

  function skipParticipantTurn(session, { runtimeGroupId, participantId, allowNoObstacle = false, ignoreTurnOrder = false } = {}) {
    assertSession(session);
    assertActiveRound(session);
    const group = getRuntimeGroup(session, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    if (group.rules.paceMode !== "roll") throw rulesError("GROUP_USES_STEADY_PACE", `Runtime group '${runtimeGroupId}' uses steady pace.`);
    if (ignoreTurnOrder) {
      if (!participantId || !group.participantIds.includes(participantId)) {
        throw rulesError("PARTICIPANT_NOT_IN_GROUP", `Participant '${participantId ?? ""}' is not part of runtime group '${group.id}'.`, { runtimeGroupId: group.id, participantId });
      }
      if (session.roundState.actedParticipantIds.includes(participantId)) {
        throw rulesError("PARTICIPANT_ALREADY_ACTED", `Participant '${participantId}' already acted this round.`, { participantId, round: session.round });
      }
    } else assertParticipantTurn(session, group, participantId);

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
    next = refreshActiveGroup(createChaseSession(next));
    return Object.freeze({ session: next, penaltyApplied, chasePointDelta: penaltyApplied ? -1 : 0 });
  }

  function chooseRoute(session, { runtimeGroupId, edgeId, context = {} } = {}) {
    assertSession(session);
    const result = moveThroughChoice(session, runtimeGroupId, edgeId, routeEngine, { context });
    return Object.freeze({ ...result, session: refreshActiveGroup(result.session) });
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
      const requiredPoints = effectiveObstaclePoints(card, group);
      getRuntimeGroup(copy, runtimeGroupId).position.progress = requiredPoints;
      next = markNodeCleared(createChaseSession(copy), node.id, runtimeGroupId, requiredPoints);
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

  function applySteadyPaceTurn(session, runtimeGroupId, { edgeId = null, context = {} } = {}) {
    assertSession(session);
    let next = cloneData(session);
    let group = getRuntimeGroup(next, runtimeGroupId);
    if (!group) throw rulesError("UNKNOWN_RUNTIME_GROUP", `Unknown runtime group '${runtimeGroupId}'.`);
    if (group.rules.paceMode !== "steady") throw rulesError("GROUP_USES_ROLL_PACE", `Runtime group '${runtimeGroupId}' does not use steady pace.`);

    group.rules.steadyProgress += group.rules.obstaclesPerRound;
    next = createChaseSession(next);
    let advancedObstacles = 0;
    let routeChoiceRequired = false;
    const traversedEdgeIds = [];

    while (getRuntimeGroup(next, runtimeGroupId).rules.steadyProgress >= 1 && !getRuntimeGroup(next, runtimeGroupId).completed) {
      const advanced = advanceSteadyGroup(next, runtimeGroupId, { obstacles: 1, edgeId, context });
      traversedEdgeIds.push(...advanced.traversedEdgeIds);
      if (advanced.advancedObstacles === 0) {
        routeChoiceRequired = advanced.routeChoiceRequired;
        break;
      }
      const copy = cloneData(advanced.session);
      getRuntimeGroup(copy, runtimeGroupId).rules.steadyProgress = Math.max(0, getRuntimeGroup(copy, runtimeGroupId).rules.steadyProgress - 1);
      next = createChaseSession(copy);
      advancedObstacles += advanced.advancedObstacles;
      routeChoiceRequired = advanced.routeChoiceRequired;
      edgeId = null;
      if (routeChoiceRequired) break;
    }

    const copy = cloneData(next);
    copy.events = [...(copy.events ?? []), event("steadyPaceTurn", copy, { runtimeGroupId, advancedObstacles, traversedEdgeIds, routeChoiceRequired })];
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
      if (next.blueprintSnapshot?.settings?.chaseType === "race") {
        // A race has a strict participant-level initiative order. Auto-skipping must
        // follow that same order, otherwise the first group in storage could try to
        // skip ahead of the participant whose initiative turn is actually next.
        for (const participantId of next.roundState.initiativeOrder ?? []) {
          if (next.roundState.actedParticipantIds.includes(participantId)) continue;
          const current = next.groups.find(group => group.rules?.paceMode === "roll" && group.participantIds?.includes(participantId));
          if (!current || current.completed) continue;
          const result = skipParticipantTurn(next, { runtimeGroupId: current.id, participantId, allowNoObstacle: true, ignoreTurnOrder: true });
          next = result.session;
          skipped.push({ runtimeGroupId: current.id, participantId, penaltyApplied: result.penaltyApplied });
        }
      } else {
        for (const runtimeGroup of [...next.groups]) {
          const current = getRuntimeGroup(next, runtimeGroup.id);
          if (!current || current.completed || current.rules.paceMode !== "roll") continue;
          for (const participantId of current.participantIds) {
            if (next.roundState.actedParticipantIds.includes(participantId)) continue;
            const result = skipParticipantTurn(next, { runtimeGroupId: current.id, participantId, allowNoObstacle: true, ignoreTurnOrder: true });
            next = result.session;
            skipped.push({ runtimeGroupId: current.id, participantId, penaltyApplied: result.penaltyApplied });
          }
        }
      }
    }

    if (advanceSteady) {
      const quarryFirst = getTurnPolicy(next).quarryFirst;
      for (const runtimeGroup of [...next.groups]) {
        const current = getRuntimeGroup(next, runtimeGroup.id);
        if (!current || current.completed || current.rules.paceMode !== "steady") continue;
        // Quarry steady pace is already resolved at round start in pursuit/escape chases.
        if (quarryFirst && groupRole(next, current) === "quarry") continue;
        const choice = routeChoices[runtimeGroup.id] ?? routeChoices[runtimeGroup.groupId] ?? null;
        const advanced = applySteadyPaceTurn(next, runtimeGroup.id, { edgeId: choice, context });
        next = advanced.session;
        steadyAdvances.push({ runtimeGroupId: runtimeGroup.id, advancedObstacles: advanced.advancedObstacles, routeChoiceRequired: advanced.routeChoiceRequired });
      }
    }

    const copy = cloneData(next);
    copy.activeGroupId = null;
    copy.roundState.phase = "ended";
    copy.roundState.endedAt = nowIso();
    copy.events = [...(copy.events ?? []), event("roundEnded", copy, { round: copy.round, skipped, steadyAdvances })];
    copy.updatedAt = nowIso();
    next = createChaseSession(copy);

    const resolution = resolveRuntimeOutcomes(next, { phase: "endOfRound" });
    next = resolution.session;
    const outcome = resolution.evaluation;
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

  function inferPursuitRuntimeResolutions(session, { phase = "immediate" } = {}) {
    const type = session.blueprintSnapshot.settings.chaseType;
    if (!["pursuit", "escape"].includes(type)) return [];
    const quarry = roleGroups(session, "quarry");
    const pursuers = roleGroups(session, "pursuer").filter(group => !isGroupResolved(group));
    return quarry.map(quarryGroup => {
      const existing = quarryGroup.metadata?.runtimeResolution;
      if (existing?.terminal === true) return Object.freeze({ runtimeGroupId: quarryGroup.id, ...cloneData(existing) });
      if (quarryGroup.completed || isEndNode(session, quarryGroup.position.nodeId)) {
        return Object.freeze({ runtimeGroupId: quarryGroup.id, terminal: true, outcome: "escaped", reason: "escapeEndpoint", nodeId: quarryGroup.position.nodeId, round: session.round, catchingPursuerGroupIds: [] });
      }
      const catchingPursuers = pursuers.filter(group => group.position.nodeId === quarryGroup.position.nodeId);
      if (catchingPursuers.length > 0) {
        return Object.freeze({ runtimeGroupId: quarryGroup.id, terminal: true, outcome: "caught", reason: "samePosition", nodeId: quarryGroup.position.nodeId, round: session.round, catchingPursuerGroupIds: catchingPursuers.map(group => group.id) });
      }
      if (type === "escape" && phase === "startOfRound" && pursuers.length > 0) {
        const nearestLead = Math.min(...pursuers.map(pursuer => getObstacleLead(session, quarryGroup.id, pursuer.id)));
        if (nearestLead >= session.rules.escapeLead) {
          return Object.freeze({ runtimeGroupId: quarryGroup.id, terminal: true, outcome: "escaped", reason: "leadThreshold", nodeId: quarryGroup.position.nodeId, round: session.round, lead: nearestLead, threshold: session.rules.escapeLead, catchingPursuerGroupIds: [] });
        }
      }
      return Object.freeze({ runtimeGroupId: quarryGroup.id, terminal: false, outcome: null, reason: null, nodeId: quarryGroup.position.nodeId, round: session.round, catchingPursuerGroupIds: [] });
    });
  }

  function evaluatePursuitResolutions(session, resolutions) {
    if (resolutions.length === 0) return Object.freeze({ ended: false, outcome: null });
    const pending = resolutions.filter(item => !item.terminal);
    const terminal = resolutions.filter(item => item.terminal);
    if (pending.length > 0) {
      return Object.freeze({
        ended: false,
        outcome: null,
        details: cloneData({
          resolvedRuntimeGroupIds: terminal.map(item => item.runtimeGroupId),
          pendingRuntimeGroupIds: pending.map(item => item.runtimeGroupId),
          runtimeResolutions: terminal
        })
      });
    }

    const quarryById = new Map(roleGroups(session, "quarry").map(group => [group.id, group]));
    const pursuerById = new Map(roleGroups(session, "pursuer").map(group => [group.id, group]));
    const escaped = resolutions.filter(item => item.outcome === "escaped");
    const caught = resolutions.filter(item => item.outcome === "caught");
    const catchingIds = uniqueStrings(caught.flatMap(item => item.catchingPursuerGroupIds ?? []));
    const escapedGroups = escaped.map(item => quarryById.get(item.runtimeGroupId)).filter(Boolean);
    const caughtGroups = caught.map(item => quarryById.get(item.runtimeGroupId)).filter(Boolean);
    const catchingGroups = catchingIds.map(id => pursuerById.get(id)).filter(Boolean);
    const endingNodeId = resolutions.length === 1 ? resolutions[0].nodeId : null;
    const details = {
      runtimeResolutions: cloneData(resolutions),
      escapedRuntimeGroupIds: escaped.map(item => item.runtimeGroupId),
      caughtRuntimeGroupIds: caught.map(item => item.runtimeGroupId),
      mixedPursuitOutcome: escaped.length > 0 && caught.length > 0
    };

    if (caught.length === 0) {
      return makeEvaluation("quarryEscaped", {
        winners: escapedGroups,
        losers: roleGroups(session, "pursuer"),
        endingNodeId,
        reason: escaped.every(item => item.reason === "leadThreshold") ? "leadThreshold" : "escapeEndpoint",
        details
      });
    }
    if (escaped.length === 0) {
      return makeEvaluation("quarryCaught", {
        winners: catchingGroups,
        losers: caughtGroups,
        endingNodeId,
        reason: "samePosition",
        details
      });
    }
    return makeEvaluation("custom", {
      winners: [...escapedGroups, ...catchingGroups],
      losers: caughtGroups,
      endingNodeId: null,
      reason: "mixedPursuitOutcome",
      details
    });
  }

  function resolveRuntimeOutcomes(session, { phase = "immediate" } = {}) {
    assertSession(session);
    const type = session.blueprintSnapshot.settings.chaseType;
    if (!["pursuit", "escape"].includes(type)) return Object.freeze({ session, evaluation: evaluateOutcome(session, { phase }), changed: false });
    const resolutions = inferPursuitRuntimeResolutions(session, { phase });
    const newlyTerminal = resolutions.filter(item => item.terminal && !session.groups.find(group => group.id === item.runtimeGroupId)?.metadata?.runtimeResolution?.terminal);
    let next = session;
    if (newlyTerminal.length > 0) {
      const copy = cloneData(session);
      for (const resolution of newlyTerminal) {
        const group = copy.groups.find(item => item.id === resolution.runtimeGroupId);
        if (!group) continue;
        group.metadata = {
          ...(group.metadata ?? {}),
          runtimeResolution: {
            terminal: true,
            outcome: resolution.outcome,
            reason: resolution.reason,
            nodeId: resolution.nodeId,
            round: resolution.round,
            ...(Number.isFinite(resolution.lead) ? { lead: resolution.lead, threshold: resolution.threshold } : {}),
            catchingPursuerGroupIds: [...(resolution.catchingPursuerGroupIds ?? [])]
          }
        };
        copy.events = [...(copy.events ?? []), event("runtimeGroupResolved", copy, {
          runtimeGroupId: resolution.runtimeGroupId,
          outcome: resolution.outcome,
          reason: resolution.reason,
          nodeId: resolution.nodeId,
          catchingPursuerGroupIds: [...(resolution.catchingPursuerGroupIds ?? [])]
        })];
      }
      copy.updatedAt = nowIso();
      next = createChaseSession(copy);
    }
    const evaluation = evaluatePursuitResolutions(next, inferPursuitRuntimeResolutions(next, { phase }));
    return Object.freeze({ session: next, evaluation, changed: newlyTerminal.length > 0 });
  }

  function evaluateOutcome(session, { phase = "immediate" } = {}) {
    assertSession(session);
    const type = session.blueprintSnapshot.settings.chaseType;
    if (!CHASE_TYPES.includes(type)) return Object.freeze({ ended: false, outcome: null });

    const quarry = roleGroups(session, "quarry");
    const pursuers = roleGroups(session, "pursuer");
    const competitors = roleGroups(session, "competitor");

    if (["pursuit", "escape"].includes(type)) {
      return evaluatePursuitResolutions(session, inferPursuitRuntimeResolutions(session, { phase }));
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
      metadata: {
        reason: evaluation.reason,
        details: cloneData(evaluation.details ?? {}),
        ...(normalized.metadata?.campaign ? { campaign: cloneData(normalized.metadata.campaign) } : {})
      }
    });
    return Object.freeze({ session: normalized, result });
  }

  return Object.freeze({
    initializeSession,
    configureGroupPace,
    canSplitRuntimeGroup,
    splitRuntimeGroup,
    canMergeRuntimeGroups,
    mergeRuntimeGroups,
    canTransferParticipants,
    transferParticipants,
    setGroupOrderMode,
    selectActiveGroup,
    getGroupOrderState,
    getShortestRemainingDistance: shortestRemainingCardDistance,
    getShortestGroupDistance: shortestGroupDistance,
    beginRound,
    canGroupAct: runtimeGroupCanAct,
    canParticipantAct: participantCanAct,
    getRaceInitiativeEntries: session => raceInitiativeEntries(session).map(item => Object.freeze({ ...item })),
    getNextRaceParticipantId: nextRaceParticipantId,
    endRound,
    currentObstacle,
    resolveCheck,
    applyDegree,
    applyAutomaticContribution,
    skipParticipantTurn,
    chooseRoute,
    advanceSteadyGroup,
    applySteadyPaceTurn,
    pendingCheckBonus,
    consumePendingCheckBonus,
    getTurnPolicy,
    getObstacleIndex,
    getObstacleLead,
    resolveRuntimeOutcomes,
    evaluateOutcome,
    completeSession,
    recommendObstaclePoints,
    getChaseLengthGuideline,
    deriveStartPositions: deriveChaseStartPositions
  });
}
