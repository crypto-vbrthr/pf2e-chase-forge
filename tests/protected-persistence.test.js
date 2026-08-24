import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, PERSISTENCE_STORAGE } from "../scripts/core/constants.js";
import { SETTINGS } from "../scripts/settings.js";
import { createFoundryChaseVaultStore } from "../scripts/persistence/foundry-vault-store.js";
import { sampleBlueprint } from "./helpers.js";
import { createChasePersistenceService } from "../scripts/persistence/persistence-service.js";
import { createRouteGraphEngine } from "../scripts/engine/route-graph-engine.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";

class MockJournal {
  constructor(data, collection) { this.id = `vault-${collection.size + 1}`; this.name = data.name; this.ownership = structuredClone(data.ownership); this.flags = structuredClone(data.flags); this.collection = collection; }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = structuredClone(value); return value; }
  async update(changes) { if (changes.ownership) this.ownership = structuredClone(changes.ownership); return this; }
}

function foundryHarness({ isGM = true } = {}) {
  const journal = new Map();
  const values = new Map([
    [`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, 0],
    [`${MODULE_ID}.${SETTINGS.VAULT_ID}`, ""]
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

test("protected store fails closed if storage marker exists but the vault vanished", async () => {
  const h = foundryHarness();
  try {
    h.values.set(`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, PERSISTENCE_STORAGE.VERSION);
    h.values.set(`${MODULE_ID}.${SETTINGS.VAULT_ID}`, "missing-vault");
    const store = createFoundryChaseVaultStore();
    await assert.rejects(() => store.initialize(), error => error.code === "VAULT_MISSING");
  } finally { h.cleanup(); }
});
