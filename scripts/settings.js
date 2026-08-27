import { MODULE_ID } from "./core/constants.js";

export const SETTINGS = Object.freeze({
  CONTENT_PACK_STATES: "contentPackStates",
  STORAGE_VERSION: "storageVersion",
  VAULT_ID: "vaultId",
  VAULT_BACKUP: "vaultBackup",
  EFFECT_CONSEQUENCE_PRESENTATION: "effectConsequencePresentation"
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

  game.settings.register(MODULE_ID, SETTINGS.EFFECT_CONSEQUENCE_PRESENTATION, {
    name: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.Name",
    hint: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      runner: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.Runner",
      dialog: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.Dialog",
      chatGm: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.ChatGm",
      chatPublic: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.ChatPublic",
      automatic: "PF2E_CHASE_FORGE.Settings.EffectConsequencePresentation.Automatic"
    },
    default: "runner"
  });
  game.settings.register(MODULE_ID, SETTINGS.VAULT_BACKUP, {
    name: "PF2E Chase Forge protected vault backup",
    hint: "Internal recovery copy of Chase Forge persistence data. Used only if the protected Journal vault is unexpectedly removed.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
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


export const EFFECT_CONSEQUENCE_PRESENTATION_MODES = Object.freeze(["runner", "dialog", "chatGm", "chatPublic", "automatic"]);

export function getEffectConsequencePresentationMode() {
  try {
    const value = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.EFFECT_CONSEQUENCE_PRESENTATION);
    return EFFECT_CONSEQUENCE_PRESENTATION_MODES.includes(value) ? value : "runner";
  } catch (_error) {
    return "runner";
  }
}
