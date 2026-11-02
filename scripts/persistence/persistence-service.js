import { BLUEPRINT_TRANSFER, MODULE_VERSION, SCHEMA_VERSIONS, SESSION_STATUSES } from "../core/constants.js";
import { ChasePersistenceError } from "../core/errors.js";
import { createChaseBlueprint, createChaseResult, createChaseSession } from "../data/factories.js";
import { cloneData, createId, nowIso } from "../data/utils.js";
import { validateChaseBlueprint, validateChaseResult, validateChaseSession } from "../data/validators.js";
import { createChaseReference, parseChaseReference } from "./references.js";
import { inspectBlueprintReferences } from "./diagnostics.js";
import { snapshotBlueprintContent, useLiveBlueprintContent } from "./snapshots.js";
import { createMemoryChaseStore } from "./memory-store.js";
import { normalizePersistenceState, validatePersistenceState } from "./state.js";
import { listBlueprintMedia, makePortableBlueprint, remapBlueprintMedia } from "./blueprint-transfer.js";

function persistenceError(code, message, details = null) {
  return new ChasePersistenceError(message, { code, details });
}

function assertValid(value, validator, code) {
  const result = validator(value);
  if (!result.valid) throw persistenceError(code, "Invalid Chase Forge persistence record.", result.errors);
}

function parseEnvelope(input) {
  let value = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); }
    catch (error) { throw persistenceError("IMPORT_JSON_INVALID", "Blueprint import is not valid JSON.", { message: error.message }); }
  }
  if (value?.format && value.format !== BLUEPRINT_TRANSFER.FORMAT) throw persistenceError("IMPORT_FORMAT_UNKNOWN", "Unknown JSON transfer format.");
  if (value?.format === BLUEPRINT_TRANSFER.FORMAT) {
    if (Number(value.version) !== BLUEPRINT_TRANSFER.VERSION) throw persistenceError("IMPORT_FORMAT_VERSION", "Unsupported Chase Blueprint transfer version.", { version: value.version });
    value = value.blueprint;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.graph || !Array.isArray(value.graph.nodes) || !Array.isArray(value.graph.edges)) {
    throw persistenceError("IMPORT_BLUEPRINT_MISSING", "JSON does not contain a Chase Blueprint.");
  }
  return value;
}

