import { cloneData } from "../data/utils.js";
import { createDefaultPersistenceState, normalizePersistenceState } from "./state.js";

export class MemoryChaseStore {
  constructor(initialState = null) {
    this.state = normalizePersistenceState(initialState ?? createDefaultPersistenceState());
    this.initialized = false;
  }
  async initialize() { this.initialized = true; return this.getStatus(); }
  async load() { if (!this.initialized) await this.initialize(); return cloneData(this.state); }
  async save(state) { if (!this.initialized) await this.initialize(); this.state = normalizePersistenceState(cloneData(state)); return cloneData(this.state); }
  getStatus() { return { available: true, protected: false, backend: "memory", initialized: this.initialized }; }
}

export function createMemoryChaseStore(initialState = null) { return new MemoryChaseStore(initialState); }
