import test from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSIONS } from "../scripts/core/constants.js";
import {
  createChaseBlueprint,
  createChaseCard,
  createChasePack,
  createChasePublicState,
  createChaseResult,
  createChaseSession,
  createChaseTemplate,
  createConsequence,
  createParticipant,
  createParticipantGroup
} from "../scripts/data/factories.js";
import { branchedGraph, linearGraph, sampleBlueprint, sampleCard, sampleSession } from "./helpers.js";

test("core factories stamp schema versions", () => {
  assert.equal(createChaseCard({}).schemaVersion, SCHEMA_VERSIONS.card);
  assert.equal(createChaseTemplate({}).schemaVersion, SCHEMA_VERSIONS.template);
  assert.equal(createChasePack({}).schemaVersion, SCHEMA_VERSIONS.pack);
  assert.equal(createChaseBlueprint({}).schemaVersion, SCHEMA_VERSIONS.blueprint);
  assert.equal(createChaseSession({}).schemaVersion, SCHEMA_VERSIONS.session);
  assert.equal(createChaseResult({}).schemaVersion, SCHEMA_VERSIONS.result);
  assert.equal(createChasePublicState({}).schemaVersion, SCHEMA_VERSIONS.publicState);
  assert.equal(createConsequence({}).schemaVersion, SCHEMA_VERSIONS.consequence);
});

test("card normalization supplies every PF2e degree of success", () => {
  const card = createChaseCard({ name: "Card", outcomes: { success: [{ kind: "narrative", text: "Good" }] } });
  assert.deepEqual(Object.keys(card.outcomes), ["criticalSuccess", "success", "failure", "criticalFailure"]);
  assert.equal(card.outcomes.success[0].payload.text, "Good");
});

test("card required points are clamped to at least one", () => {
  assert.equal(createChaseCard({ obstacle: { requiredPoints: 0 } }).obstacle.requiredPoints, 1);
  assert.equal(createChaseCard({ obstacle: { requiredPoints: -4 } }).obstacle.requiredPoints, 1);
});

test("tags normalize to unique strings", () => {
  const card = createChaseCard({ tags: ["city", "city", 3] });
  assert.deepEqual(card.tags, ["city", "3"]);
});

test("image contract reserves external providers and candidates", () => {
  const card = createChaseCard({
    image: {
      mode: "provider",
      providerId: "urban-visuals",
      candidates: [{ id: "night", path: "night.webp", tags: ["night"], weight: 2 }]
    }
  });
  assert.equal(card.image.mode, "provider");
  assert.equal(card.image.providerId, "urban-visuals");
  assert.equal(card.image.candidates[0].path, "night.webp");
});

test("template is a preset and contains no session state", () => {
  const template = createChaseTemplate({
    id: "core:rooftops",
    name: "Rooftops",
    settings: { chaseType: "pursuit", routeComplexity: "shortcuts", environmentTags: ["city", "rooftop"] }
  });
  assert.equal(template.settings.chaseType, "pursuit");
  assert.deepEqual(template.settings.environmentTags, ["city", "rooftop"]);
  assert.equal("round" in template, false);
  assert.equal("groups" in template, false);
});

test("blueprint stores a route graph rather than a flat card list", () => {
  const blueprint = sampleBlueprint();
  assert.equal(Array.isArray(blueprint.graph.nodes), true);
  assert.equal(Array.isArray(blueprint.graph.edges), true);
  assert.equal("cards" in blueprint, false);
});

test("blueprint supports multiple endings", () => {
  const blueprint = sampleBlueprint(branchedGraph());
  assert.deepEqual(blueprint.graph.endNodeIds, ["end-a", "end-b"]);
});

test("participant group supports placeholders", () => {
  const group = createParticipantGroup({
    id: "quarry",
    role: "quarry",
    participants: [createParticipant({ id: "target", kind: "placeholder", name: "Choose quarry at start" })]
  });
  assert.equal(group.participants[0].uuid, null);
  assert.equal(group.participants[0].kind, "placeholder");
});

test("participant group supports abstract opposition", () => {
  const group = createParticipantGroup({
    id: "disaster",
    role: "quarry",
    participants: [createParticipant({ id: "fire", kind: "abstract", name: "Wildfire" })]
  });
  assert.equal(group.participants[0].kind, "abstract");
});

test("session position is node plus progress, not a single track number", () => {
  const session = sampleSession();
  assert.deepEqual(session.groups[0].position, { nodeId: "obstacle-1", progress: 1 });
});

test("session can carry two runtime subgroups from one blueprint group", () => {
  const session = sampleSession({
    groups: [
      { id: "split-a", groupId: "heroes", participantIds: ["hero-1"], position: { nodeId: "roof", progress: 0 } },
      { id: "split-b", groupId: "heroes", participantIds: ["hero-2"], position: { nodeId: "alley", progress: 0 } }
    ]
  });
  assert.equal(session.groups.length, 2);
  assert.equal(session.groups[0].groupId, session.groups[1].groupId);
  assert.notEqual(session.groups[0].position.nodeId, session.groups[1].position.nodeId);
});

test("session can embed a blueprint snapshot", () => {
  const session = sampleSession();
  assert.equal(session.blueprintSnapshot.id, "blueprint-1");
  assert.notEqual(session.blueprintSnapshot, sampleBlueprint());
});

test("result records routes per runtime group", () => {
  const result = createChaseResult({
    id: "result-1",
    sessionId: "session-1",
    outcome: "quarryCaught",
    routes: { "runtime-heroes": ["start", "roof", "merge", "end"] },
    rounds: 5
  });
  assert.deepEqual(result.routes["runtime-heroes"], ["start", "roof", "merge", "end"]);
  assert.equal(result.rounds, 5);
});

test("public state is structurally separate from session state", () => {
  const state = createChasePublicState({
    sessionId: "session-1",
    title: "Rooftop Chase",
    status: "active",
    current: { title: "Gap", image: "gap.webp", progress: { current: 2, required: 4 } },
    visibleRoutes: [{ edgeId: "e-roof", label: "Rooftops" }],
    availableActions: [{ id: "roll-athletics", type: "roll" }]
  });
  assert.equal("blueprintSnapshot" in state, false);
  assert.equal("nodeState" in state, false);
  assert.equal(state.current.title, "Gap");
});

test("chase point consequence preserves negative values", () => {
  const consequence = createConsequence({ kind: "chasePoints", value: -1 });
  assert.equal(consequence.payload.value, -1);
});

test("Effect Forge embedded consequence stores a definition snapshot", () => {
  const consequence = createConsequence({
    kind: "effectForge",
    source: "embedded",
    definition: { schemaVersion: 2, id: "sprained-ankle", name: "Sprained Ankle", components: [] }
  });
  assert.equal(consequence.payload.source, "embedded");
  assert.equal(consequence.payload.definition.id, "sprained-ankle");
});

test("Effect Forge item consequence stores an item UUID", () => {
  const consequence = createConsequence({ kind: "effectForge", source: "item", uuid: "Item.abc" });
  assert.equal(consequence.payload.source, "item");
  assert.equal(consequence.payload.uuid, "Item.abc");
});

test("route consequence stores target edge ids", () => {
  const consequence = createConsequence({ kind: "routeUnlock", edgeIds: ["shortcut", "shortcut"] });
  assert.deepEqual(consequence.payload.edgeIds, ["shortcut"]);
});

test("dev.3 session runtime groups reserve explicit edge history", () => {
  const session = sampleSession();
  assert.deepEqual(session.groups[0].edgeHistory, []);
  assert.equal(session.schemaVersion, 2);
});
