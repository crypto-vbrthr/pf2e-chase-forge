import {
  CONSEQUENCE_STATUSES,
  EFFECT_TARGET_MODES
} from "../core/constants.js";
import { ChaseConsequenceError } from "../core/errors.js";
import { createChaseSession, createConsequence } from "../data/factories.js";
import { cloneData, createId, nowIso, uniqueStrings } from "../data/utils.js";
import { validateChaseSession, validateConsequence } from "../data/validators.js";
import { createRouteGraphEngine } from "../engine/route-graph-engine.js";
import { createEffectForgeBridge } from "../integrations/effect-forge-bridge.js";

function consequenceError(code, message, details = null) {
  return new ChaseConsequenceError(message, { code, details });
}

const TERMINAL_STATUSES = new Set([
  "applied",
  "skipped",
  "manualFallback",
  "blocked",
  "rulesHandled",
  "unhandled"
]);

function recordIsHandled(record, options = {}) {
  if (!record) return false;
  if (record.status === "failed") return options.retryFailed !== true;
  if (record.status === "manualFallback") return options.retryFallback !== true;
  if (record.status === "blocked") return options.retryBlocked !== true;
  if (record.status === "skipped") return options.retrySkipped !== true;
  return TERMINAL_STATUSES.has(record.status);
}

function assertSession(session) {
  const result = validateChaseSession(session);
  if (!result.valid) throw consequenceError("INVALID_SESSION", "The Chase Session is invalid for consequence execution.", { errors: result.errors });
  if (!session.blueprintSnapshot) throw consequenceError("MISSING_BLUEPRINT_SNAPSHOT", "Consequence execution requires a blueprint snapshot.");
}

function asOccurrence(input, context = {}) {
  if (input?.consequence && input?.occurrenceId) {
    const consequence = createConsequence(input.consequence);
    return {
      occurrenceId: String(input.occurrenceId),
      consequence,
      sourceEventId: input.sourceEventId ?? context.sourceEventId ?? null,
      runtimeGroupId: input.runtimeGroupId ?? context.runtimeGroupId ?? null,
      participantId: input.participantId ?? context.participantId ?? null,
      nodeId: input.nodeId ?? context.nodeId ?? null,
      cardId: input.cardId ?? context.cardId ?? null,
      approachId: input.approachId ?? context.approachId ?? null,
      degree: input.degree ?? context.degree ?? null
    };
  }

  const consequence = createConsequence(input);
  const sourceEventId = context.sourceEventId ?? null;
  return {
    occurrenceId: context.occurrenceId ?? (sourceEventId ? `${sourceEventId}:${consequence.id}` : createId("consequence-occurrence")),
    consequence,
    sourceEventId,
    runtimeGroupId: context.runtimeGroupId ?? null,
    participantId: context.participantId ?? null,
    nodeId: context.nodeId ?? null,
    cardId: context.cardId ?? null,
    approachId: context.approachId ?? null,
    degree: context.degree ?? null
  };
}

function occurrenceFromRulesResult(result) {
  if (Array.isArray(result?.consequenceOccurrences)) return result.consequenceOccurrences.map(item => asOccurrence(item));
  const context = result?.consequenceContext ?? {};
  return (Array.isArray(result?.deferredConsequences) ? result.deferredConsequences : []).map(consequence => asOccurrence(consequence, context));
}

function findRecord(session, occurrenceId) {
  return session.consequenceState?.records?.find(record => record.occurrenceId === occurrenceId) ?? null;
}

function summarizeError(error) {
  return {
    code: error?.code ?? error?.name ?? "ERROR",
    message: error?.message ?? String(error),
    details: error?.details && typeof error.details === "object" ? cloneData(error.details) : null
  };
}

function consequenceEvent(type, session, occurrence, record) {
  return {
    id: createId("consequence-event"),
    type,
    round: Number.isInteger(session.round) ? session.round : 0,
    timestamp: nowIso(),
    occurrenceId: occurrence.occurrenceId,
    consequenceId: occurrence.consequence.id,
    kind: occurrence.consequence.kind,
    status: record.status,
    runtimeGroupId: occurrence.runtimeGroupId,
    participantId: occurrence.participantId
  };
}

