import { DEFAULTS } from "../core/constants.js";
import { ChaseRegistryError } from "../core/errors.js";
import { cloneData } from "../data/utils.js";
import { compareByPriorityThenId } from "./registry-utils.js";

export class MemoryPackStateStore {
  #states = new Map();

  get(packId) {
    return this.#states.has(packId) ? this.#states.get(packId) : null;
  }

  async set(packId, enabled) {
    this.#states.set(packId, enabled === true);
    return enabled === true;
  }
}

export class ChasePackRegistry {
  #entries = new Map();
  #stateStore;

  constructor({ stateStore = new MemoryPackStateStore() } = {}) {
    this.#stateStore = stateStore;
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

  assertCanRegister(id, owner, { replace = false } = {}) {
    const existing = this.#entries.get(String(id));
    if (!existing) return true;
    if (!replace) {
      throw new ChaseRegistryError(`Chase pack '${id}' is already registered.`, {
        code: "CHASE_PACK_CONFLICT",
        details: { packId: id, owner: existing.owner }
      });
    }
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`Chase pack '${id}' is owned by '${existing.owner}' and cannot be replaced by '${owner}'.`, {
        code: "CHASE_PACK_OWNERSHIP",
        details: { packId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return true;
  }

  register(pack, { owner, replace = false } = {}) {
    this.assertCanRegister(pack.id, owner, { replace });
    const persisted = this.#stateStore.get(pack.id);
    const enabled = persisted === null || persisted === undefined ? pack.enabledByDefault !== false : persisted === true;
    const stored = {
      ...cloneData(pack),
      sourceModule: owner,
      enabled,
      priority: Number.isFinite(Number(pack.priority)) ? Number(pack.priority) : DEFAULTS.packPriority
    };
    this.#entries.set(stored.id, { owner, pack: stored });
    return cloneData(stored);
  }

  get(id) {
    const entry = this.#entries.get(String(id));
    return entry ? cloneData(entry.pack) : null;
  }

  list({ owner = null, includeDisabled = true } = {}) {
    return [...this.#entries.values()]
      .filter(entry => !owner || entry.owner === owner)
      .filter(entry => includeDisabled || entry.pack.enabled)
      .map(entry => cloneData(entry.pack))
      .sort(compareByPriorityThenId);
  }

  isEnabled(id) {
    return this.#entries.get(String(id))?.pack.enabled === true;
  }

  async setEnabled(id, enabled) {
    const key = String(id);
    const entry = this.#entries.get(key);
    if (!entry) {
      throw new ChaseRegistryError(`Unknown chase pack '${id}'.`, {
        code: "CHASE_PACK_NOT_FOUND",
        details: { packId: id }
      });
    }
    entry.pack.enabled = enabled === true;
    await this.#stateStore.set(key, entry.pack.enabled);
    return cloneData(entry.pack);
  }

  unregister(id, owner) {
    const key = String(id);
    const existing = this.#entries.get(key);
    if (!existing) return false;
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`Chase pack '${id}' is owned by '${existing.owner}' and cannot be removed by '${owner}'.`, {
        code: "CHASE_PACK_OWNERSHIP",
        details: { packId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return this.#entries.delete(key);
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
    return new Map([...this.#entries.entries()].map(([id, entry]) => [id, { ...entry, pack: cloneData(entry.pack) }]));
  }

  restore(snapshot) {
    this.#entries = new Map([...snapshot.entries()].map(([id, entry]) => [id, { ...entry, pack: cloneData(entry.pack) }]));
  }
}
