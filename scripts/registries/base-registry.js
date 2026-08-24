import { ChaseRegistryError } from "../core/errors.js";
import { cloneData } from "../data/utils.js";
import { compareByPriorityThenId } from "./registry-utils.js";

export class OwnedContentRegistry {
  #resourceType;
  #entries = new Map();

  constructor(resourceType) {
    this.#resourceType = resourceType;
  }

  get size() {
    return this.#entries.size;
  }

  has(id) {
    return this.#entries.has(String(id));
  }

  ownerOf(id) {
    return this.#entries.get(String(id))?.owner ?? null;
  }

  get(id) {
    const entry = this.#entries.get(String(id));
    return entry ? cloneData(entry.resource) : null;
  }

  getEntry(id) {
    const entry = this.#entries.get(String(id));
    return entry ? { ...entry, resource: cloneData(entry.resource) } : null;
  }

  list({ owner = null, packId = null } = {}) {
    return [...this.#entries.values()]
      .filter(entry => !owner || entry.owner === owner)
      .filter(entry => !packId || entry.packId === packId)
      .map(entry => cloneData(entry.resource))
      .sort(compareByPriorityThenId);
  }

  listEntries({ owner = null, packId = null } = {}) {
    return [...this.#entries.values()]
      .filter(entry => !owner || entry.owner === owner)
      .filter(entry => !packId || entry.packId === packId)
      .map(entry => ({ ...entry, resource: cloneData(entry.resource) }))
      .sort((a, b) => compareByPriorityThenId(a.resource, b.resource));
  }

  assertCanRegister(id, owner, { replace = false } = {}) {
    const existing = this.#entries.get(String(id));
    if (!existing) return true;
    if (!replace) {
      throw new ChaseRegistryError(`${this.#resourceType} '${id}' is already registered.`, {
        code: "CHASE_RESOURCE_CONFLICT",
        details: { resourceType: this.#resourceType, resourceId: id, owner: existing.owner }
      });
    }
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`${this.#resourceType} '${id}' is owned by '${existing.owner}' and cannot be replaced by '${owner}'.`, {
        code: "CHASE_RESOURCE_OWNERSHIP",
        details: { resourceType: this.#resourceType, resourceId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return true;
  }

  register(resource, { owner, packId = null, replace = false } = {}) {
    this.assertCanRegister(resource.id, owner, { replace });
    const stored = cloneData(resource);
    this.#entries.set(stored.id, { owner, packId, resource: stored });
    return cloneData(stored);
  }

  unregister(id, owner) {
    const key = String(id);
    const existing = this.#entries.get(key);
    if (!existing) return false;
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`${this.#resourceType} '${id}' is owned by '${existing.owner}' and cannot be removed by '${owner}'.`, {
        code: "CHASE_RESOURCE_OWNERSHIP",
        details: { resourceType: this.#resourceType, resourceId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return this.#entries.delete(key);
  }

  unregisterByPack(packId, owner) {
    let removed = 0;
    for (const [id, entry] of [...this.#entries.entries()]) {
      if (entry.owner === owner && entry.packId === packId) {
        this.#entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  unregisterAll(owner) {
    let removed = 0;
    for (const [id, entry] of [...this.#entries.entries()]) {
      if (entry.owner === owner) {
        this.#entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  snapshot() {
    return new Map([...this.#entries.entries()].map(([id, entry]) => [id, { ...entry, resource: cloneData(entry.resource) }]));
  }

  restore(snapshot) {
    this.#entries = new Map([...snapshot.entries()].map(([id, entry]) => [id, { ...entry, resource: cloneData(entry.resource) }]));
  }
}
