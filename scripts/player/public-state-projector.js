import { createChasePublicState } from "../data/factories.js";
import { cloneData } from "../data/utils.js";

export const PLAYER_STATE_PROJECTOR_CONTRACT_VERSION = 1;

function resolveBlueprintGroup(session, runtimeGroup) {
  return session?.blueprintSnapshot?.groups?.find(group => group.id === runtimeGroup?.groupId) ?? null;
}

function resolveParticipant(session, participantId) {
  for (const group of session?.blueprintSnapshot?.groups ?? []) {
    const participant = group.participants?.find(candidate => candidate.id === participantId);
    if (participant) return participant;
  }
  return null;
}

function currentNode(session, runtimeGroup) {
  return session?.blueprintSnapshot?.graph?.nodes?.find(node => node.id === runtimeGroup?.position?.nodeId) ?? null;
}

function routeLabel(session, transition) {
  const edge = transition?.edge ?? transition;
  const target = transition?.target ?? session?.blueprintSnapshot?.graph?.nodes?.find(node => node.id === edge?.to) ?? null;
  return edge?.label || target?.label || target?.description || edge?.to || "";
}

function actorFromDocument(document) {
  if (!document) return null;
  if (document.actor) return document.actor;
  if (document.documentName === "Actor" || typeof document.getStatistic === "function") return document;
  return null;
}

export async function canUserControlParticipant(participant, user, { fromUuid = globalThis.fromUuid } = {}) {
  if (!participant || !user) return false;
  if (user.isGM === true) return true;
  if (participant.ownerUserIds?.includes?.(user.id)) return true;
  if (!participant.uuid || typeof fromUuid !== "function") return false;
  try {
    const document = await fromUuid(participant.uuid);
    const actor = actorFromDocument(document);
    if (!actor) return false;
    if (typeof actor.testUserPermission === "function") {
      try { if (actor.testUserPermission(user, "OWNER")) return true; } catch { /* continue */ }
    }
    const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    const ownership = actor.ownership ?? actor.permission ?? {};
    const level = Number(ownership?.[user.id] ?? ownership?.default ?? 0);
    if (level >= ownerLevel) return true;
    return user.character?.id && user.character.id === actor.id;
  } catch {
    return false;
  }
}

function resolveCard(api, session, cardRef) {
  const snapshot = session?.blueprintSnapshot?.contentSnapshots?.cards?.find(record => record.ref === cardRef)?.data ?? null;
  if (session?.blueprintSnapshot?.contentSnapshots?.mode === "snapshot" && snapshot) return cloneData(snapshot);
  return api?.cards?.get?.(cardRef, { includeDisabled: true }) ?? (snapshot ? cloneData(snapshot) : null);
}

async function resolveCardImage(api, session, card) {
  const image = card?.image ?? {};
  if (image.mode === "none") return null;
  if (image.path) return { path: image.path, alt: image.alt || card?.name || "" };
  const candidate = image.candidates?.find?.(entry => entry?.path);
  if (candidate?.path) return { path: candidate.path, alt: image.alt || card?.name || "" };
  if (!["provider", "automatic"].includes(image.mode)) return null;
  try {
    const options = image.providerId ? { providerIds: [image.providerId] } : {};
    const collected = await api?.images?.collectCandidates?.({
      cardId: card?.id,
      cardType: card?.type,
      tags: card?.tags ?? [],
      settings: cloneData(session?.blueprintSnapshot?.settings ?? {}),
      card: cloneData(card)
    }, options);
    const first = collected?.candidates?.[0] ?? null;
    return first?.path ? { path: first.path, alt: first.alt || image.alt || card?.name || "" } : null;
  } catch {
    return null;
  }
}

