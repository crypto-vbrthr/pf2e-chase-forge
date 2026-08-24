import { MODULE_ID, PERSISTENCE_STORAGE } from "../core/constants.js";
import { ChasePersistenceError } from "../core/errors.js";
import { cloneData, nowIso } from "../data/utils.js";
import { SETTINGS } from "../settings.js";
import { createDefaultPersistenceState, inspectPersistenceCompatibility, normalizePersistenceState, validatePersistenceState } from "./state.js";

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function ownershipNone() { return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0; }
function storageMeta(document) { return document?.getFlag?.(MODULE_ID, PERSISTENCE_STORAGE.FLAG_META) ?? document?.flags?.[MODULE_ID]?.[PERSISTENCE_STORAGE.FLAG_META] ?? null; }
function storedState(document) { return document?.getFlag?.(MODULE_ID, PERSISTENCE_STORAGE.FLAG_STATE) ?? document?.flags?.[MODULE_ID]?.[PERSISTENCE_STORAGE.FLAG_STATE] ?? null; }

function requireGm() {
  if (globalThis.game?.user?.isGM !== true) throw new ChasePersistenceError("GM access is required for canonical Chase Forge persistence.", { code: "GM_REQUIRED" });
}

export class FoundryChaseVaultStore {
  constructor() { this._vault = null; this._initialized = false; }

  isVaultDocument(document) {
    const meta = storageMeta(document);
    return meta?.internal === true && meta?.kind === PERSISTENCE_STORAGE.KIND_VAULT;
  }

  async initialize() {
    requireGm();
    if (this._initialized && this._vault) return this.getStatus();
    const configuredId = String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "");
    let vault = configuredId ? game.journal?.get?.(configuredId) ?? null : null;
    if (!this.isVaultDocument(vault)) vault = values(game.journal).find(document => this.isVaultDocument(document)) ?? null;

    const storageVersion = Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0);
    if (!vault && storageVersion >= PERSISTENCE_STORAGE.VERSION) {
      throw new ChasePersistenceError("The protected Chase Forge persistence vault is missing.", { code: "VAULT_MISSING", details: { configuredId, storageVersion } });
    }
    if (!vault) vault = await this._createVault();

    this._vault = vault;
    await this._enforceOwnership(vault);
    if (String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "") !== String(vault.id)) await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, String(vault.id));
    if (storageVersion !== PERSISTENCE_STORAGE.VERSION) await game.settings.set(MODULE_ID, SETTINGS.STORAGE_VERSION, PERSISTENCE_STORAGE.VERSION);
    this._initialized = true;
    return this.getStatus();
  }

  async _createVault() {
    const JournalEntryClass = globalThis.JournalEntry ?? globalThis.getDocumentClass?.("JournalEntry");
    if (!JournalEntryClass?.create) throw new ChasePersistenceError("Foundry JournalEntry creation is unavailable.", { code: "JOURNAL_CREATE_UNAVAILABLE" });
    const document = await JournalEntryClass.create({
      name: "PF2E Chase Forge · Protected Data",
      ownership: { default: ownershipNone() },
      flags: {
        [MODULE_ID]: {
          [PERSISTENCE_STORAGE.FLAG_META]: { internal: true, kind: PERSISTENCE_STORAGE.KIND_VAULT, storageVersion: PERSISTENCE_STORAGE.VERSION, createdAt: nowIso() },
          [PERSISTENCE_STORAGE.FLAG_STATE]: createDefaultPersistenceState()
        }
      }
    }, { renderSheet: false });
    if (!document) throw new ChasePersistenceError("Unable to create the protected Chase Forge persistence vault.", { code: "VAULT_CREATE_FAILED" });
    await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, String(document.id));
    return document;
  }

  async _enforceOwnership(vault) {
    const desired = { default: ownershipNone() };
    const current = vault.ownership ?? {};
    const gmIds = new Set(values(game.users).filter(user => user?.isGM).map(user => String(user.id)));
    for (const [userId, level] of Object.entries(current)) {
      if (userId === "default") continue;
      if (gmIds.has(String(userId))) desired[userId] = Number(level);
    }
    if (JSON.stringify(current) !== JSON.stringify(desired)) await vault.update({ ownership: desired }, { render: false });
  }

  async load() {
    requireGm();
    if (!this._initialized) await this.initialize();
    if (!this._vault || !this.isVaultDocument(this._vault)) throw new ChasePersistenceError("The protected Chase Forge persistence vault is unavailable.", { code: "VAULT_UNAVAILABLE" });
    const raw = cloneData(storedState(this._vault) ?? createDefaultPersistenceState());
    const compatibility = inspectPersistenceCompatibility(raw);
    if (!compatibility.compatible) {
      throw new ChasePersistenceError("The protected Chase Forge persistence state contains newer unsupported schemas.", { code: "PERSISTENCE_SCHEMA_FUTURE", details: compatibility.issues });
    }
    const state = normalizePersistenceState(raw);
    const validation = validatePersistenceState(state);
    if (!validation.valid) throw new ChasePersistenceError("The protected Chase Forge persistence state is invalid.", { code: "INVALID_PERSISTENCE_STATE", details: validation.errors });
    return cloneData(validation.state);
  }

  async save(state) {
    requireGm();
    if (!this._initialized) await this.initialize();
    const validation = validatePersistenceState(state);
    if (!validation.valid) throw new ChasePersistenceError("Refusing to save invalid Chase Forge persistence state.", { code: "INVALID_PERSISTENCE_STATE", details: validation.errors });
    await this._vault.setFlag(MODULE_ID, PERSISTENCE_STORAGE.FLAG_STATE, cloneData(validation.state));
    return cloneData(validation.state);
  }

  getStatus() {
    return {
      available: globalThis.game?.user?.isGM === true,
      protected: true,
      backend: "journalVault",
      storageVersion: Number(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0),
      vaultId: this._vault?.id ?? String(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.VAULT_ID) ?? ""),
      initialized: this._initialized
    };
  }
}

export function createFoundryChaseVaultStore() { return new FoundryChaseVaultStore(); }
