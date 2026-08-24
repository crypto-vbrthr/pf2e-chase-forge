import { MODULE_ID } from "../core/constants.js";
import { ChaseRegistryError } from "../core/errors.js";
import { asString } from "../data/utils.js";

export function normalizeOwnedResourceId(sourceModule, id, { allowCoreAlias = false } = {}) {
  const owner = asString(sourceModule).trim();
  const raw = asString(id).trim();
  if (!owner) throw new ChaseRegistryError("A source module id is required.", { code: "CHASE_SOURCE_MODULE_REQUIRED" });
  if (!raw) throw new ChaseRegistryError("A resource id is required.", { code: "CHASE_RESOURCE_ID_REQUIRED" });

  if (!raw.includes(":")) return `${owner}:${raw}`;

  const [namespace] = raw.split(":", 1);
  const coreAliasAllowed = allowCoreAlias && owner === MODULE_ID && namespace === "core";
  if (namespace !== owner && !coreAliasAllowed) {
    throw new ChaseRegistryError(`Resource id '${raw}' is not owned by module '${owner}'.`, {
      code: "CHASE_NAMESPACE_OWNERSHIP",
      details: { sourceModule: owner, resourceId: raw }
    });
  }
  return raw;
}

export function assertOwnedResource(resource, sourceModule, { allowCoreAlias = false } = {}) {
  const id = normalizeOwnedResourceId(sourceModule, resource?.id, { allowCoreAlias });
  return { ...resource, id };
}

export function normalizeString(value, fallback = "") {
  const text = value === null || value === undefined ? fallback : String(value);
  return text.trim();
}

export function compareByPriorityThenId(a, b) {
  const priority = Number(b?.priority ?? 0) - Number(a?.priority ?? 0);
  if (priority !== 0) return priority;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}
