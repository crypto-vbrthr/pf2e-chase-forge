import { SCHEMA_VERSIONS } from "../core/constants.js";
import { createChaseBlueprint, createChaseResult, createChaseSession } from "../data/factories.js";
import { cloneData, isPlainObject, nowIso } from "../data/utils.js";
import { validateChaseBlueprint, validateChaseResult, validateChaseSession } from "../data/validators.js";

export function createDefaultPersistenceState() {
  return {
    schemaVersion: SCHEMA_VERSIONS.persistence,
    revision: 0,
    blueprints: [],
    sessions: [],
    results: [],
    createdAt: nowIso(),
    updatedAt: null,
    metadata: {}
  };
}


export function inspectPersistenceCompatibility(input = {}) {
  const raw = isPlainObject(input) ? input : {};
  const issues = [];
  const checks = [
    ["persistence", raw.schemaVersion, SCHEMA_VERSIONS.persistence],
    ...((Array.isArray(raw.blueprints) ? raw.blueprints : []).map((item, index) => [`blueprints[${index}]`, item?.schemaVersion, SCHEMA_VERSIONS.blueprint])),
    ...((Array.isArray(raw.sessions) ? raw.sessions : []).map((item, index) => [`sessions[${index}]`, item?.schemaVersion, SCHEMA_VERSIONS.session])),
    ...((Array.isArray(raw.results) ? raw.results : []).map((item, index) => [`results[${index}]`, item?.schemaVersion, SCHEMA_VERSIONS.result]))
  ];
  for (const [path, actualRaw, supported] of checks) {
    const actual = Number(actualRaw ?? 0);
    if (actual > supported) issues.push({ code: "FUTURE_SCHEMA", path, actual, supported });
  }
  return { compatible: issues.length === 0, issues };
}

export function normalizePersistenceState(input = {}) {
  const raw = isPlainObject(input) ? input : {};
  const createdAt = raw.createdAt ?? nowIso();
  return {
    schemaVersion: SCHEMA_VERSIONS.persistence,
    revision: Math.max(0, Math.trunc(Number(raw.revision) || 0)),
    blueprints: (Array.isArray(raw.blueprints) ? raw.blueprints : []).map(createChaseBlueprint),
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).map(createChaseSession),
    results: (Array.isArray(raw.results) ? raw.results : []).map(createChaseResult),
    createdAt,
    updatedAt: raw.updatedAt ?? null,
    metadata: isPlainObject(raw.metadata) ? cloneData(raw.metadata) : {}
  };
}

function duplicateIds(items = []) {
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    const id = item?.id;
    if (!id) continue;
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  return [...new Set(duplicates)];
}

export function validatePersistenceState(input) {
  const state = normalizePersistenceState(input);
  const errors = [];
  if (state.schemaVersion !== SCHEMA_VERSIONS.persistence) {
    errors.push({ code: "SCHEMA_VERSION", path: "schemaVersion", message: `Expected persistence schema ${SCHEMA_VERSIONS.persistence}.` });
  }
  for (const [key, validator] of [["blueprints", validateChaseBlueprint], ["sessions", validateChaseSession], ["results", validateChaseResult]]) {
    for (const id of duplicateIds(state[key])) errors.push({ code: "DUPLICATE_ID", path: key, message: `Duplicate ${key} id '${id}'.` });
    state[key].forEach((value, index) => {
      const result = validator(value);
      if (!result.valid) errors.push({ code: "INVALID_RECORD", path: `${key}[${index}]`, message: `Invalid ${key} record.`, details: result.errors });
    });
  }
  return { valid: errors.length === 0, errors, state };
}
