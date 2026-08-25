import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, MODULE_VERSION } from "../scripts/core/constants.js";

test("Foundry init registers Core generator templates, protected persistence, and the Builder API before ready", async () => {
  const onceHandlers = new Map();
  const calls = [];
  const settingDefinitions = new Map();
  const settingValues = new Map();
  const moduleRecord = { id: MODULE_ID, version: MODULE_VERSION, api: null };
  const journal = new Map();
  let journalCounter = 0;

  globalThis.Hooks = {
    once(name, callback) { onceHandlers.set(name, callback); },
    callAll(name, ...args) { calls.push({ name, args }); }
  };
  globalThis.game = {
    user: { isGM: true },
    modules: new Map([[MODULE_ID, moduleRecord]]),
    journal,
    users: [{ id: "gm", isGM: true }],
    settings: {
      register(moduleId, key, definition) {
        settingDefinitions.set(`${moduleId}.${key}`, definition);
        settingValues.set(`${moduleId}.${key}`, definition.default);
      },
      get(moduleId, key) {
        return settingValues.get(`${moduleId}.${key}`);
      },
      async set(moduleId, key, value) {
        settingValues.set(`${moduleId}.${key}`, value);
        return value;
      }
    }
  };

  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
  globalThis.CONFIG = { TextEditor: { enrichers: [] } };
  globalThis.JournalEntry = class {
    static async create(data) {
      const id = `vault-${++journalCounter}`;
      const doc = {
        id, ownership: structuredClone(data.ownership), flags: structuredClone(data.flags),
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = structuredClone(value); return value; },
        async update(changes) { if (changes.ownership) this.ownership = structuredClone(changes.ownership); return this; }
      };
      journal.set(id, doc);
      return doc;
    }
  };

  try {
    await import(`../scripts/main.js?foundry-smoke=${Date.now()}`);
    assert.equal(typeof onceHandlers.get("init"), "function");
    assert.equal(typeof onceHandlers.get("ready"), "function");

    onceHandlers.get("init")();
    assert.ok(settingDefinitions.has(`${MODULE_ID}.contentPackStates`));
    assert.ok(settingDefinitions.has(`${MODULE_ID}.storageVersion`));
    assert.ok(settingDefinitions.has(`${MODULE_ID}.vaultId`));
    assert.ok(settingDefinitions.has(`${MODULE_ID}.vaultBackup`));
    assert.equal(settingDefinitions.get(`${MODULE_ID}.contentPackStates`).config, false);
    assert.equal(moduleRecord.api.moduleVersion, MODULE_VERSION);
    assert.equal(moduleRecord.api.getCapabilities().registries, true);
    assert.equal(moduleRecord.api.getCapabilities().routeGraphEngine, true);
    assert.equal(moduleRecord.api.getCapabilities().rulesEngine, true);
    assert.equal(moduleRecord.api.pf2e.dc.level(10), 27);
    assert.equal(moduleRecord.api.getCapabilities().persistence, true);
    assert.equal(moduleRecord.api.getCapabilities().basicBuilder, true);
    assert.equal(moduleRecord.api.getCapabilities().generatorTemplates, true);
    assert.equal(moduleRecord.api.generator.listTemplates().length, 5);
    assert.equal(moduleRecord.api.cards.list().length, 72);
    assert.equal(moduleRecord.api.getCapabilities().builderUi, true);
    assert.equal(typeof moduleRecord.api.ui.openBuilder, "function");
    assert.equal(typeof moduleRecord.api.ui.debugBuilderLayout, "function");
    assert.equal(moduleRecord.api.getCapabilities().playerView, true);
    assert.equal(moduleRecord.api.getCapabilities().sessionSync, true);
    assert.equal(typeof moduleRecord.api.ui.openPlayerView, "function");
    assert.equal(moduleRecord.api.getCapabilities().journalIntegration, true);
    assert.equal(moduleRecord.api.contracts.journalIntegration, 1);
    assert.equal(moduleRecord.api.journal.isRegistered(), true);
    assert.equal(globalThis.CONFIG.TextEditor.enrichers.length, 2);

    await onceHandlers.get("ready")();
    assert.equal(journal.size, 1);
    assert.equal(moduleRecord.api.persistence.status().protected, true);
    assert.equal(calls.at(-1).name, "pf2eChaseForge.ready");
    assert.equal(calls.at(-1).args[0], moduleRecord.api);
  } finally {
    delete globalThis.Hooks;
    delete globalThis.game;
    delete globalThis.JournalEntry;
    delete globalThis.CONST;
    delete globalThis.CONFIG;
  }
});
