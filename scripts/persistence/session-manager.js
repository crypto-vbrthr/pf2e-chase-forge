import { cloneData } from "../data/utils.js";
import { createChaseReference } from "./references.js";

export const CHASE_LIFECYCLE_HOOKS = Object.freeze({
  created: "pf2eChaseForge.sessionCreated",
  started: "pf2eChaseForge.sessionStarted",
  paused: "pf2eChaseForge.sessionPaused",
  resumed: "pf2eChaseForge.sessionResumed",
  completed: "pf2eChaseForge.sessionCompleted",
  aborted: "pf2eChaseForge.sessionAborted",
  deleted: "pf2eChaseForge.sessionDeleted"
});

function lifecyclePayload(session, { result = null, deleted = false } = {}) {
  const campaign = cloneData(session?.metadata?.campaign ?? result?.metadata?.campaign ?? null);
  return Object.freeze({
    schema: "pf2e-chase-forge/session-lifecycle",
    version: 1,
    sessionId: session?.id ?? result?.sessionId ?? null,
    sessionReference: session?.id ? createChaseReference("session", session.id) : null,
    blueprintId: session?.blueprintId ?? result?.blueprintId ?? null,
    status: deleted ? "deleted" : session?.status ?? null,
    outcome: result?.outcome ?? (session?.status === "aborted" ? "aborted" : null),
    terminal: session?.status === "completed" || session?.status === "aborted" || deleted,
    chaseName: session?.blueprintSnapshot?.name ?? null,
    campaign,
    session: session ? Object.freeze({
      id: session.id,
      blueprintId: session.blueprintId ?? null,
      status: session.status ?? null,
      round: session.round ?? 0,
      startedAt: session.startedAt ?? null,
      pausedAt: session.pausedAt ?? null,
      endedAt: session.endedAt ?? null
    }) : null,
    result: result ? Object.freeze({
      id: result.id,
      sessionId: result.sessionId,
      blueprintId: result.blueprintId ?? null,
      outcome: result.outcome ?? null,
      endingNodeId: result.endingNodeId ?? null,
      winnerGroupIds: cloneData(result.winnerGroupIds ?? []),
      loserGroupIds: cloneData(result.loserGroupIds ?? []),
      rounds: result.rounds ?? 0,
      endedAt: result.endedAt ?? null
    }) : null,
    resultReference: result?.id ? createChaseReference("result", result.id) : null
  });
}

export function createChaseSessionManager(persistence, { emit = null } = {}) {
  if (!persistence?.sessions) throw new TypeError("ChaseSessionManager requires a persistence service.");
  const announce = (hook, payload) => {
    try { emit?.(hook, payload); }
    catch (error) { console.warn("pf2e-chase-forge | Chase lifecycle hook emission failed.", error); }
  };

  async function createSession(...args) {
    const session = await persistence.sessions.createFromBlueprint(...args);
    announce(CHASE_LIFECYCLE_HOOKS.created, lifecyclePayload(session));
    return session;
  }

  async function startSession(...args) {
    const session = await persistence.sessions.start(...args);
    announce(CHASE_LIFECYCLE_HOOKS.started, lifecyclePayload(session));
    return session;
  }

  async function pauseSession(...args) {
    const session = await persistence.sessions.pause(...args);
    announce(CHASE_LIFECYCLE_HOOKS.paused, lifecyclePayload(session));
    return session;
  }

  async function resumeSession(...args) {
    const session = await persistence.sessions.resume(...args);
    announce(CHASE_LIFECYCLE_HOOKS.resumed, lifecyclePayload(session));
    return session;
  }

  async function finishSession(...args) {
    const completed = await persistence.sessions.finish(...args);
    announce(CHASE_LIFECYCLE_HOOKS.completed, lifecyclePayload(completed.session, { result: completed.result }));
    return completed;
  }

  async function abortSession(...args) {
    const session = await persistence.sessions.abort(...args);
    announce(CHASE_LIFECYCLE_HOOKS.aborted, lifecyclePayload(session));
    return session;
  }

  async function deleteSession(idOrRef) {
    const session = await persistence.sessions.get(idOrRef);
    const deleted = await persistence.sessions.delete(idOrRef);
    if (deleted) announce(CHASE_LIFECYCLE_HOOKS.deleted, lifecyclePayload(session, { deleted: true }));
    return deleted;
  }

  return Object.freeze({
    hooks: CHASE_LIFECYCLE_HOOKS,
    createSession,
    startSession,
    pauseSession,
    resumeSession,
    saveSession: persistence.sessions.save,
    finishSession,
    abortSession,
    deleteSession,
    getSession: persistence.sessions.get,
    listSessions: persistence.sessions.list,
    getActiveSessions: () => persistence.sessions.list({ status: "active" })
  });
}
