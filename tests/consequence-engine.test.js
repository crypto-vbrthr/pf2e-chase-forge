import test from "node:test";
import assert from "node:assert/strict";
import { createConsequenceEngine, createConsequenceOccurrence } from "../scripts/consequences/consequence-engine.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";
import { createChaseSession, createConsequence } from "../scripts/data/factories.js";
import { branchedGraph, sampleBlueprint, sampleCard, sampleSession } from "./helpers.js";

function unavailableBridge() {
  return {
    inspect: () => ({ available: false, compatible: false, reason: "critical-forge-unavailable" }),
    async apply() { throw new Error("should not be called"); }
  };
}

function availableBridge(calls = []) {
  return {
    inspect: () => ({ available: true, compatible: true, reason: null, schemaVersion: 2 }),
    async apply(reference, targets) {
      calls.push({ reference, targets });
      return {
        definitionId: reference.definition?.id ?? null,
        definitionName: reference.definition?.name ?? "Effect",
        source: reference.source,
        sourceItemUuid: reference.uuid ?? null,
        targetUuids: targets.map(target => target.uuid),
        createdItemUuids: targets.map(target => `${target.uuid}.Item.effect`),
        compatibility: [],
        migrated: false,
        fromSchemaVersion: 2,
        toSchemaVersion: 2
      };
    }
  };
}

function effectConsequence(overrides = {}) {
  return createConsequence({
    id: "sprained-ankle",
    kind: "effectForge",
    label: "Sprained Ankle",
    severity: "significant",
    source: "embedded",
    definition: {
      schemaVersion: 2,
      id: "pf2e-chase-forge.sprained-ankle",
      name: "Sprained Ankle",
      duration: { value: 10, unit: "minutes", expiry: null },
      components: [{ type: "modifier", selector: "speed", value: -5, modifierType: "status" }],
      application: {},
      metadata: {}
    },
    ...overrides
  });
}