export function createChasePersistenceService({ store = createMemoryChaseStore(), routeEngine, rulesEngine, registries = null } = {}) {
  let initialized = false;
  let queue = Promise.resolve();

  async function initialize() {
    if (!initialized) { await store.initialize(); initialized = true; }
    return status();
  }

  async function read() {
    if (!initialized) await initialize();
    const state = normalizePersistenceState(await store.load());
    const validation = validatePersistenceState(state);
    if (!validation.valid) throw persistenceError("INVALID_PERSISTENCE_STATE", "Loaded Chase Forge persistence state is invalid.", validation.errors);
    return validation.state;
  }

  async function transact(mutator) {
    const operation = async () => {
      const maxAttempts = 4;
      let lastConflict = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const state = await read();
        const draft = cloneData(state);
        const result = await mutator(draft);
        const writeToken = createId("write");
        draft.revision = state.revision + 1;
        draft.updatedAt = nowIso();
        draft.metadata ??= {};
        draft.metadata.persistence = {
          ...(draft.metadata.persistence ?? {}),
          lastWriteToken: writeToken,
          lastWriterUserId: globalThis.game?.user?.id ?? null,
          lastWriteAt: draft.updatedAt
        };
        const validation = validatePersistenceState(draft);
        if (!validation.valid) throw persistenceError("INVALID_PERSISTENCE_STATE", "Refusing to persist invalid Chase Forge state.", validation.errors);
        try {
          await store.save(validation.state, { expectedRevision: state.revision, writeToken });
          return cloneData(result);
        } catch (error) {
          if (error?.code !== "PERSISTENCE_REVISION_CONFLICT" || attempt >= maxAttempts) throw error;
          lastConflict = error;
        }
      }
      throw lastConflict ?? persistenceError("PERSISTENCE_REVISION_CONFLICT", "Chase Forge persistence changed while the transaction was being saved.");
    };
    const pending = queue.then(operation, operation);
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  function status() { return Object.freeze({ initialized, ...(store.getStatus?.() ?? {}) }); }

  async function listBlueprints() { return cloneData((await read()).blueprints); }
  async function getBlueprint(idOrRef) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "blueprint" ? parsed.id : String(idOrRef ?? "");
    return cloneData((await read()).blueprints.find(item => item.id === id) ?? null);
  }
  async function createBlueprint(input, { snapshotContent = false } = {}) {
    let blueprint = createChaseBlueprint({ ...cloneData(input), id: input?.id || createId("blueprint"), createdAt: input?.createdAt ?? nowIso(), updatedAt: nowIso() });
    if (snapshotContent) blueprint = snapshotBlueprintContent(blueprint, { registries });
    assertValid(blueprint, validateChaseBlueprint, "INVALID_BLUEPRINT");
    return transact(state => {
      if (state.blueprints.some(item => item.id === blueprint.id)) throw persistenceError("BLUEPRINT_EXISTS", `Blueprint '${blueprint.id}' already exists.`);
      state.blueprints.push(blueprint);
      return blueprint;
    });
  }
  async function saveBlueprint(input, { createIfMissing = false } = {}) {
    const blueprint = createChaseBlueprint({ ...cloneData(input), updatedAt: nowIso() });
    assertValid(blueprint, validateChaseBlueprint, "INVALID_BLUEPRINT");
    return transact(state => {
      const index = state.blueprints.findIndex(item => item.id === blueprint.id);
      if (index < 0 && !createIfMissing) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${blueprint.id}' does not exist.`);
      if (index < 0) state.blueprints.push(blueprint); else state.blueprints[index] = blueprint;
      return blueprint;
    });
  }
  async function duplicateBlueprint(idOrRef, { name = null } = {}) {
    const source = await getBlueprint(idOrRef);
    if (!source) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrRef}' does not exist.`);
    const copy = createChaseBlueprint({ ...source, id: createId("blueprint"), name: name ?? `${source.name} Copy`, createdAt: nowIso(), updatedAt: nowIso(), metadata: { ...source.metadata, duplicatedFrom: source.id } });
    return createBlueprint(copy);
  }
  async function deleteBlueprint(idOrRef) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "blueprint" ? parsed.id : String(idOrRef ?? "");
    return transact(state => {
      const index = state.blueprints.findIndex(item => item.id === id);
      if (index < 0) return false;
      state.blueprints.splice(index, 1);
      return true;
    });
  }
  async function freezeBlueprintContent(idOrRef, { allowPartial = false } = {}) {
    const blueprint = await getBlueprint(idOrRef);
    if (!blueprint) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrRef}' does not exist.`);
    const frozen = snapshotBlueprintContent(blueprint, { registries });
    const requiredRefs = [...new Set((blueprint.graph?.nodes ?? []).filter(node => node?.type === "card" && node.cardRef).map(node => node.cardRef))];
    const capturedRefs = new Set(frozen.contentSnapshots?.cards?.map(record => record.ref) ?? []);
    const missingRefs = requiredRefs.filter(ref => !capturedRefs.has(ref));
    if (missingRefs.length > 0 && !allowPartial) {
      throw persistenceError("SNAPSHOT_CONTENT_MISSING", "Cannot freeze Blueprint content because one or more Chase Cards are unavailable.", { missingRefs });
    }
    return saveBlueprint(frozen);
  }
  async function useLiveContent(idOrRef, options = {}) {
    const blueprint = await getBlueprint(idOrRef);
    if (!blueprint) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrRef}' does not exist.`);
    return saveBlueprint(useLiveBlueprintContent(blueprint, options));
  }
  async function inspectReferences(idOrBlueprint, options = {}) {
    const blueprint = typeof idOrBlueprint === "string" ? await getBlueprint(idOrBlueprint) : createChaseBlueprint(idOrBlueprint);
    if (!blueprint) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrBlueprint}' does not exist.`);
    return inspectBlueprintReferences(blueprint, { registries, ...options });
  }
  async function exportBlueprint(idOrBlueprint, { pretty = true, snapshotCards = false } = {}) {
    const original = typeof idOrBlueprint === "string" ? await getBlueprint(idOrBlueprint) : createChaseBlueprint(idOrBlueprint);
    if (!original) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrBlueprint}' does not exist.`);
    const { blueprint, missingCardRefs } = snapshotCards
      ? makePortableBlueprint(original, { registries })
      : { blueprint: original, missingCardRefs: [] };
    const validation = validateChaseBlueprint(blueprint);
    if (!validation.valid) throw persistenceError("INVALID_BLUEPRINT", "Cannot export an invalid Chase Blueprint.", validation.errors);
    const envelope = {
      format: BLUEPRINT_TRANSFER.FORMAT,
      version: BLUEPRINT_TRANSFER.VERSION,
      moduleVersion: MODULE_VERSION,
      exportedAt: nowIso(),
      blueprint: cloneData(blueprint),
      media: { base: "Foundry Data", bundled: false, references: listBlueprintMedia(blueprint) },
      ...(snapshotCards ? { missingCardRefs } : {})
    };
    return JSON.stringify(envelope, null, pretty ? 2 : 0);
  }
  async function importBlueprint(input, { idPolicy = "new", mediaPaths = null } = {}) {
    const rawBlueprint = parseEnvelope(input);
    if (Number(rawBlueprint?.schemaVersion ?? 0) > SCHEMA_VERSIONS.blueprint) {
      throw persistenceError("IMPORT_BLUEPRINT_SCHEMA_FUTURE", "Blueprint was created with a newer unsupported schema.", { schemaVersion: rawBlueprint.schemaVersion, supported: SCHEMA_VERSIONS.blueprint });
    }
    let blueprint = createChaseBlueprint(mediaPaths ? remapBlueprintMedia(rawBlueprint, mediaPaths).blueprint : rawBlueprint);
    assertValid(blueprint, validateChaseBlueprint, "INVALID_BLUEPRINT");
    const existing = await getBlueprint(blueprint.id);
    if (idPolicy === "replace") return saveBlueprint(blueprint, { createIfMissing: true });
    if (idPolicy === "preserve") {
      if (existing) throw persistenceError("BLUEPRINT_EXISTS", `Blueprint '${blueprint.id}' already exists.`);
      return createBlueprint(blueprint);
    }
    if (idPolicy !== "new") throw persistenceError("IMPORT_ID_POLICY", `Unsupported import id policy '${idPolicy}'.`);
    blueprint = createChaseBlueprint({ ...blueprint, id: createId("blueprint"), createdAt: nowIso(), updatedAt: nowIso(), metadata: { ...blueprint.metadata, importedFromId: blueprint.id } });
    return createBlueprint(blueprint);
  }

  async function listSessions({ status: filterStatus = null, blueprintId = null } = {}) {
    let values = (await read()).sessions;
    if (filterStatus) values = values.filter(item => item.status === filterStatus);
    if (blueprintId) values = values.filter(item => item.blueprintId === blueprintId);
    return cloneData(values);
  }
  async function getSession(idOrRef) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "session" ? parsed.id : String(idOrRef ?? "");
    return cloneData((await read()).sessions.find(item => item.id === id) ?? null);
  }
  async function createSessionFromBlueprint(idOrBlueprint, options = {}) {
    const blueprint = typeof idOrBlueprint === "string" ? await getBlueprint(idOrBlueprint) : createChaseBlueprint(idOrBlueprint);
    if (!blueprint) throw persistenceError("BLUEPRINT_NOT_FOUND", `Blueprint '${idOrBlueprint}' does not exist.`);
    const session = rulesEngine.initializeSession(blueprint, { status: "draft", sessionId: options.sessionId ?? createId("session"), ...options, status: "draft" });
    assertValid(session, validateChaseSession, "INVALID_SESSION");
    return transact(state => {
      if (state.sessions.some(item => item.id === session.id)) throw persistenceError("SESSION_EXISTS", `Session '${session.id}' already exists.`);
      state.sessions.push(session);
      return session;
    });
  }
  async function saveSession(input, { createIfMissing = false } = {}) {
    const session = createChaseSession({ ...cloneData(input), updatedAt: nowIso() });
    assertValid(session, validateChaseSession, "INVALID_SESSION");
    return transact(state => {
      const index = state.sessions.findIndex(item => item.id === session.id);
      if (index < 0 && !createIfMissing) throw persistenceError("SESSION_NOT_FOUND", `Session '${session.id}' does not exist.`);
      if (index < 0) state.sessions.push(session); else state.sessions[index] = session;
      return session;
    });
  }
  async function transitionSession(idOrRef, allowed, statusValue, timestamps = {}) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "session" ? parsed.id : String(idOrRef ?? "");
    return transact(state => {
      const index = state.sessions.findIndex(item => item.id === id);
      if (index < 0) throw persistenceError("SESSION_NOT_FOUND", `Session '${idOrRef}' does not exist.`);
      const session = state.sessions[index];
      if (!allowed.includes(session.status)) throw persistenceError("SESSION_STATUS", `Cannot change session '${session.id}' from '${session.status}' to '${statusValue}'.`, { allowed });
      const next = createChaseSession({ ...session, status: statusValue, ...timestamps, updatedAt: nowIso() });
      assertValid(next, validateChaseSession, "INVALID_SESSION");
      state.sessions[index] = next;
      return next;
    });
  }
  const startSession = id => transitionSession(id, ["draft"], "active", { startedAt: nowIso(), pausedAt: null });
  const pauseSession = id => transitionSession(id, ["active"], "paused", { pausedAt: nowIso() });
  const resumeSession = id => transitionSession(id, ["paused"], "active", { pausedAt: null });
  const abortSession = id => transitionSession(id, ["draft", "active", "paused"], "aborted", { endedAt: nowIso() });
  async function finishSession(idOrRef, evaluation) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "session" ? parsed.id : String(idOrRef ?? "");
    return transact(state => {
      const index = state.sessions.findIndex(item => item.id === id);
      if (index < 0) throw persistenceError("SESSION_NOT_FOUND", `Session '${idOrRef}' does not exist.`);
      const completed = rulesEngine.completeSession(state.sessions[index], evaluation);
      assertValid(completed.session, validateChaseSession, "INVALID_SESSION");
      assertValid(completed.result, validateChaseResult, "INVALID_RESULT");
      state.sessions[index] = completed.session;
      state.results = state.results.filter(item => item.sessionId !== id);
      state.results.push(createChaseResult(completed.result));
      return completed;
    });
  }
  async function deleteSession(idOrRef) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "session" ? parsed.id : String(idOrRef ?? "");
    return transact(state => {
      const index = state.sessions.findIndex(item => item.id === id);
      if (index < 0) return false;
      state.sessions.splice(index, 1);
      return true;
    });
  }
  async function listResults({ blueprintId = null, sessionId = null } = {}) {
    let values = (await read()).results;
    if (blueprintId) values = values.filter(item => item.blueprintId === blueprintId);
    if (sessionId) values = values.filter(item => item.sessionId === sessionId);
    return cloneData(values);
  }
  async function getResult(idOrRef) {
    const parsed = parseChaseReference(idOrRef);
    const id = parsed?.type === "result" ? parsed.id : String(idOrRef ?? "");
    return cloneData((await read()).results.find(item => item.id === id) ?? null);
  }

  return Object.freeze({
    initialize,
    status,
    references: Object.freeze({ create: createChaseReference, parse: parseChaseReference }),
    blueprints: Object.freeze({ list: listBlueprints, get: getBlueprint, create: createBlueprint, save: saveBlueprint, duplicate: duplicateBlueprint, delete: deleteBlueprint, freezeContent: freezeBlueprintContent, useLiveContent, inspectReferences, exportJson: exportBlueprint, importJson: importBlueprint, reference: id => createChaseReference("blueprint", id) }),
    sessions: Object.freeze({ list: listSessions, get: getSession, createFromBlueprint: createSessionFromBlueprint, save: saveSession, start: startSession, pause: pauseSession, resume: resumeSession, abort: abortSession, finish: finishSession, delete: deleteSession, reference: id => createChaseReference("session", id), statuses: SESSION_STATUSES }),
    results: Object.freeze({ list: listResults, get: getResult, reference: id => createChaseReference("result", id) })
  });
}
