import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, PERSISTENCE_STORAGE } from "../scripts/core/constants.js";
import { SETTINGS } from "../scripts/settings.js";
import { createFoundryChaseVaultStore, registerFoundryChaseVaultProtectionHooks } from "../scripts/persistence/foundry-vault-store.js";
import { sampleBlueprint } from "./helpers.js";
import { createChasePersistenceService } from "../scripts/persistence/persistence-service.js";
import { createRouteGraphEngine } from "../scripts/engine/route-graph-engine.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";

class MockJournal {
  constructor(data, collection) { this.id = `vault-${collection.size + 1}`; this.name = data.name; this.ownership = structuredClone(data.ownership); this.flags = structuredClone(data.flags); this.collection = collection; }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = structuredClone(value); return value; }
  async update(changes) { if (changes.ownership) this.ownership = structuredClone(changes.ownership); if (changes.name) this.name = String(changes.name); return this; }
}

function foundryHarness({ isGM = true } = {}) {
  const journal = new Map();
  const values = new Map([
    [`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, 0],
    [`${MODULE_ID}.${SETTINGS.VAULT_ID}`, ""],
    [`${MODULE_ID}.${SETTINGS.VAULT_BACKUP}`, {}]
  ]);
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
  globalThis.game = {
    user: { id: isGM ? "gm" : "player", isGM },
    users: [{ id: "gm", isGM: true }, { id: "player", isGM: false }],
    journal,
    settings: {
      get(moduleId, key) { return values.get(`${moduleId}.${key}`); },
      async set(moduleId, key, value) { values.set(`${moduleId}.${key}`, structuredClone(value)); return value; }
    }
  };
  globalThis.JournalEntry = class {
    static async create(data) { const doc = new MockJournal(data, journal); journal.set(doc.id, doc); return doc; }
  };
  return { journal, values, cleanup() { delete globalThis.game; delete globalThis.JournalEntry; delete globalThis.CONST; } };
}

test("Foundry canonical persistence is stored in an ownership-protected JournalEntry flag", async () => {
  const h = foundryHarness();
  try {
    const store = createFoundryChaseVaultStore();
    await store.initialize();
    assert.equal(h.journal.size, 1);
    const vault = [...h.journal.values()][0];
    assert.equal(vault.ownership.default, 0);
    assert.match(vault.name, /DO NOT DELETE/);
    assert.equal(vault.getFlag(MODULE_ID, PERSISTENCE_STORAGE.FLAG_META).kind, "vault");
    assert.equal(h.values.get(`${MODULE_ID}.${SETTINGS.VAULT_ID}`), vault.id);
    assert.equal(h.values.get(`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`), PERSISTENCE_STORAGE.VERSION);
  } finally { h.cleanup(); }
});

test("protected Journal vault survives a simulated Foundry restart", async () => {
  const h = foundryHarness();
  try {
    const route = createRouteGraphEngine();
    const rules = createChaseRulesEngine({ routeEngine: route });
    const first = createChasePersistenceService({ store: createFoundryChaseVaultStore(), routeEngine: route, rulesEngine: rules });
    const blueprint = await first.blueprints.create(sampleBlueprint());
    const session = await first.sessions.createFromBlueprint(blueprint.id);
    await first.sessions.save({ ...session, round: 5 });

    const secondRoute = createRouteGraphEngine();
    const secondRules = createChaseRulesEngine({ routeEngine: secondRoute });
    const second = createChasePersistenceService({ store: createFoundryChaseVaultStore(), routeEngine: secondRoute, rulesEngine: secondRules });
    assert.equal((await second.blueprints.get(blueprint.id)).id, blueprint.id);
    assert.equal((await second.sessions.get(session.id)).round, 5);
    assert.equal(h.journal.size, 1);
  } finally { h.cleanup(); }
});

test("non-GM clients cannot load canonical persistence", async () => {
  const h = foundryHarness({ isGM: false });
  try {
    const store = createFoundryChaseVaultStore();
    await assert.rejects(() => store.load(), error => error.code === "GM_REQUIRED");
  } finally { h.cleanup(); }
});

test("protected store recreates an already-missing vault gracefully when no backup exists", async () => {
  const h = foundryHarness();
  try {
    h.values.set(`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, PERSISTENCE_STORAGE.VERSION);
    h.values.set(`${MODULE_ID}.${SETTINGS.VAULT_ID}`, "missing-vault");
    const store = createFoundryChaseVaultStore();
    const status = await store.initialize();
    assert.equal(status.lastRecovery, "empty");
    assert.equal(h.journal.size, 1);
    assert.notEqual(h.values.get(`${MODULE_ID}.${SETTINGS.VAULT_ID}`), "missing-vault");
    assert.deepEqual((await store.load()).blueprints, []);
  } finally { h.cleanup(); }
});

test("protected store restores a missing vault from the recovery backup", async () => {
  const h = foundryHarness();
  try {
    const route = createRouteGraphEngine();
    const rules = createChaseRulesEngine({ routeEngine: route });
    const firstStore = createFoundryChaseVaultStore();
    const first = createChasePersistenceService({ store: firstStore, routeEngine: route, rulesEngine: rules });
    const blueprint = await first.blueprints.create(sampleBlueprint());
    const oldVaultId = h.values.get(`${MODULE_ID}.${SETTINGS.VAULT_ID}`);
    assert.ok(h.values.get(`${MODULE_ID}.${SETTINGS.VAULT_BACKUP}`).blueprints.some(item => item.id === blueprint.id));
    h.journal.delete(oldVaultId);

    const secondStore = createFoundryChaseVaultStore();
    const status = await secondStore.initialize();
    assert.equal(status.lastRecovery, "backup");
    assert.equal(h.journal.size, 1);
    const restored = await secondStore.load();
    assert.equal(restored.blueprints.find(item => item.id === blueprint.id)?.id, blueprint.id);
  } finally { h.cleanup(); }
});

test("protected store notices deletion after initialization and restores before the next read", async () => {
  const h = foundryHarness();
  try {
    const route = createRouteGraphEngine();
    const rules = createChaseRulesEngine({ routeEngine: route });
    const store = createFoundryChaseVaultStore();
    const service = createChasePersistenceService({ store, routeEngine: route, rulesEngine: rules });
    const blueprint = await service.blueprints.create(sampleBlueprint());
    const oldVaultId = h.values.get(`${MODULE_ID}.${SETTINGS.VAULT_ID}`);
    h.journal.delete(oldVaultId);
    const listed = await service.blueprints.list();
    assert.equal(listed.find(item => item.id === blueprint.id)?.id, blueprint.id);
    assert.equal(h.journal.size, 1);
  } finally { h.cleanup(); }
});

test("vault protection hook vetoes deletion of the internal persistence Journal", async () => {
  const h = foundryHarness();
  const callbacks = new Map();
  globalThis.Hooks = { on(name, callback) { callbacks.set(name, callback); return 1; } };
  globalThis.ui = { notifications: { warn() {} } };
  try {
    const store = createFoundryChaseVaultStore();
    await store.initialize();
    const vault = [...h.journal.values()][0];
    assert.equal(registerFoundryChaseVaultProtectionHooks(), true);
    assert.equal(callbacks.get("preDeleteJournalEntry")?.(vault), false);
    assert.equal(callbacks.get("preDeleteJournalEntry")?.({ id: "normal", flags: {} }), true);
  } finally {
    delete globalThis.Hooks;
    delete globalThis.ui;
    h.cleanup();
  }
});
