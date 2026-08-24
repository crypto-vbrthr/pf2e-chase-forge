import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import { sampleBlueprint } from "./helpers.js";

test("dev.2 public API advertises implemented registry capabilities", () => {
  const api = createPublicApi();
  const caps = api.getCapabilities();
  assert.equal(caps.coreDataModel, true);
  assert.equal(caps.graphValidation, true);
  assert.equal(caps.branchingModel, true);
  assert.equal(caps.playerSafeStateContract, true);
  assert.equal(caps.registries, true);
  assert.equal(caps.extensionApi, true);
  assert.equal(caps.transactionalPackRegistration, true);
  assert.equal(caps.contentPackActivation, true);
  assert.equal(caps.imageProviders, true);
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
  assert.equal(api.schemas.pack, 1);
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
  assert.equal(Object.isFrozen(api.cards), true);
  assert.equal(Object.isFrozen(api.templates), true);
  assert.equal(Object.isFrozen(api.packs), true);
  assert.equal(Object.isFrozen(api.images), true);
  assert.equal(Object.isFrozen(api.extensions), true);
});

test("registry stats are exposed without leaking mutable registry instances", () => {
  const api = createPublicApi();
  assert.deepEqual(api.registries.getStats(), {
    packs: 0,
    cards: 0,
    templates: 0,
    imageProviders: 0,
    enabledPacks: 0
  });
  assert.equal(api.registries.cards, undefined);
});
