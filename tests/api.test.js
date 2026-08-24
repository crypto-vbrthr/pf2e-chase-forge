import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import { sampleBlueprint } from "./helpers.js";

test("dev.1 public API advertises only implemented capabilities", () => {
  const api = createPublicApi();
  const caps = api.getCapabilities();
  assert.equal(caps.coreDataModel, true);
  assert.equal(caps.graphValidation, true);
  assert.equal(caps.branchingModel, true);
  assert.equal(caps.playerSafeStateContract, true);
  assert.equal(caps.registries, false);
  assert.equal(caps.rulesEngine, false);
  assert.equal(caps.persistence, false);
  assert.equal(caps.gmRunner, false);
  assert.equal(caps.playerView, false);
  assert.equal(caps.effectForgeBridge, false);
  assert.equal(caps.campaignForgeBridge, false);
});

test("public API exposes schema versions", () => {
  const api = createPublicApi();
  assert.equal(api.schemas.blueprint, 1);
  assert.equal(api.schemas.publicState, 1);
  assert.equal(api.schemas.consequence, 1);
});

test("public API factory plus validator round trip", () => {
  const api = createPublicApi();
  const blueprint = sampleBlueprint();
  const clone = api.factories.blueprint(blueprint);
  const result = api.validation.blueprint(clone);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("public API graph helpers can topologically order a blueprint", () => {
  const api = createPublicApi();
  const blueprint = sampleBlueprint();
  assert.deepEqual(api.graph.topologicalSort(blueprint.graph), ["start", "obstacle-1", "end"]);
});

test("public API containers are frozen", () => {
  const api = createPublicApi();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.factories), true);
  assert.equal(Object.isFrozen(api.validation), true);
  assert.equal(Object.isFrozen(api.graph), true);
});
