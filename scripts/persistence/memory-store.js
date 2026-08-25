import { cloneData } from "../data/utils.js";
import { ChasePersistenceError } from "../core/errors.js";
import { createDefaultPersistenceState, normalizePersistenceState } from "./state.js";

export class MemoryChaseStore {
  constructor(initialState = null) {
    this.state = normalizePersistenceState(initialState ?? createDefaultPersistenceState());
    this.initialized = false;
  }
  async initialize() { this.initialized = true; return this.getStatus(); }
  async load() { if (!this.initialized) await this.initialize(); return cloneData(this.state); }
  async save(state, { expectedRevision = null } = {}) {
    if (!this.initialized) await this.initialize();
    if (expectedRevision !== null && Number(this.state.revision) !== Number(expectedRevision)) {
      throw new ChasePersistenceError("Chase Forge persistence changed before this transaction could be saved.", {
        code: "PERSISTENCE_REVISION_CONFLICT",
        details: { expectedRevision, actualRevision: this.state.revision }
      });
    }
    this.state = normalizePersistenceState(cloneData(state));
    return cloneData(this.state);
  }
  getStatus() { return { available: true, protected: false, backend: "memory", initialized: this.initialized }; }
}

export function createMemoryChaseStore(initialState = null) { return new MemoryChaseStore(initialState); }