function storedGmDc(session, cardId, approachId) {
  const value = session?.metadata?.runner?.gmDcs?.[cardId]?.[approachId];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function safeApproach(approach, { ready = true } = {}) {
  return {
    id: approach.id,
    label: approach.label || approach.statistic || approach.id,
    description: approach.description || "",
    type: approach.type,
    statistic: approach.statistic,
    traits: [...(approach.traits ?? [])],
    ready
  };
}

function publicEvent(event) {
  const safeTypes = new Set([
    "roundStarted", "roundEnded", "routeMove", "obstacleCleared", "separatedCriticalBonus",
    "sessionStarted", "sessionPaused", "sessionResumed", "sessionCompleted", "sessionAborted"
  ]);
  if (!event || !safeTypes.has(event.type)) return null;
  return {
    id: event.id ?? null,
    type: event.type,
    round: Number(event.round ?? 0),
    timestamp: event.timestamp ?? null
  };
}

export async function projectChasePublicState(api, session, {
  user = globalThis.game?.user ?? null,
  fromUuid = globalThis.fromUuid
} = {}) {
  if (!session?.id) throw new TypeError("Public Chase state projection requires a Chase Session.");
  const activeRound = session.roundState?.phase === "active";
  const groups = [];
  const availableActions = [];
  const visibleRoutes = [];
  const ownedParticipantIds = new Set();

  for (const runtimeGroup of session.groups ?? []) {
    const definition = resolveBlueprintGroup(session, runtimeGroup);
    if (definition?.public === false) continue;
    const node = currentNode(session, runtimeGroup);
    let card = null;
    let image = null;
    let requiredPoints = null;
    if (node?.type === "card" && node.cardRef) {
      card = resolveCard(api, session, node.cardRef);
      image = card ? await resolveCardImage(api, session, card) : null;
      try { requiredPoints = api?.rules?.currentObstacle?.(session, runtimeGroup.id)?.requiredPoints ?? null; }
      catch { requiredPoints = card?.obstacle?.requiredPoints ?? null; }
    }

    const cleared = node?.type === "card" && session.nodeState?.[node.id]?.groups?.[runtimeGroup.id]?.cleared === true;
    const participants = [];
    for (const participantId of runtimeGroup.participantIds ?? []) {
      const participant = resolveParticipant(session, participantId) ?? { id: participantId, name: participantId };
      const owned = await canUserControlParticipant(participant, user, { fromUuid });
      if (owned) ownedParticipantIds.add(participantId);
      const acted = session.roundState?.actedParticipantIds?.includes?.(participantId) === true;
      participants.push({
        id: participant.id,
        name: participant.name || participant.id,
        image: participant.image ?? null,
        acted,
        skipped: session.roundState?.skippedParticipantIds?.includes?.(participantId) === true,
        controlled: owned
      });
      if (owned && activeRound && runtimeGroup.rules?.paceMode === "roll" && !runtimeGroup.completed && !acted && card && !cleared) {
        for (const approach of card.approaches ?? []) {
          if (!approach.statistic || approach.type !== "check") continue;
          const ready = (approach.dc?.mode ?? "gm") !== "gm" || storedGmDc(session, card.id, approach.id) !== null;
          if (!ready) continue;
          availableActions.push({
            type: "roll",
            runtimeGroupId: runtimeGroup.id,
            participantId,
            actorUuid: participant.uuid ?? participant.metadata?.actorUuid ?? null,
            approach: safeApproach(approach, { ready })
          });
        }
        availableActions.push({ type: "propose", runtimeGroupId: runtimeGroup.id, participantId });
      }
    }

    let transitions = [];
    try { transitions = api?.route?.availableTransitions?.(session, runtimeGroup.id) ?? []; } catch { transitions = []; }
    const routeChoiceAvailable = (node?.type === "choice" || cleared) && transitions.length > 0;
    const groupControlled = participants.some(participant => participant.controlled);
    const safeTransitions = routeChoiceAvailable ? transitions.map(transition => ({
      edgeId: transition.edge.id,
      runtimeGroupId: runtimeGroup.id,
      label: routeLabel(session, transition),
      description: transition.edge.description || transition.target?.description || "",
      type: transition.edge.type
    })) : [];
    if (groupControlled) {
      visibleRoutes.push(...safeTransitions);
      availableActions.push(...safeTransitions.map(route => ({ type: "route", ...route })));
    }

    let obstacleIndex = null;
    try { obstacleIndex = api?.rules?.getObstacleIndex?.(session, runtimeGroup.id) ?? null; } catch { obstacleIndex = null; }
    groups.push({
      runtimeGroupId: runtimeGroup.id,
      groupId: runtimeGroup.groupId,
      name: definition?.name || runtimeGroup.groupId,
      role: definition?.role || "participant",
      completed: runtimeGroup.completed === true,
      obstacleIndex,
      position: { nodeId: runtimeGroup.position?.nodeId ?? null, progress: Number(runtimeGroup.position?.progress ?? 0) },
      node: node ? { id: node.id, type: node.type, label: node.label || "", description: node.description || "" } : null,
      obstacle: card ? {
        id: card.id,
        name: card.name,
        description: card.description,
        image,
        progress: Number(runtimeGroup.position?.progress ?? 0),
        requiredPoints,
        approaches: (card.approaches ?? []).map(approach => safeApproach(approach, { ready: (approach.dc?.mode ?? "gm") !== "gm" || storedGmDc(session, card.id, approach.id) !== null }))
      } : null,
      participants,
      routeChoiceAvailable,
      routes: groupControlled ? safeTransitions : []
    });
  }

  const personalEffects = (session.consequenceState?.records ?? [])
    .filter(record => ownedParticipantIds.has(record.participantId) && ["applied", "manualFallback", "pendingConfirmation"].includes(record.status))
    .map(record => ({
      id: record.occurrenceId,
      consequenceId: record.consequenceId,
      status: record.status,
      message: record.message || ""
    }));

  const log = (session.events ?? []).slice(-12).map(publicEvent).filter(Boolean);
  const firstOwnedGroup = groups.find(group => group.participants.some(participant => participant.controlled)) ?? groups[0] ?? null;

  return createChasePublicState({
    sessionId: session.id,
    title: session.blueprintSnapshot?.name || "Chase",
    status: session.status,
    round: session.round,
    current: firstOwnedGroup ? {
      runtimeGroupId: firstOwnedGroup.runtimeGroupId,
      node: cloneData(firstOwnedGroup.node),
      obstacle: cloneData(firstOwnedGroup.obstacle)
    } : null,
    groups,
    visibleRoutes,
    availableActions,
    personalEffects,
    log,
    metadata: {
      roundPhase: session.roundState?.phase ?? "idle",
      timeOfDay: session.blueprintSnapshot?.settings?.timeOfDay ?? null,
      weather: cloneData(session.blueprintSnapshot?.settings?.weather ?? null),
      projectedForUserId: user?.id ?? null
    }
  });
}

export function createChasePublicStateProjector({ api = null, getApi = null, fromUuid = null } = {}) {
  const resolveApi = () => api ?? getApi?.() ?? null;
  return Object.freeze({
    contractVersion: PLAYER_STATE_PROJECTOR_CONTRACT_VERSION,
    async project(session, options = {}) {
      const chaseApi = resolveApi();
      if (!chaseApi) throw new Error("Chase Forge API is unavailable for public-state projection.");
      return projectChasePublicState(chaseApi, session, { fromUuid: fromUuid ?? globalThis.fromUuid, ...options });
    }
  });
}
