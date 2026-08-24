import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, MODULE_VERSION } from "../scripts/core/constants.js";

test("Foundry init registers hidden pack state storage and exposes the dev.2 API before ready", async () => {
  const onceHandlers = new Map();
  const calls = [];
  const settingDefinitions = new Map();
  const settingValues = new Map();
  const moduleRecord = { id: MODULE_ID, version: MODULE_VERSION, api: null };

  globalThis.Hooks = {
    once(name, callback) { onceHandlers.set(name, callback); },
    callAll(name, ...args) { calls.push({ name, args }); }
  };
  globalThis.game = {
    user: { isGM: true },
    modules: new Map([[MODULE_ID, moduleRecord]]),
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

  try {
    await import(`../scripts/main.js?foundry-smoke=${Date.now()}`);
    assert.equal(typeof onceHandlers.get("init"), "function");
    assert.equal(typeof onceHandlers.get("ready"), "function");

    onceHandlers.get("init")();
    assert.ok(settingDefinitions.has(`${MODULE_ID}.contentPackStates`));
    assert.equal(settingDefinitions.get(`${MODULE_ID}.contentPackStates`).config, false);
    assert.equal(moduleRecord.api.moduleVersion, MODULE_VERSION);
    assert.equal(moduleRecord.api.getCapabilities().registries, true);

    onceHandlers.get("ready")();
    assert.equal(calls.at(-1).name, "pf2eChaseForge.ready");
    assert.equal(calls.at(-1).args[0], moduleRecord.api);
  } finally {
    delete globalThis.Hooks;
    delete globalThis.game;
  }
});
