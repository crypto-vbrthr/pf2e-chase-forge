import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SCHEMA_VERSIONS } from "../scripts/core/constants.js";
import { createRegistryService } from "../scripts/registries/registry-service.js";
import { createRouteGraphEngine } from "../scripts/engine/route-graph-engine.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";
import { createChasePersistenceService } from "../scripts/persistence/persistence-service.js";
import { createMemoryChaseStore } from "../scripts/persistence/memory-store.js";
import { createDefaultPersistenceState, validatePersistenceState } from "../scripts/persistence/state.js";
import { sampleBlueprint, sampleCard } from "./helpers.js";

function setup(initial = null) {
  const registries = createRegistryService();
  registries.registerPack(MODULE_ID, { id: "core", label: "Core", cards: [sampleCard()], templates: [] });
  const route = createRouteGraphEngine();
  const rules = createChaseRulesEngine({ registries, routeEngine: route });
  const store = createMemoryChaseStore(initial);
  const persistence = createChasePersistenceService({ store, routeEngine: route, rulesEngine: rules, registries });
  return { persistence, store, registries, route, rules };
}

test("persistence state normalizes and validates", () => {
  const state = createDefaultPersistenceState();
  const result = validatePersistenceState(state);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.state.schemaVersion, SCHEMA_VERSIONS.persistence);
});

test("BlueprintRepository supports create, save, duplicate, list, and delete", async () => {
  const { persistence } = setup();
  const created = await persistence.blueprints.create(sampleBlueprint());
  assert.equal((await persistence.blueprints.list()).length, 1);
  const saved = await persistence.blueprints.save({ ...created, name: "Changed" });
  assert.equal(saved.name, "Changed");
  const duplicate = await persistence.blueprints.duplicate(created.id);
  assert.notEqual(duplicate.id, created.id);
  assert.equal(duplicate.metadata.duplicatedFrom, created.id);
  assert.equal((await persistence.blueprints.list()).length, 2);
  assert.equal(await persistence.blueprints.delete(created.id), true);
  assert.equal((await persistence.blueprints.get(created.id)), null);
});

test("stable Chase references round-trip", async () => {
  const { persistence } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const reference = persistence.blueprints.reference(blueprint.id);
  assert.equal(reference, `ChaseBlueprint.${blueprint.id}`);
  assert.deepEqual(persistence.references.parse(reference), { type: "blueprint", id: blueprint.id, reference });
  assert.equal((await persistence.blueprints.get(reference)).id, blueprint.id);
});

test("Blueprint JSON export and import migrates older blueprint schema and defaults to a fresh id", async () => {
  const { persistence } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const json = await persistence.blueprints.exportJson(blueprint.id);
  const envelope = JSON.parse(json);
  envelope.blueprint.schemaVersion = 1;
  delete envelope.blueprint.contentSnapshots;
  const imported = await persistence.blueprints.importJson(JSON.stringify(envelope));
  assert.notEqual(imported.id, blueprint.id);
  assert.equal(imported.schemaVersion, SCHEMA_VERSIONS.blueprint);
  assert.equal(imported.metadata.importedFromId, blueprint.id);
});

test("snapshot content freezes referenced Chase Cards and supports later missing add-ons", async () => {
  const { persistence, registries, rules } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const frozen = await persistence.blueprints.freezeContent(blueprint.id);
  assert.equal(frozen.contentSnapshots.mode, "snapshot");
  assert.equal(frozen.contentSnapshots.cards[0].ref, "core:market-crowd");
  registries.unregisterPack(MODULE_ID, "core");
  const session = rules.initializeSession(frozen, { status: "active" });
  const obstacle = rules.currentObstacle(session, "runtime-heroes");
  assert.equal(obstacle.card.id, "core:market-crowd");
  const diagnostics = await persistence.blueprints.inspectReferences(frozen, { resolver: async () => ({ id: "resolved" }) });
  assert.equal(diagnostics.valid, true);
  assert.ok(diagnostics.issues.some(issue => issue.code === "SNAPSHOT_CARD_FALLBACK"));
});

test("multiple sessions created from one blueprint remain independent snapshots", async () => {
  const { persistence } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const one = await persistence.sessions.createFromBlueprint(blueprint.id);
  const two = await persistence.sessions.createFromBlueprint(blueprint.id);
  assert.notEqual(one.id, two.id);
  assert.equal(one.blueprintId, blueprint.id);
  assert.equal(two.blueprintId, blueprint.id);
  const modified = { ...one, round: 4, groups: one.groups.map(group => ({ ...group, position: { ...group.position, progress: 2 } })) };
  await persistence.sessions.save(modified);
  assert.equal((await persistence.sessions.get(one.id)).round, 4);
  assert.equal((await persistence.sessions.get(two.id)).round, 0);
  assert.equal((await persistence.blueprints.get(blueprint.id)).name, blueprint.name);
});

