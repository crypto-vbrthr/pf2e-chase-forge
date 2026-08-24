export function createChaseSessionManager(persistence) {
  if (!persistence?.sessions) throw new TypeError("ChaseSessionManager requires a persistence service.");
  return Object.freeze({
    createSession: persistence.sessions.createFromBlueprint,
    startSession: persistence.sessions.start,
    pauseSession: persistence.sessions.pause,
    resumeSession: persistence.sessions.resume,
    saveSession: persistence.sessions.save,
    finishSession: persistence.sessions.finish,
    abortSession: persistence.sessions.abort,
    deleteSession: persistence.sessions.delete,
    getSession: persistence.sessions.get,
    listSessions: persistence.sessions.list,
    getActiveSessions: () => persistence.sessions.list({ status: "active" })
  });
}