function upsertRecord(session, occurrence, {
  status,
  targetUuids = [],
  result = null,
  message = ""
} = {}) {
  const next = cloneData(session);
  next.consequenceState ??= { records: [] };
  next.consequenceState.records ??= [];
  const existingIndex = next.consequenceState.records.findIndex(record => record.occurrenceId === occurrence.occurrenceId);
  const existing = existingIndex >= 0 ? next.consequenceState.records[existingIndex] : null;
  const timestamp = nowIso();
  const record = {
    occurrenceId: occurrence.occurrenceId,
    consequenceId: occurrence.consequence.id,
    kind: occurrence.consequence.kind,
    status: CONSEQUENCE_STATUSES.includes(status) ? status : "unhandled",
    sourceEventId: occurrence.sourceEventId,
    runtimeGroupId: occurrence.runtimeGroupId,
    participantId: occurrence.participantId,
    nodeId: occurrence.nodeId,
    cardId: occurrence.cardId,
    approachId: occurrence.approachId,
    degree: occurrence.degree,
    targetUuids: uniqueStrings(targetUuids),
    result: result && typeof result === "object" ? cloneData(result) : null,
    message: String(message ?? ""),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  if (existingIndex >= 0) next.consequenceState.records[existingIndex] = record;
  else next.consequenceState.records.push(record);
  next.updatedAt = timestamp;
  if (!existing || existing.status !== record.status) {
    next.events = [...(next.events ?? []), consequenceEvent("consequenceStateChanged", next, occurrence, record)];
  }
  return { session: createChaseSession(next), record };
}

function participantDefinition(session, participantId) {
  if (!participantId) return null;
  for (const group of session.blueprintSnapshot?.groups ?? []) {
    const participant = group.participants?.find(candidate => candidate.id === participantId);
    if (participant) return participant;
  }
  return null;
}

function runtimeGroup(session, runtimeGroupId) {
  return session.groups.find(group => group.id === runtimeGroupId) ?? null;
}

function targetUuid(value) {
  if (typeof value === "string") return value;
  return value?.uuid ?? value?.document?.uuid ?? value?.actor?.uuid ?? null;
}

async function defaultUuidResolver(uuid) {
  if (typeof globalThis.fromUuid !== "function") return null;
  return globalThis.fromUuid(uuid);
}

async function resolveUuidTargets(values, resolver) {
  const resolved = [];
  const seen = new Set();
  for (const value of values ?? []) {
    if (value && typeof value === "object") {
      const uuid = targetUuid(value) ?? `object:${resolved.length}`;
      if (!seen.has(uuid)) {
        seen.add(uuid);
        resolved.push(value);
      }
      continue;
    }
    const uuid = String(value ?? "").trim();
    if (!uuid || seen.has(uuid)) continue;
    const target = await resolver(uuid);
    if (target) {
      seen.add(uuid);
      resolved.push(target);
    }
  }
  return resolved;
}

async function resolveEffectTargets(session, occurrence, options, uuidResolver) {
  const payload = occurrence.consequence.payload ?? {};
  const overrides = options.targetsByOccurrence?.[occurrence.occurrenceId]
    ?? options.targetsByConsequence?.[occurrence.consequence.id]
    ?? null;
  if (overrides) return resolveUuidTargets(Array.isArray(overrides) ? overrides : [overrides], uuidResolver);

  const values = [];
  const targetMode = EFFECT_TARGET_MODES.includes(payload.targetMode) ? payload.targetMode : "participant";
  if (targetMode === "participant") {
    const participant = participantDefinition(session, occurrence.participantId);
    if (participant?.uuid) values.push(participant.uuid);
  } else if (targetMode === "runtimeGroup") {
    const group = runtimeGroup(session, occurrence.runtimeGroupId);
    for (const participantId of group?.participantIds ?? []) {
      const participant = participantDefinition(session, participantId);
      if (participant?.uuid) values.push(participant.uuid);
    }
  } else {
    for (const participantId of payload.targetParticipantIds ?? []) {
      const participant = participantDefinition(session, participantId);
      if (participant?.uuid) values.push(participant.uuid);
    }
    values.push(...(payload.targetUuids ?? []));
  }

  return resolveUuidTargets(values, uuidResolver);
}

function isConfirmed(occurrence, options) {
  if (occurrence.consequence.gmConfirmation === false) return true;
  if (options.autoConfirm === true) return true;
  const occurrenceIds = new Set(options.confirmedOccurrenceIds ?? []);
  const consequenceIds = new Set(options.confirmedConsequenceIds ?? []);
  return occurrenceIds.has(occurrence.occurrenceId) || consequenceIds.has(occurrence.consequence.id);
}

function selectedRouteEdge(occurrence, options) {
  return options.routeSelections?.[occurrence.occurrenceId]
    ?? options.routeSelections?.[occurrence.consequence.id]
    ?? null;
}

function fallbackEffectSummary(consequence, bridgeReport) {
  const payload = consequence.payload ?? {};
  const definition = payload.definition ?? null;
  return {
    source: payload.source,
    required: payload.required === true,
    name: definition?.name ?? consequence.label ?? null,
    description: definition?.description ?? null,
    definitionId: definition?.id ?? null,
    itemUuid: payload.uuid ?? null,
    effectForgeReason: bridgeReport.reason ?? null
  };
}

function currentNodeForGroup(session, runtimeGroupId) {
  const group = runtimeGroup(session, runtimeGroupId);
  if (!group) return { group: null, node: null };
  const node = session.blueprintSnapshot?.graph?.nodes?.find(candidate => candidate.id === group.position.nodeId) ?? null;
  return { group, node };
}

function cardClearedForGroup(session, nodeId, runtimeGroupId) {
  return session.nodeState?.[nodeId]?.groups?.[runtimeGroupId]?.cleared === true;
}

function routeOccurrenceKind(occurrence) {
  return ["routeUnlock", "routeLock", "routeSelect"].includes(occurrence?.consequence?.kind);
}

export function createConsequenceOccurrence(consequence, context = {}) {
  const normalized = asOccurrence(consequence, context);
  const validation = validateConsequence(normalized.consequence);
  if (!validation.valid) throw consequenceError("INVALID_CONSEQUENCE", "Cannot create an occurrence from an invalid Chase Consequence.", { errors: validation.errors });
  return Object.freeze(cloneData(normalized));
}

export function createConsequenceEngine({
  routeEngine = createRouteGraphEngine(),
  effectForgeBridge = createEffectForgeBridge(),
  uuidResolver = defaultUuidResolver
} = {}) {
  function plan(session, inputs, options = {}) {
    assertSession(session);
    const occurrences = (Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean).map(input => asOccurrence(input, options.context ?? {}));
    const bridgeReport = effectForgeBridge.inspect();
    return occurrences.map(occurrence => {
      const existing = findRecord(session, occurrence.occurrenceId);
      if (recordIsHandled(existing, options)) {
        return { occurrence: cloneData(occurrence), action: "alreadyHandled", status: existing.status, record: cloneData(existing) };
      }
      if (occurrence.consequence.optional && (options.skipOptional === true || (options.skippedOccurrenceIds ?? []).includes(occurrence.occurrenceId))) {
        return { occurrence: cloneData(occurrence), action: "skip", status: "skipped", record: existing ? cloneData(existing) : null };
      }
      if (!isConfirmed(occurrence, options)) {
        return { occurrence: cloneData(occurrence), action: "confirm", status: "pendingConfirmation", record: existing ? cloneData(existing) : null };
      }
      if (occurrence.consequence.kind === "routeSelect") {
        const edgeIds = occurrence.consequence.payload?.edgeIds ?? [];
        if (!selectedRouteEdge(occurrence, options) && edgeIds.length > 1) {
          return { occurrence: cloneData(occurrence), action: "selectRoute", status: "pendingSelection", choices: [...edgeIds], record: existing ? cloneData(existing) : null };
        }
      }
      if (occurrence.consequence.kind === "effectForge" && !bridgeReport.compatible) {
        return {
          occurrence: cloneData(occurrence),
          action: occurrence.consequence.payload?.required === true ? "blocked" : "manualFallback",
          status: occurrence.consequence.payload?.required === true ? "blocked" : "manualFallback",
          effectForge: bridgeReport,
          record: existing ? cloneData(existing) : null
        };
      }
      if (occurrence.consequence.kind === "chasePoints") {
        return { occurrence: cloneData(occurrence), action: "rulesHandled", status: "rulesHandled", record: existing ? cloneData(existing) : null };
      }
      if (occurrence.consequence.kind === "custom") {
        return { occurrence: cloneData(occurrence), action: "unhandled", status: "unhandled", record: existing ? cloneData(existing) : null };
      }
      return { occurrence: cloneData(occurrence), action: "apply", status: null, record: existing ? cloneData(existing) : null };
    });
  }

  async function execute(session, inputs, options = {}) {
    assertSession(session);
    const occurrences = (Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean).map(input => asOccurrence(input, options.context ?? {}));
    let next = session;
    const processed = [];

    for (const occurrence of occurrences) {
      const validation = validateConsequence(occurrence.consequence);
      if (!validation.valid) throw consequenceError("INVALID_CONSEQUENCE", `Consequence '${occurrence.consequence.id}' is invalid.`, { errors: validation.errors });
      const existing = findRecord(next, occurrence.occurrenceId);
      if (recordIsHandled(existing, options)) {
        processed.push({ occurrence: cloneData(occurrence), record: cloneData(existing), idempotent: true });
        continue;
      }

      if (occurrence.consequence.optional && (options.skipOptional === true || (options.skippedOccurrenceIds ?? []).includes(occurrence.occurrenceId))) {
        const updated = upsertRecord(next, occurrence, { status: "skipped", message: "Optional consequence skipped." });
        next = updated.session;
        processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
        continue;
      }

      if (!isConfirmed(occurrence, options)) {
        const updated = upsertRecord(next, occurrence, { status: "pendingConfirmation", message: "GM confirmation is required before applying this consequence." });
        next = updated.session;
        processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
        continue;
      }

      try {
        const consequence = occurrence.consequence;
        if (consequence.kind === "chasePoints") {
          const updated = upsertRecord(next, occurrence, {
            status: "rulesHandled",
            result: { value: Number(consequence.payload?.value ?? 0) },
            message: "Chase Point consequences are resolved by the PF2E Chase Rules Engine."
          });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        if (consequence.kind === "routeUnlock") {
          next = routeEngine.unlockEdges(next, consequence.payload.edgeIds);
          const updated = upsertRecord(next, occurrence, { status: "applied", result: { edgeIds: [...consequence.payload.edgeIds] } });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        if (consequence.kind === "routeLock") {
          next = routeEngine.lockEdges(next, consequence.payload.edgeIds);
          const updated = upsertRecord(next, occurrence, { status: "applied", result: { edgeIds: [...consequence.payload.edgeIds] } });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        if (consequence.kind === "routeSelect") {
          const edgeIds = consequence.payload.edgeIds ?? [];
          let edgeId = selectedRouteEdge(occurrence, options);
          if (!edgeId && edgeIds.length === 1) edgeId = edgeIds[0];
          if (!edgeId) {
            const updated = upsertRecord(next, occurrence, {
              status: "pendingSelection",
              result: { edgeIds: [...edgeIds] },
              message: "A route must be selected before this consequence can be applied."
            });
            next = updated.session;
            processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
            continue;
          }
          if (!edgeIds.includes(edgeId)) throw consequenceError("ROUTE_SELECTION_NOT_ALLOWED", `Edge '${edgeId}' is not allowed by consequence '${consequence.id}'.`, { edgeId, edgeIds });
          if (!occurrence.runtimeGroupId) throw consequenceError("ROUTE_GROUP_REQUIRED", "Route selection consequence requires a runtimeGroupId.");
          next = routeEngine.moveGroup(next, occurrence.runtimeGroupId, edgeId, { context: options.routeContext ?? options.context ?? {} });
          const updated = upsertRecord(next, occurrence, { status: "applied", result: { edgeId } });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        if (consequence.kind === "narrative") {
          const updated = upsertRecord(next, occurrence, {
            status: "applied",
            result: { text: consequence.payload?.text ?? "" },
            message: consequence.payload?.text ?? ""
          });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        if (consequence.kind === "effectForge") {
          const bridgeReport = effectForgeBridge.inspect();
          if (!bridgeReport.compatible) {
            const required = consequence.payload?.required === true;
            const updated = upsertRecord(next, occurrence, {
              status: required ? "blocked" : "manualFallback",
              result: fallbackEffectSummary(consequence, bridgeReport),
              message: required
                ? "This consequence requires Effect Forge, but a compatible API is unavailable."
                : "Effect Forge is unavailable; apply the described consequence manually."
            });
            next = updated.session;
            processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
            continue;
          }

          const targets = await resolveEffectTargets(next, occurrence, options, uuidResolver);
          if (targets.length === 0) {
            const required = consequence.payload?.required === true;
            const updated = upsertRecord(next, occurrence, {
              status: required ? "blocked" : "manualFallback",
              result: fallbackEffectSummary(consequence, bridgeReport),
              message: required
                ? "No Effect Forge target could be resolved for a required consequence."
                : "No Effect Forge target could be resolved; apply the consequence manually."
            });
            next = updated.session;
            processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
            continue;
          }

          const applied = await effectForgeBridge.apply(consequence.payload, targets, options.effectForgeOptions ?? {});
          const updated = upsertRecord(next, occurrence, {
            status: "applied",
            targetUuids: applied.targetUuids,
            result: applied,
            message: applied.definitionName ? `Applied '${applied.definitionName}'.` : "Effect Forge consequence applied."
          });
          next = updated.session;
          processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
          continue;
        }

        const updated = upsertRecord(next, occurrence, {
          status: "unhandled",
          result: { payload: cloneData(consequence.payload) },
          message: `No core executor is registered for consequence kind '${consequence.kind}'.`
        });
        next = updated.session;
        processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false });
      } catch (error) {
        const updated = upsertRecord(next, occurrence, {
          status: "failed",
          result: { error: summarizeError(error) },
          message: error?.message ?? String(error)
        });
        next = updated.session;
        processed.push({ occurrence: cloneData(occurrence), record: updated.record, idempotent: false, error: summarizeError(error) });
        if (options.throwOnError === true) throw error;
      }
    }

    const routeChoices = [];
    if (options.finalizeRoutes !== false) {
      const affectedGroupIds = uniqueStrings(occurrences.filter(routeOccurrenceKind).map(occurrence => occurrence.runtimeGroupId));
      for (const runtimeGroupId of affectedGroupIds) {
        const relevant = processed.filter(item => item.occurrence.runtimeGroupId === runtimeGroupId && routeOccurrenceKind(item.occurrence));
        const unresolved = relevant.some(item => ["pendingConfirmation", "pendingSelection", "failed", "blocked"].includes(item.record.status));
        if (unresolved) continue;
        const { group, node } = currentNodeForGroup(next, runtimeGroupId);
        if (!group || group.completed || node?.type !== "card" || !cardClearedForGroup(next, node.id, runtimeGroupId)) continue;
        const available = routeEngine.availableTransitions(next, runtimeGroupId, { context: options.routeContext ?? options.context ?? {} });
        if (available.length === 1) {
          next = routeEngine.moveGroup(next, runtimeGroupId, available[0].edge.id, { context: options.routeContext ?? options.context ?? {} });
          const deterministic = routeEngine.resolveDeterministic(next, runtimeGroupId, { context: options.routeContext ?? options.context ?? {} });
          next = deterministic.session;
        } else if (available.length > 1) {
          routeChoices.push({ runtimeGroupId, edgeIds: available.map(item => item.edge.id) });
        }
      }
    }

    const records = processed.map(item => cloneData(item.record));
    return Object.freeze({
      session: next,
      routeChoices,
      processed,
      records,
      applied: records.filter(record => record.status === "applied"),
      pending: records.filter(record => ["pendingConfirmation", "pendingSelection"].includes(record.status)),
      fallback: records.filter(record => record.status === "manualFallback"),
      blocked: records.filter(record => record.status === "blocked"),
      failed: records.filter(record => record.status === "failed"),
      skipped: records.filter(record => record.status === "skipped")
    });
  }

  async function executeRulesResult(rulesResult, options = {}) {
    if (!rulesResult?.session) throw consequenceError("RULES_RESULT_SESSION_MISSING", "Rules result has no Chase Session.");
    const occurrences = occurrenceFromRulesResult(rulesResult);
    return execute(rulesResult.session, occurrences, options);
  }

  function records(session, { status = null, occurrenceId = null } = {}) {
    assertSession(session);
    return (session.consequenceState?.records ?? [])
      .filter(record => !status || record.status === status)
      .filter(record => !occurrenceId || record.occurrenceId === occurrenceId)
      .map(cloneData);
  }

  return Object.freeze({
    createOccurrence: createConsequenceOccurrence,
    fromRulesResult: occurrenceFromRulesResult,
    plan,
    execute,
    executeRulesResult,
    records
  });
}
