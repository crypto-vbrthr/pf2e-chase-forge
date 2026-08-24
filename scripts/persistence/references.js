import { CHASE_REFERENCE_TYPES } from "../core/constants.js";

const PREFIX = Object.freeze({ blueprint: "ChaseBlueprint", session: "ChaseSession", result: "ChaseResult" });
const TYPE_BY_PREFIX = Object.freeze(Object.fromEntries(Object.entries(PREFIX).map(([type, prefix]) => [prefix, type])));

export function createChaseReference(type, id) {
  if (!CHASE_REFERENCE_TYPES.includes(type)) throw new TypeError(`Unsupported Chase reference type '${type}'.`);
  if (!id) throw new TypeError("Chase references require an id.");
  return `${PREFIX[type]}.${String(id)}`;
}

export function parseChaseReference(reference) {
  const raw = String(reference ?? "");
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const prefix = raw.slice(0, dot);
  const id = raw.slice(dot + 1);
  const type = TYPE_BY_PREFIX[prefix] ?? null;
  return type && id ? { type, id, reference: raw } : null;
}
