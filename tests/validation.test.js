import test from "node:test";
import assert from "node:assert/strict";
import {
  createChaseBlueprint,
  createChasePublicState,
  createChaseResult,
  createChaseTemplate,
  createConsequence,
  createParticipantGroup
} from "../scripts/data/factories.js";
import {
  validateChaseBlueprint,
  validateChaseCard,
  validateChasePublicState,
  validateChaseResult,
  validateChaseSession,
  validateChaseTemplate,
  validateConsequence,
  validateParticipantGroup
} from "../scripts/data/validators.js";
import { branchedGraph, sampleBlueprint, sampleCard, sampleSession } from "./helpers.js";

test("sample obstacle card validates", () => {
  const result = validateChaseCard(sampleCard());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("duplicate approach ids are rejected", () => {
  const card = sampleCard();
  card.approaches.push(structuredClone(card.approaches[0]));
  const result = validateChaseCard(card);
  assert.ok(result.errors.some(error => error.code === "DUPLICATE_ID"));
});

test("invalid card schema is rejected", () => {
  const card = sampleCard();
  card.schemaVersion = 99;
  const result = validateChaseCard(card);
  assert.ok(result.errors.some(error => error.code === "SCHEMA_VERSION"));
});

test("template settings validate", () => {
  const template = createChaseTemplate({ id: "core:test", name: "Test", settings: { chaseType: "race", routeComplexity: "branched" } });
  assert.equal(validateChaseTemplate(template).valid, true);
});

test("invalid template setting is rejected if raw data bypasses normalizer", () => {
  const template = createChaseTemplate({ id: "core:test", name: "Test" });
  template.settings.chaseType = "teleport-race";
  assert.ok(validateChaseTemplate(template).errors.some(error => error.code === "ENUM"));
});

test("blueprint with branched graph validates", () => {
  const result = validateChaseBlueprint(sampleBlueprint(branchedGraph(), { settings: { routeComplexity: "branched" } }));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("duplicate blueprint group ids are rejected", () => {
  const blueprint = sampleBlueprint();
  blueprint.groups.push(structuredClone(blueprint.groups[0]));
  const result = validateChaseBlueprint(blueprint);
  assert.ok(result.errors.some(error => error.code === "DUPLICATE_ID"));
});

test("actor participants without UUID generate a warning", () => {
  const group = createParticipantGroup({ id: "g", participants: [{ id: "p", kind: "actor", name: "Unresolved" }] });
  const result = validateParticipantGroup(group);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(warning => warning.code === "MISSING_UUID"));
});

test("sample active session validates", () => {
  const result = validateChaseSession(sampleSession());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("session progress cannot be negative", () => {
  const session = sampleSession();
  session.groups[0].position.progress = -1;
  const result = validateChaseSession(session);
  assert.ok(result.errors.some(error => error.code === "PROGRESS"));
});

test("invalid embedded blueprint snapshot invalidates session", () => {
  const session = sampleSession();
  session.blueprintSnapshot.graph.endNodeIds = [];
  const result = validateChaseSession(session);
  assert.ok(result.errors.some(error => error.code === "BLUEPRINT_SNAPSHOT"));
});

test("result requires a session id", () => {
  const resultData = createChaseResult({ id: "result", outcome: "custom" });
  const result = validateChaseResult(resultData);
  assert.ok(result.errors.some(error => error.code === "REQUIRED_STRING" && error.path === "sessionId"));
});

test("valid result passes", () => {
  const resultData = createChaseResult({ id: "result", sessionId: "session", outcome: "goalReached", rounds: 3 });
  assert.equal(validateChaseResult(resultData).valid, true);
});

test("public state contract validates", () => {
  const state = createChasePublicState({ sessionId: "session", status: "active", visibleRoutes: [], availableActions: [] });
  assert.equal(validateChasePublicState(state).valid, true);
});

test("embedded Effect Forge consequence requires definition", () => {
  const consequence = createConsequence({ kind: "effectForge", source: "embedded" });
  const result = validateConsequence(consequence);
  assert.ok(result.errors.some(error => error.code === "EFFECT_DEFINITION"));
});

test("Effect Forge item consequence requires UUID", () => {
  const consequence = createConsequence({ kind: "effectForge", source: "item" });
  const result = validateConsequence(consequence);
  assert.ok(result.errors.some(error => error.code === "EFFECT_UUID"));
});

test("route unlock consequence requires at least one edge id", () => {
  const consequence = createConsequence({ kind: "routeUnlock", edgeIds: [] });
  const result = validateConsequence(consequence);
  assert.ok(result.errors.some(error => error.code === "ROUTE_EDGE_IDS"));
});

test("valid embedded Effect Forge consequence passes structural validation", () => {
  const consequence = createConsequence({ kind: "effectForge", source: "embedded", definition: { schemaVersion: 2, id: "effect", components: [] } });
  assert.equal(validateConsequence(consequence).valid, true);
});

test("raw blueprint with invalid settings is caught even if factories were bypassed", () => {
  const blueprint = sampleBlueprint();
  blueprint.settings.routeComplexity = "maze-with-loops";
  const result = validateChaseBlueprint(blueprint);
  assert.ok(result.errors.some(error => error.path === "settings.routeComplexity"));
});
