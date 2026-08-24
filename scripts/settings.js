import { MODULE_ID } from "./core/constants.js";

export const SETTINGS = Object.freeze({
  CONTENT_PACK_STATES: "contentPackStates",
  STORAGE_VERSION: "storageVersion",
  VAULT_ID: "vaultId"
});

export function registerSettings() {
  if (!globalThis.game?.settings?.register) return;
  game.settings.register(MODULE_ID, SETTINGS.CONTENT_PACK_STATES, {
    name: "PF2E Chase Forge content pack states",
    hint: "Internal storage for Chase Forge content-pack activation.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, SETTINGS.STORAGE_VERSION, {
    name: "PF2E Chase Forge storage version",
    hint: "Internal protected persistence schema marker.",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  game.settings.register(MODULE_ID, SETTINGS.VAULT_ID, {
    name: "PF2E Chase Forge protected vault id",
    hint: "Internal reference to the ownership-protected Chase Forge persistence document.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

export class FoundryPackStateStore {
  get(packId) {
    try {
      const states = game?.settings?.get?.(MODULE_ID, SETTINGS.CONTENT_PACK_STATES) ?? {};
      return Object.prototype.hasOwnProperty.call(states, packId) ? states[packId] === true : null;
    } catch (_error) {
      return null;
    }
  }

  async set(packId, enabled) {
    const states = { ...(game?.settings?.get?.(MODULE_ID, SETTINGS.CONTENT_PACK_STATES) ?? {}) };
    states[packId] = enabled === true;
    if (game?.settings?.set) await game.settings.set(MODULE_ID, SETTINGS.CONTENT_PACK_STATES, states);
    return states[packId];
  }
}
