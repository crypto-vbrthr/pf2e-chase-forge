export function cloneData(value) {
  if (value === undefined) return undefined;
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function nowIso() {
  return new Date().toISOString();
}

let fallbackCounter = 0;
export function createId(prefix = "chase") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}

export function asString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function asFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.trunc(asFiniteNumber(value, fallback)));
}

export function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

export function normalizeSource(source = {}, fallbackModuleId = "pf2e-chase-forge") {
  return {
    moduleId: asString(source.moduleId, fallbackModuleId),
    packId: source.packId ? asString(source.packId) : null,
    version: source.version ? asString(source.version) : null
  };
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
