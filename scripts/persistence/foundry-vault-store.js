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
function isVaultDocument(document) {
  const meta = storageMeta(document);
  return meta?.internal === true && meta?.kind === PERSISTENCE_STORAGE.KIND_VAULT;
}
function i18n(key, fallback) {
  try {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch (_error) { return fallback; }
}
function notifyRecovery(kind) {
  const ui = globalThis.ui;
  if (kind === "backup") {
    ui?.notifications?.warn?.(i18n("PF2E_CHASE_FORGE.Persistence.VaultRecoveredBackup", "Chase Forge restored its protected data vault from the recovery backup."));
  } else if (kind === "empty") {
    ui?.notifications?.warn?.(i18n("PF2E_CHASE_FORGE.Persistence.VaultRecreatedEmpty", "The Chase Forge data vault had been deleted. A new empty vault was created because no recovery backup was available."), { permanent: true });
  }
}

function requireGm() {
  if (globalThis.game?.user?.isGM !== true) throw new ChasePersistenceError("GM access is required for canonical Chase Forge persistence.", { code: "GM_REQUIRED" });
}

export class FoundryChaseVaultStore {
  constructor() { this._vault = null; this._initialized = false; this._lastRecovery = null; }

  isVaultDocument(document) { return isVaultDocument(document); }

  _worldVaultById(id) {
    if (!id) return null;
    return globalThis.game?.journal?.get?.(String(id)) ?? null;
  }

  _currentVaultIsPresent() {
    if (!this._vault?.id) return false;
    const current = this._worldVaultById(this._vault.id);
    return this.isVaultDocument(current);
  }

  _readBackup() {
    let raw = null;
    try { raw = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.VAULT_BACKUP) ?? null; }
    catch (_error) { return null; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0) return null;
    try {
      const state = normalizePersistenceState(cloneData(raw));
      const validation = validatePersistenceState(state);
      return validation.valid ? cloneData(validation.state) : null;
    } catch (_error) { return null; }
  }

  async _writeBackup(state) {
    if (!globalThis.game?.settings?.set) return;
    try { await game.settings.set(MODULE_ID, SETTINGS.VAULT_BACKUP, cloneData(state)); }
    catch (error) { console.warn(`${MODULE_ID} | Unable to update protected persistence recovery backup.`, error); }
  }

  async initialize() {
    requireGm();
    if (this._initialized && this._currentVaultIsPresent()) return this.getStatus();
    if (this._initialized && !this._currentVaultIsPresent()) {
      this._initialized = false;
      this._vault = null;
    }

    const configuredId = String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "");
    let vault = configuredId ? this._worldVaultById(configuredId) : null;
    if (!this.isVaultDocument(vault)) vault = values(game.journal).find(document => this.isVaultDocument(document)) ?? null;

    const storageVersion = Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0);
    this._lastRecovery = null;
    if (!vault && storageVersion >= PERSISTENCE_STORAGE.VERSION) {
      const backup = this._readBackup();
      if (backup) {
        vault = await this._createVault({ state: backup, recoveredFrom: "backup" });
        this._lastRecovery = "backup";
        console.warn(`${MODULE_ID} | Protected persistence vault was missing and has been restored from the recovery backup.`);
        notifyRecovery("backup");
      } else {
        vault = await this._createVault({ state: createDefaultPersistenceState(), recoveredFrom: "empty" });
        this._lastRecovery = "empty";
        console.error(`${MODULE_ID} | Protected persistence vault was missing and no recovery backup existed. A new empty vault was created.`);
        notifyRecovery("empty");
      }
    }
    if (!vault) vault = await this._createVault();

    this._vault = vault;
    await this._enforceOwnership(vault);
    if (String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "") !== String(vault.id)) await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, String(vault.id));
    if (storageVersion !== PERSISTENCE_STORAGE.VERSION) await game.settings.set(MODULE_ID, SETTINGS.STORAGE_VERSION, PERSISTENCE_STORAGE.VERSION);
    const state = normalizePersistenceState(cloneData(storedState(vault) ?? createDefaultPersistenceState()));
    const validation = validatePersistenceState(state);
    if (validation.valid) await this._writeBackup(validation.state);
    this._initialized = true;
    return this.getStatus();
  }

  async _createVault({ state = createDefaultPersistenceState(), recoveredFrom = null } = {}) {
    const JournalEntryClass = globalThis.JournalEntry ?? globalThis.getDocumentClass?.("JournalEntry");
    if (!JournalEntryClass?.create) throw new ChasePersistenceError("Foundry JournalEntry creation is unavailable.", { code: "JOURNAL_CREATE_UNAVAILABLE" });
    const document = await JournalEntryClass.create({
      name: "PF2E Chase Forge · Protected Data · DO NOT DELETE",
      ownership: { default: ownershipNone() },
      flags: {
        [MODULE_ID]: {
          [PERSISTENCE_STORAGE.FLAG_META]: {
            internal: true,
            kind: PERSISTENCE_STORAGE.KIND_VAULT,
            storageVersion: PERSISTENCE_STORAGE.VERSION,
            createdAt: nowIso(),
            ...(recoveredFrom ? { recoveredAt: nowIso(), recoveredFrom } : {})
          },
          [PERSISTENCE_STORAGE.FLAG_STATE]: cloneData(state)
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
    const changes = {};
    if (JSON.stringify(current) !== JSON.stringify(desired)) changes.ownership = desired;
    const protectedName = "PF2E Chase Forge · Protected Data · DO NOT DELETE";
    if (String(vault.name ?? "") !== protectedName) changes.name = protectedName;
    if (Object.keys(changes).length > 0) await vault.update(changes, { render: false });
  }

  async load() {
    requireGm();
    if (!this._initialized || !this._currentVaultIsPresent()) await this.initialize();
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
    if (!this._initialized || !this._currentVaultIsPresent()) await this.initialize();
    const validation = validatePersistenceState(state);
    if (!validation.valid) throw new ChasePersistenceError("Refusing to save invalid Chase Forge persistence state.", { code: "INVALID_PERSISTENCE_STATE", details: validation.errors });
    await this._vault.setFlag(MODULE_ID, PERSISTENCE_STORAGE.FLAG_STATE, cloneData(validation.state));
    await this._writeBackup(validation.state);
    return cloneData(validation.state);
  }

  getStatus() {
    return {
      available: globalThis.game?.user?.isGM === true,
      protected: true,
      backend: "journalVault",
      storageVersion: Number(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0),
      vaultId: this._vault?.id ?? String(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.VAULT_ID) ?? ""),
      initialized: this._initialized,
      lastRecovery: this._lastRecovery
    };
  }
}

export function registerFoundryChaseVaultProtectionHooks() {
  const Hooks = globalThis.Hooks;
  if (!Hooks?.on) return false;
  Hooks.on("preDeleteJournalEntry", document => {
    if (!isVaultDocument(document)) return true;
    if (globalThis.game?.user?.isGM !== true) return false;
    globalThis.ui?.notifications?.warn?.(i18n(
      "PF2E_CHASE_FORGE.Persistence.VaultDeleteBlocked",
      "This Journal entry contains protected Chase Forge data and cannot be deleted while Chase Forge is active. Disable the module first if you intentionally want to remove it."
    ));
    console.warn(`${MODULE_ID} | Blocked deletion of the protected persistence vault '${document.id}'.`);
    return false;
  });
  return true;
}

export function createFoundryChaseVaultStore() { return new FoundryChaseVaultStore(); }
