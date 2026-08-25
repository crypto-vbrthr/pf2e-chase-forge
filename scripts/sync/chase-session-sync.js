import { MODULE_ID } from "../core/constants.js";
import { cloneData, createId } from "../data/utils.js";
import { createChasePublicStateProjector, canUserControlParticipant } from "../player/public-state-projector.js";

export const CHASE_SESSION_SYNC_CONTRACT_VERSION = 1;
export const CHASE_SOCKET_CHANNEL = `module.${MODULE_ID}`;

function usersArray() {
  const users = globalThis.game?.users;
  if (!users) return [];
  if (Array.isArray(users)) return users;
  if (Array.isArray(users.contents)) return [...users.contents];
  if (typeof users.values === "function") return [...users.values()];
  if (typeof users[Symbol.iterator] === "function") return [...users];
  return [];
}

function userById(id) {
  const users = globalThis.game?.users;
  if (users?.get) return users.get(id) ?? null;
  return usersArray().find(user => user.id === id) ?? null;
}

function activeGms() {
  return usersArray()
    .filter(user => user?.isGM === true && user?.active !== false)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function authorityGmId() {
  return activeGms()[0]?.id ?? null;
}

function resolveParticipant(session, participantId) {
  for (const group of session?.blueprintSnapshot?.groups ?? []) {
    const participant = group.participants?.find(candidate => candidate.id === participantId);
    if (participant) return participant;
  }
  return null;
}

function storedGmDc(session, cardId, approachId) {
  const value = session?.metadata?.runner?.gmDcs?.[cardId]?.[approachId];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function rollResultPayload(result) {
  return {
    degree: result?.degree ?? null,
    effectiveTotal: result?.effectiveTotal ?? null,
    chasePointDelta: result?.chasePointDelta ?? 0,
    obstacleCleared: result?.obstacleCleared === true
  };
}

function escapeHtml(text) {
  if (typeof globalThis.foundry?.utils?.escapeHTML === "function") return globalThis.foundry.utils.escapeHTML(String(text ?? ""));
  return String(text ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

async function saveOrFinish(api, session, { phase = "immediate" } = {}) {
  const evaluation = api.rules.evaluateOutcome(session, { phase });
  if (!evaluation.ended) return { session: await api.sessionManager.saveSession(session), outcome: evaluation, completed: null };
  await api.sessionManager.saveSession(session);
  const completed = await api.sessionManager.finishSession(session.id, evaluation);
  return { session: completed.session, outcome: evaluation, completed };
}

async function applyConsequences(api, result) {
  if ((result?.consequenceOccurrences ?? []).length === 0) return result.session;
  const consequenceResult = await api.consequences.executeRulesResult(result, { autoConfirm: false });
  return consequenceResult?.session ?? result.session;
}

export function createChaseSessionSyncService({
  getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null,
  playerUi = null,
  socket = null,
  projector = null
} = {}) {
  let started = false;
  let socketRef = socket;
  let handler = null;
  const ackWaiters = new Map();
  const diagnostics = {
    startAttempts: 0,
    startedAt: null,
    lastStartFailureAt: null,
    sentStates: 0,
    receivedStates: 0,
    receivedAcks: 0,
    lastSentStateAt: null,
    lastReceivedStateAt: null,
    lastAckAt: null,
    lastError: null
  };
  const getSocket = () => socketRef ?? globalThis.game?.socket ?? null;
  const getProjector = () => projector ?? createChasePublicStateProjector({ getApi });

  function syncStatus() {
    return {
      contractVersion: CHASE_SESSION_SYNC_CONTRACT_VERSION,
      channel: CHASE_SOCKET_CHANNEL,
      started,
      socketAvailable: Boolean(getSocket()?.on && getSocket()?.emit),
      currentUserId: globalThis.game?.user?.id ?? null,
      currentUserIsGM: globalThis.game?.user?.isGM === true,
      authorityGmId: authorityGmId(),
      users: usersArray().map(user => ({ id: user?.id ?? null, name: user?.name ?? null, isGM: user?.isGM === true, active: user?.active !== false })),
      ...cloneData(diagnostics)
    };
  }

  async function emit(payload) {
    const activeSocket = getSocket();
    if (!activeSocket?.emit) throw new Error("Foundry game.socket is unavailable for Chase synchronization.");
    return activeSocket.emit(CHASE_SOCKET_CHANNEL, payload);
  }

  function waitForAck(deliveryId, timeoutMs) {
    if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) return Promise.resolve(null);
    return new Promise(resolve => {
      const timer = globalThis.setTimeout?.(() => {
        ackWaiters.delete(deliveryId);
        resolve(null);
      }, Number(timeoutMs));
      ackWaiters.set(deliveryId, ack => {
        if (timer) globalThis.clearTimeout?.(timer);
        ackWaiters.delete(deliveryId);
        resolve(ack);
      });
    });
  }

  async function sendStateToUser(session, user, { open = true, waitForAckMs = 0 } = {}) {
    if (!user?.id) throw new Error("Cannot send Chase player state without a target user id.");
    const state = await getProjector().project(session, { user });
    const deliveryId = createId("chase-state");
    const ackPromise = waitForAck(deliveryId, waitForAckMs);
    await emit({ type: "state", deliveryId, toUserId: user.id, fromUserId: globalThis.game?.user?.id ?? null, open, state });
    diagnostics.sentStates += 1;
    diagnostics.lastSentStateAt = new Date().toISOString();
    const ack = await ackPromise;
    return { state, deliveryId, ack };
  }

  async function publishSession(session, { open = true, includeInactive = false, waitForAckMs = 0 } = {}) {
    if (globalThis.game?.user?.isGM !== true) return { sent: 0, confirmed: 0, failed: 0, states: [], deliveries: [] };
    const targets = usersArray().filter(user => user?.isGM !== true && (includeInactive || user?.active !== false));
    const states = [];
    const deliveries = [];
    for (const user of targets) {
      try {
        const delivery = await sendStateToUser(session, user, { open, waitForAckMs });
        states.push(delivery.state);
        deliveries.push({ userId: user.id, deliveryId: delivery.deliveryId, ack: delivery.ack });
      } catch (error) {
        diagnostics.lastError = error?.message ?? String(error);
        console.warn(`${MODULE_ID} | Failed to publish Chase player state to '${user?.id ?? "unknown"}'.`, error);
        deliveries.push({ userId: user?.id ?? null, deliveryId: null, ack: { ok: false, message: diagnostics.lastError } });
      }
    }
    const confirmed = deliveries.filter(item => item.ack?.ok === true).length;
    const failed = deliveries.filter(item => item.ack?.ok === false).length;
    return { sent: states.length, confirmed, failed, states, deliveries };
  }

  async function refreshGmRunner(sessionId) {
    const api = getApi();
    const app = api?.ui?.getOpenRunner?.(sessionId) ?? null;
    try { await app?.render?.({ force: true }); } catch { /* non-fatal */ }
  }

  async function respond(toUserId, { intentId = null, ok = true, message = "", session = null, sessionId = null } = {}) {
    await emit({
      type: "intentResult",
      toUserId,
      fromUserId: globalThis.game?.user?.id ?? null,
      intentId,
      ok,
      message,
      sessionId: session?.id ?? sessionId ?? null
    });
    if (session) await sendStateToUser(session, userById(toUserId), { open: true });
  }

  async function authorizeParticipant(session, participantId, user) {
    const participant = resolveParticipant(session, participantId);
    if (!participant) throw new Error("Der Beteiligte gehört nicht zu dieser Verfolgungsjagd.");
    const allowed = await canUserControlParticipant(participant, user);
    if (!allowed) throw new Error("Du darfst diesen Beteiligten nicht für die Verfolgungsjagd steuern.");
    return participant;
  }

  async function handleRollIntent(api, message, sender, session) {
    const { runtimeGroupId, participantId, approachId, total, natural = null } = message.payload ?? {};
    const participant = await authorizeParticipant(session, participantId, sender);
    if (!Number.isFinite(Number(total))) throw new Error("Das Wurfergebnis ist ungültig.");
    const obstacle = api.rules.currentObstacle(session, runtimeGroupId);
    if (!obstacle?.card) throw new Error("Die Gruppe befindet sich an keinem würfelbaren Hindernis.");
    const approach = obstacle.card.approaches.find(item => item.id === approachId) ?? null;
    if (!approach?.statistic) throw new Error("Diese Vorgehensweise besitzt keine würfelbare PF2e-Fertigkeit.");
    const gmDc = storedGmDc(session, obstacle.card.id, approachId);
    const dc = api.pf2e.dc.resolveApproach(approach, { partyLevel: session.blueprintSnapshot.settings.partyLevel, gmDc });
    if (!Number.isFinite(Number(dc.value))) throw new Error("Die Spielleitung muss für diese Probe zuerst einen SG festlegen.");
    const result = api.rules.resolveCheck(session, {
      runtimeGroupId, participantId, approachId,
      total: Number(total),
      natural: Number.isFinite(Number(natural)) ? Number(natural) : null,
      gmDc
    });
    const consequenceSession = await applyConsequences(api, result);
    const persisted = await saveOrFinish(api, consequenceSession);
    await api.presentation?.chat?.postRollResult?.({
      sessionId: persisted.session.id,
      participantName: participant.name,
      approachLabel: approach.label,
      result: { ...result, ...rollResultPayload(result) }
    }).catch(() => null);
    return persisted.session;
  }

  async function handleRouteIntent(api, message, sender, session) {
    const { runtimeGroupId, edgeId } = message.payload ?? {};
    const runtimeGroup = session.groups.find(group => group.id === runtimeGroupId) ?? null;
    if (!runtimeGroup) throw new Error("Die gewählte Gruppe existiert nicht.");
    let allowed = false;
    for (const participantId of runtimeGroup.participantIds ?? []) {
      const participant = resolveParticipant(session, participantId);
      if (await canUserControlParticipant(participant, sender)) { allowed = true; break; }
    }
    if (!allowed) throw new Error("Du darfst für diese Gruppe keine Route auswählen.");
    const result = api.rules.chooseRoute(session, { runtimeGroupId, edgeId });
    return (await saveOrFinish(api, result.session)).session;
  }

  async function handleProposalIntent(api, message, sender, session) {
    const { participantId, text } = message.payload ?? {};
    const participant = await authorizeParticipant(session, participantId, sender);
    const cleanText = String(text ?? "").trim().slice(0, 1000);
    if (!cleanText) throw new Error("Der Handlungsvorschlag ist leer.");
    if (globalThis.ChatMessage?.create) {
      const gmIds = activeGms().map(user => user.id);
      await globalThis.ChatMessage.create({
        whisper: gmIds,
        speaker: globalThis.ChatMessage.getSpeaker?.({ actor: null }) ?? undefined,
        content: `<div class="pf2e-chase-forge-chat"><h3>💡 ${escapeHtml(participant.name || sender.name || "Spieler")}</h3><p>${escapeHtml(cleanText)}</p></div>`,
        flags: { [MODULE_ID]: { type: "playerProposal", sessionId: session.id, participantId, userId: sender.id } }
      });
    }
    return session;
  }

  async function handleIntent(message) {
    if (globalThis.game?.user?.isGM !== true) return;
    if (message.toUserId && message.toUserId !== globalThis.game.user.id) return;
    if (authorityGmId() && authorityGmId() !== globalThis.game.user.id) return;
    const api = getApi();
    const sender = userById(message.fromUserId);
    if (!api || !sender || sender.isGM) return;
    const session = await api.sessionManager.getSession(message.sessionId);
    if (!session) return respond(sender.id, { intentId: message.intentId, ok: false, message: "Die Verfolgungsjagd ist nicht mehr verfügbar.", sessionId: message.sessionId });

    try {
      let next = session;
      if (message.intent === "roll") next = await handleRollIntent(api, message, sender, session);
      else if (message.intent === "route") next = await handleRouteIntent(api, message, sender, session);
      else if (message.intent === "propose") next = await handleProposalIntent(api, message, sender, session);
      else if (message.intent === "requestState") next = session;
      else throw new Error("Unbekannte Chase-Aktion.");
      await respond(sender.id, { intentId: message.intentId, ok: true, session: next });
      if (message.intent !== "requestState") {
        await publishSession(next, { open: true });
        await refreshGmRunner(next.id);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Player Chase intent rejected.`, error);
      await respond(sender.id, { intentId: message.intentId, ok: false, message: error?.message ?? String(error), sessionId: message.sessionId });
    }
  }

  async function onMessage(message) {
    if (!message || typeof message !== "object") return;
    const currentUserId = globalThis.game?.user?.id ?? null;
    if (message.type === "state") {
      if (message.toUserId !== currentUserId || globalThis.game?.user?.isGM === true) return;
      diagnostics.receivedStates += 1;
      diagnostics.lastReceivedStateAt = new Date().toISOString();
      let ok = true;
      let errorMessage = "";
      try {
        await playerUi?.receiveState?.(cloneData(message.state), { open: message.open !== false });
      } catch (error) {
        ok = false;
        errorMessage = error?.message ?? String(error);
        diagnostics.lastError = errorMessage;
        console.error(`${MODULE_ID} | Failed to open/update Chase Player View.`, error);
      }
      if (message.deliveryId && message.fromUserId) {
        try {
          await emit({ type: "stateAck", deliveryId: message.deliveryId, sessionId: message.state?.sessionId ?? null, toUserId: message.fromUserId, fromUserId: currentUserId, ok, message: errorMessage });
        } catch (error) {
          console.warn(`${MODULE_ID} | Failed to acknowledge Chase Player View delivery.`, error);
        }
      }
      return;
    }
    if (message.type === "stateAck") {
      if (message.toUserId !== currentUserId || globalThis.game?.user?.isGM !== true) return;
      diagnostics.receivedAcks += 1;
      diagnostics.lastAckAt = new Date().toISOString();
      ackWaiters.get(message.deliveryId)?.(cloneData(message));
      return;
    }
    if (message.type === "playerReady") {
      if (globalThis.game?.user?.isGM !== true) return;
      if (message.toUserId && message.toUserId !== currentUserId) return;
      if (authorityGmId() && authorityGmId() !== currentUserId) return;
      const user = userById(message.fromUserId);
      if (!user || user.isGM) return;
      const api = getApi();
      const active = await api?.sessionManager?.listSessions?.({ status: "active" }) ?? [];
      const paused = await api?.sessionManager?.listSessions?.({ status: "paused" }) ?? [];
      for (const session of [...active, ...paused]) await sendStateToUser(session, user, { open: true });
      return;
    }
    if (message.type === "intentResult") {
      if (message.toUserId !== currentUserId || globalThis.game?.user?.isGM === true) return;
      playerUi?.receiveIntentResult?.(cloneData(message));
      return;
    }
    if (message.type === "intent") await handleIntent(message);
  }

  return Object.freeze({
    contractVersion: CHASE_SESSION_SYNC_CONTRACT_VERSION,
    channel: CHASE_SOCKET_CHANNEL,
    authorityGmId,
    start() {
      diagnostics.startAttempts += 1;
      if (started) return true;
      const activeSocket = getSocket();
      if (!activeSocket?.on) {
        diagnostics.lastStartFailureAt = new Date().toISOString();
        diagnostics.lastError = "Foundry game.socket is unavailable.";
        return false;
      }
      handler = message => { Promise.resolve(onMessage(message)).catch(error => {
        diagnostics.lastError = error?.message ?? String(error);
        console.error(`${MODULE_ID} | Chase socket handler failed.`, error);
      }); };
      activeSocket.on(CHASE_SOCKET_CHANNEL, handler);
      socketRef = activeSocket;
      started = true;
      diagnostics.startedAt = new Date().toISOString();
      diagnostics.lastError = null;
      return true;
    },
    stop() {
      if (!started) return false;
      getSocket()?.off?.(CHASE_SOCKET_CHANNEL, handler);
      handler = null;
      started = false;
      return true;
    },
    isStarted: () => started,
    status: syncStatus,
    publishSession,
    async announcePlayerReady() {
      if (globalThis.game?.user?.isGM === true) return false;
      const gmId = authorityGmId();
      if (!gmId) return false;
      await emit({ type: "playerReady", fromUserId: globalThis.game?.user?.id ?? null, toUserId: gmId });
      return true;
    },
    async publishActiveSessions() {
      if (globalThis.game?.user?.isGM !== true) return { sent: 0 };
      const api = getApi();
      const active = await api?.sessionManager?.listSessions?.({ status: "active" }) ?? [];
      const paused = await api?.sessionManager?.listSessions?.({ status: "paused" }) ?? [];
      const sessions = [...active, ...paused];
      let sent = 0;
      for (const session of sessions) sent += (await publishSession(session, { open: true })).sent;
      return { sent, sessions: sessions.length };
    },
    async sendIntent(intent, { sessionId, payload = {} } = {}) {
      if (globalThis.game?.user?.isGM === true) throw new Error("Player Chase intents are only sent by player clients.");
      const gmId = authorityGmId();
      if (!gmId) throw new Error("Keine aktive Spielleitung ist für die Verfolgungsjagd verfügbar.");
      const message = {
        type: "intent",
        intent,
        intentId: createId("chase-intent"),
        sessionId,
        payload: cloneData(payload),
        fromUserId: globalThis.game?.user?.id ?? null,
        toUserId: gmId
      };
      await emit(message);
      return message.intentId;
    },
    requestState(sessionId) { return this.sendIntent("requestState", { sessionId }); },
    _onMessage: onMessage,
    _handleIntent: handleIntent
  });
}