test("session creation enforces draft status even when options request active", async () => {
  const { persistence } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const session = await persistence.sessions.createFromBlueprint(blueprint.id, { status: "active", sessionId: "new-draft-override-test" });
  assert.equal(session.status, "draft");
  assert.equal(session.id, "new-draft-override-test");
  assert.equal((await persistence.sessions.get(session.id)).status, "draft");
});

test("session lifecycle persists start, pause, resume, and abort transitions", async () => {
  const { persistence } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  let session = await persistence.sessions.createFromBlueprint(blueprint.id);
  assert.equal(session.status, "draft");
  session = await persistence.sessions.start(session.id);
  assert.equal(session.status, "active");
  session = await persistence.sessions.pause(session.id);
  assert.equal(session.status, "paused");
  session = await persistence.sessions.resume(session.id);
  assert.equal(session.status, "active");
  session = await persistence.sessions.abort(session.id);
  assert.equal(session.status, "aborted");
  assert.ok(session.endedAt);
});

test("persistence survives service recreation against the same store", async () => {
  const first = setup();
  const blueprint = await first.persistence.blueprints.create(sampleBlueprint());
  const session = await first.persistence.sessions.createFromBlueprint(blueprint.id);
  await first.persistence.sessions.save({ ...session, round: 3 });

  const route = createRouteGraphEngine();
  const rules = createChaseRulesEngine({ registries: first.registries, routeEngine: route });
  const second = createChasePersistenceService({ store: first.store, routeEngine: route, rulesEngine: rules, registries: first.registries });
  assert.equal((await second.blueprints.get(blueprint.id)).id, blueprint.id);
  assert.equal((await second.sessions.get(session.id)).round, 3);
});

test("finish stores both completed session and ChaseResult", async () => {
  const { persistence, rules } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const session = await persistence.sessions.createFromBlueprint(blueprint.id);
  const evaluation = Object.freeze({ ended: true, outcome: "quarryCaught", winnerGroupIds: [session.groups[0].id], loserGroupIds: [], endingNodeId: "obstacle-1", reason: "test", details: {} });
  const finished = await persistence.sessions.finish(session.id, evaluation);
  assert.equal(finished.session.status, "completed");
  assert.equal((await persistence.results.list({ sessionId: session.id })).length, 1);
  assert.equal((await persistence.sessions.get(session.id)).status, "completed");
});

test("snapshot mode prefers frozen card data over later live registry changes", async () => {
  const { persistence, registries, rules } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  const frozen = await persistence.blueprints.freezeContent(blueprint.id);
  registries.registerPack(MODULE_ID, { id: "core", label: "Core changed", cards: [sampleCard({ name: "Changed Live Card", obstacle: { requiredPoints: 9 } })], templates: [] }, { replace: true });
  const session = rules.initializeSession(frozen, { status: "active" });
  const obstacle = rules.currentObstacle(session, "runtime-heroes");
  assert.equal(obstacle.card.name, "Market Crowd");
  assert.equal(obstacle.requiredPoints, 3);
});

test("future Blueprint schemas are rejected on JSON import", async () => {
  const { persistence } = setup();
  const raw = sampleBlueprint();
  raw.schemaVersion = SCHEMA_VERSIONS.blueprint + 1;
  await assert.rejects(() => persistence.blueprints.importJson(JSON.stringify(raw)), error => error.code === "IMPORT_BLUEPRINT_SCHEMA_FUTURE");
});

test("reference diagnostics fail clearly when a card has neither live content nor a snapshot", async () => {
  const { persistence, registries } = setup();
  const blueprint = await persistence.blueprints.create(sampleBlueprint());
  registries.unregisterPack(MODULE_ID, "core");
  const diagnostics = await persistence.blueprints.inspectReferences(blueprint, { resolver: async () => ({ id: "resolved" }) });
  assert.equal(diagnostics.valid, false);
  assert.ok(diagnostics.issues.some(issue => issue.code === "MISSING_CARD"));
});

test("persistence retries a transaction after an optimistic revision conflict", async () => {
  const base = createMemoryChaseStore();
  let saveCalls = 0;
  const store = {
    async initialize() { return base.initialize(); },
    async load() { return base.load(); },
    async save(state, options = {}) {
      saveCalls += 1;
      if (saveCalls === 1) {
        // Simulate another GM committing revision +1 after this client read its draft.
        base.state = { ...base.state, revision: Number(base.state.revision ?? 0) + 1 };
      }
      return base.save(state, options);
    },
    getStatus() { return base.getStatus(); }
  };

  const registries = createRegistryService();
  registries.registerPack(MODULE_ID, { id: "core", label: "Core", cards: [sampleCard()], templates: [] });
  const route = createRouteGraphEngine();
  const rules = createChaseRulesEngine({ registries, routeEngine: route });
  const persistence = createChasePersistenceService({ store, routeEngine: route, rulesEngine: rules, registries });

  const created = await persistence.blueprints.create(sampleBlueprint());
  assert.equal(created.id, sampleBlueprint().id);
  assert.equal(saveCalls, 2);
  assert.equal((await persistence.blueprints.list()).length, 1);
  assert.equal((await base.load()).revision, 2);
});
