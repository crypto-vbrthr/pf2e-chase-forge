import test from "node:test";
import assert from "node:assert/strict";
import { createEffectForgeBridge, inspectEffectForgeApi } from "../scripts/integrations/effect-forge-bridge.js";

function effectDefinition(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "pf2e-chase-forge.sprained-ankle",
    name: "Sprained Ankle",
    duration: { value: 10, unit: "minutes", expiry: null },
    components: [
      { type: "modifier", selector: "speed", value: -5, modifierType: "status" }
    ],
    application: {},
    metadata: { originModule: "pf2e-chase-forge" },
    ...overrides
  };
}

function mockApi(calls = []) {
  return {
    version: "0.9.6",
    moduleVersion: "1.0.1-rc.4",
    schemaVersion: 2,
    effects: {
      migrate(definition) {
        calls.push(["migrate", definition.id]);
        return { definition: structuredClone(definition), fromVersion: definition.schemaVersion, toVersion: 2, migrated: false, steps: [], warnings: [] };
      },
      analyze(definition) {
        calls.push(["analyze", definition.id]);
        return { valid: true, issues: [], errors: [], warnings: [], hints: [], information: [] };
      },
      async apply(definition, targets, options) {
        calls.push(["apply", definition.id, targets.map(target => target.uuid), options]);
        return targets.map((target, index) => ({ uuid: `${target.uuid}.Item.effect${index}` }));
      },
      async readItem(item) {
        calls.push(["readItem", item.uuid]);
        return { definition: effectDefinition({ id: "from-item" }), unmanagedRules: [{ key: "Custom" }] };
      },
      checkCompatibility(definition, target) {
        return { compatible: true, targetUuid: target.uuid, warnings: [], validation: { valid: true } };
      }
    },
    ui: {
      async openEffectForgeDefinition(definition) {
        calls.push(["openEditor", definition.id]);
        return definition.id;
      }
    }
  };
}

test("Effect Forge bridge reports unavailable Critical Forge without throwing", () => {
  const report = inspectEffectForgeApi(null);
  assert.equal(report.available, false);
  assert.equal(report.compatible, false);
  assert.equal(report.reason, "critical-forge-unavailable");
});

test("Effect Forge bridge validates the required public API surface", () => {
  const report = inspectEffectForgeApi(mockApi());
  assert.equal(report.available, true);
  assert.equal(report.compatible, true);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.capabilities.editor, true);
});

test("embedded Effect Forge definitions are migrated, analyzed, and applied through the public API", async () => {
  const calls = [];
  const bridge = createEffectForgeBridge({ apiResolver: () => mockApi(calls) });
  const target = { uuid: "Actor.hero1" };
  const result = await bridge.apply({ source: "embedded", definition: effectDefinition() }, target);
  assert.equal(result.definitionId, "pf2e-chase-forge.sprained-ankle");
  assert.deepEqual(result.targetUuids, ["Actor.hero1"]);
  assert.deepEqual(result.createdItemUuids, ["Actor.hero1.Item.effect0"]);
  assert.ok(calls.some(call => call[0] === "migrate"));
  assert.ok(calls.some(call => call[0] === "analyze"));
  assert.ok(calls.some(call => call[0] === "apply"));
});

test("item-backed Effect Forge consequences resolve the Item through UUID and preserve unmanaged rules", async () => {
  const calls = [];
  const item = { uuid: "Item.effect-source" };
  const bridge = createEffectForgeBridge({
    apiResolver: () => mockApi(calls),
    uuidResolver: async uuid => uuid === item.uuid ? item : null
  });
  const resolved = await bridge.resolveDefinition({ source: "item", uuid: item.uuid });
  assert.equal(resolved.definition.id, "from-item");
  assert.deepEqual(resolved.unmanagedRules, [{ key: "Custom" }]);
  assert.equal(resolved.itemUuid, item.uuid);
});

test("Effect Forge bridge can open the shared Effect Forge editor", async () => {
  const calls = [];
  const bridge = createEffectForgeBridge({ apiResolver: () => mockApi(calls) });
  const result = await bridge.openEditor({ source: "embedded", definition: effectDefinition() });
  assert.equal(result, "pf2e-chase-forge.sprained-ankle");
  assert.ok(calls.some(call => call[0] === "openEditor"));
});