test("consequence occurrence gets a stable id from the rules event", () => {
  const occurrence = createConsequenceOccurrence(effectConsequence(), {
    sourceEventId: "rules-event-1",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  assert.equal(occurrence.occurrenceId, "rules-event-1:sprained-ankle");
  assert.equal(occurrence.participantId, "hero-1");
});

test("GM-confirmed consequences remain pending until explicitly confirmed", async () => {
  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const occurrence = createConsequenceOccurrence(createConsequence({ id: "story", kind: "narrative", text: "You stumble." }), {
    sourceEventId: "event-1"
  });
  const pending = await engine.execute(sampleSession(), occurrence);
  assert.equal(pending.records[0].status, "pendingConfirmation");
  const confirmed = await engine.execute(pending.session, occurrence, { confirmedOccurrenceIds: [occurrence.occurrenceId] });
  assert.equal(confirmed.records[0].status, "applied");
  assert.equal(confirmed.records[0].message, "You stumble.");
});

test("route unlock and lock consequences mutate the session through the Route Graph Engine", async () => {
  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const blueprint = sampleBlueprint(branchedGraph());
  let session = createChaseSession({
    id: "branch-session",
    blueprintId: blueprint.id,
    blueprintSnapshot: blueprint,
    status: "active",
    round: 1,
    groups: [{
      id: "runtime-heroes",
      groupId: "heroes",
      participantIds: ["hero-1", "hero-2"],
      position: { nodeId: "choice", progress: 0 },
      routeHistory: ["start", "choice"],
      edgeHistory: ["e1"]
    }]
  });
  const unlock = createConsequenceOccurrence(createConsequence({ id: "unlock", kind: "routeUnlock", edgeIds: ["e7"], gmConfirmation: false }), { sourceEventId: "event-u", runtimeGroupId: "runtime-heroes" });
  const unlocked = await engine.execute(session, unlock);
  assert.deepEqual(unlocked.session.unlockedEdgeIds, ["e7"]);
  const lock = createConsequenceOccurrence(createConsequence({ id: "lock", kind: "routeLock", edgeIds: ["e7"], gmConfirmation: false }), { sourceEventId: "event-l", runtimeGroupId: "runtime-heroes" });
  const locked = await engine.execute(unlocked.session, lock);
  assert.deepEqual(locked.session.lockedEdgeIds, ["e7"]);
  assert.deepEqual(locked.session.unlockedEdgeIds, []);
});

test("routeSelect waits for GM/player route selection when multiple consequence edges are allowed", async () => {
  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const blueprint = sampleBlueprint(branchedGraph());
  const session = createChaseSession({
    id: "route-select-session",
    blueprintId: blueprint.id,
    blueprintSnapshot: blueprint,
    status: "active",
    round: 1,
    groups: [{
      id: "runtime-heroes",
      groupId: "heroes",
      participantIds: ["hero-1", "hero-2"],
      position: { nodeId: "choice", progress: 0 },
      routeHistory: ["start", "choice"],
      edgeHistory: ["e1"]
    }]
  });
  const occurrence = createConsequenceOccurrence(createConsequence({
    id: "forced-choice",
    kind: "routeSelect",
    edgeIds: ["e2", "e3"],
    gmConfirmation: false
  }), { sourceEventId: "event-choice", runtimeGroupId: "runtime-heroes" });
  const pending = await engine.execute(session, occurrence);
  assert.equal(pending.records[0].status, "pendingSelection");
  const selected = await engine.execute(pending.session, occurrence, { routeSelections: { [occurrence.occurrenceId]: "e3" } });
  assert.equal(selected.records[0].status, "applied");
  assert.equal(selected.session.groups[0].position.nodeId, "alley");
});

test("Effect Forge consequence targets the acting participant and stores only serializable application evidence", async () => {
  const calls = [];
  const engine = createConsequenceEngine({
    effectForgeBridge: availableBridge(calls),
    uuidResolver: async uuid => ({ uuid })
  });
  const occurrence = createConsequenceOccurrence(effectConsequence({ gmConfirmation: false }), {
    sourceEventId: "event-effect",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  const result = await engine.execute(sampleSession(), occurrence);
  assert.equal(result.records[0].status, "applied");
  assert.deepEqual(result.records[0].targetUuids, ["Actor.hero1"]);
  assert.deepEqual(result.records[0].result.createdItemUuids, ["Actor.hero1.Item.effect"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].targets[0].uuid, "Actor.hero1");
});

test("runtime-group Effect Forge targeting resolves every participant with a UUID", async () => {
  const calls = [];
  const engine = createConsequenceEngine({
    effectForgeBridge: availableBridge(calls),
    uuidResolver: async uuid => ({ uuid })
  });
  const occurrence = createConsequenceOccurrence(effectConsequence({ gmConfirmation: false, targetMode: "runtimeGroup" }), {
    sourceEventId: "event-group-effect",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  const result = await engine.execute(sampleSession(), occurrence);
  assert.deepEqual(result.records[0].targetUuids, ["Actor.hero1", "Actor.hero2"]);
});

test("missing optional Effect Forge becomes a manual fallback instead of breaking the chase", async () => {
  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const occurrence = createConsequenceOccurrence(effectConsequence({ gmConfirmation: false }), {
    sourceEventId: "event-fallback",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  const result = await engine.execute(sampleSession(), occurrence);
  assert.equal(result.records[0].status, "manualFallback");
  assert.equal(result.records[0].result.name, "Sprained Ankle");
});

test("missing required Effect Forge blocks only that consequence and preserves a valid Chase Session", async () => {
  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const occurrence = createConsequenceOccurrence(effectConsequence({ gmConfirmation: false, required: true }), {
    sourceEventId: "event-required",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  const result = await engine.execute(sampleSession(), occurrence);
  assert.equal(result.records[0].status, "blocked");
  assert.equal(result.session.status, "active");
});

test("consequence execution is idempotent for the same occurrence", async () => {
  const calls = [];
  const engine = createConsequenceEngine({
    effectForgeBridge: availableBridge(calls),
    uuidResolver: async uuid => ({ uuid })
  });
  const occurrence = createConsequenceOccurrence(effectConsequence({ gmConfirmation: false }), {
    sourceEventId: "event-idempotent",
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1"
  });
  const first = await engine.execute(sampleSession(), occurrence);
  const second = await engine.execute(first.session, occurrence);
  assert.equal(first.records[0].status, "applied");
  assert.equal(second.processed[0].idempotent, true);
  assert.equal(calls.length, 1);
});

test("PF2E Chase Rules Engine emits stable consequence occurrences for deferred effects", () => {
  const injury = effectConsequence({ gmConfirmation: true });
  const card = sampleCard({
    approaches: [{
      id: "athletics",
      label: "Jump",
      type: "check",
      statistic: "athletics",
      dc: { mode: "fixed", value: 15 },
      outcomes: {
        criticalSuccess: [],
        success: [],
        failure: [],
        criticalFailure: [
          createConsequence({ id: "point-loss", kind: "chasePoints", value: -1 }),
          injury
        ]
      }
    }]
  });
  const rules = createChaseRulesEngine({ cardResolver: id => id === card.id ? card : null });
  let session = rules.initializeSession(sampleBlueprint(), { status: "active" });
  session = rules.beginRound(session);
  const result = rules.applyDegree(session, {
    runtimeGroupId: "runtime-heroes",
    participantId: "hero-1",
    approachId: "athletics",
    degree: "criticalFailure"
  });
  assert.equal(result.deferredConsequences.length, 1);
  assert.equal(result.consequenceOccurrences.length, 1);
  assert.equal(result.consequenceOccurrences[0].consequence.id, "sprained-ankle");
  assert.ok(result.consequenceOccurrences[0].occurrenceId.startsWith("rules-event-"));
  assert.equal(result.consequenceOccurrences[0].sourceEventId, result.consequenceContext.sourceEventId);
});


test("route consequences are resolved before automatic post-obstacle advancement", async () => {
  const graph = {
    nodes: [
      { id: "start", type: "start", label: "Start", cardRef: null, metadata: {} },
      { id: "obstacle-1", type: "card", label: "Roof Gap", cardRef: "core:market-crowd", metadata: {} },
      { id: "normal-end", type: "end", label: "Street", cardRef: null, metadata: {} },
      { id: "shortcut-end", type: "end", label: "Tower", cardRef: null, metadata: {} }
    ],
    edges: [
      { id: "e1", from: "start", to: "obstacle-1", type: "normal", visibility: "public", label: "", conditions: [], metadata: {} },
      { id: "e2", from: "obstacle-1", to: "normal-end", type: "normal", visibility: "public", label: "", conditions: [], metadata: {} },
      { id: "shortcut", from: "obstacle-1", to: "shortcut-end", type: "shortcut", visibility: "discoverable", label: "", conditions: [], metadata: {} }
    ],
    startNodeId: "start",
    endNodeIds: ["normal-end", "shortcut-end"]
  };
  const unlock = createConsequence({ id: "discover-shortcut", kind: "routeUnlock", edgeIds: ["shortcut"], gmConfirmation: false });
  const card = sampleCard({
    obstacle: { requiredPoints: 1 },
    approaches: [{
      id: "athletics", label: "Jump", type: "check", statistic: "athletics", dc: { mode: "fixed", value: 15 },
      outcomes: {
        criticalSuccess: [],
        success: [createConsequence({ id: "point", kind: "chasePoints", value: 1 }), unlock],
        failure: [],
        criticalFailure: []
      }
    }]
  });
  const blueprint = sampleBlueprint(graph);
  const rules = createChaseRulesEngine({ cardResolver: id => id === card.id ? card : null });
  let session = rules.initializeSession(blueprint, { status: "active" });
  session = rules.beginRound(session);
  const resolved = rules.applyDegree(session, {
    runtimeGroupId: "runtime-heroes", participantId: "hero-1", approachId: "athletics", degree: "success"
  });
  assert.equal(resolved.obstacleCleared, true);
  assert.equal(resolved.routeResolutionDeferred, true);
  assert.equal(resolved.session.groups[0].position.nodeId, "obstacle-1");

  const engine = createConsequenceEngine({ effectForgeBridge: unavailableBridge() });
  const applied = await engine.executeRulesResult(resolved, { autoConfirm: true });
  assert.deepEqual(applied.session.unlockedEdgeIds, ["shortcut"]);
  assert.equal(applied.session.groups[0].position.nodeId, "obstacle-1");
  assert.deepEqual(applied.routeChoices, [{ runtimeGroupId: "runtime-heroes", edgeIds: ["e2", "shortcut"] }]);
});
