import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import { sampleBlueprint } from "./helpers.js";

test("dev.9 public API advertises builder, persistence, route, rules, and consequence capabilities", () => {
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
  assert.equal(caps.routeGraphEngine, true);
  assert.equal(caps.deterministicRouteResolution, true);
  assert.equal(caps.routeConditions, true);
  assert.equal(caps.multiGroupRouting, true);
  assert.equal(caps.rulesEngine, true);
  assert.equal(caps.chasePoints, true);
  assert.equal(caps.roundTracking, true);
  assert.equal(caps.chaseTypeOutcomes, true);
  assert.equal(caps.steadyPace, true);
  assert.equal(caps.separatedParticipantRule, true);
  assert.equal(caps.pf2eDcTables, true);
  assert.equal(caps.degreeOfSuccess, true);
  assert.equal(caps.pf2eAdapter, true);
  assert.equal(caps.persistence, true);
  assert.equal(caps.blueprintJsonTransfer, true);
  assert.equal(caps.contentSnapshots, true);
  assert.equal(caps.sessionLifecycle, true);
  assert.equal(caps.basicBuilder, true);
  assert.equal(caps.builderUi, false);
  assert.equal(caps.gmRunner, false);
  assert.equal(caps.chatWorkflow, true);
  assert.equal(caps.playerView, false);
  assert.equal(caps.sessionSync, false);
  assert.equal(caps.playerIntents, false);
  assert.equal(caps.consequenceEngine, true);
  assert.equal(caps.effectForgeBridge, true);
  assert.equal(caps.effectForgeAvailable, false);
  assert.equal(caps.weatherForgeBridge, true);
  assert.equal(caps.weatherForgeAvailable, false);
  assert.equal(caps.campaignForgeBridge, false);
});

test("public API exposes schema versions", () => {
  const api = createPublicApi();
  assert.equal(api.schemas.blueprint, 2);
  assert.equal(api.schemas.session, 4);
  assert.equal(api.schemas.publicState, 1);
  assert.equal(api.schemas.consequence, 2);
  assert.equal(api.schemas.pack, 1);
  assert.equal(api.schemas.persistence, 1);
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
  assert.equal(Object.isFrozen(api.route), true);
  assert.equal(Object.isFrozen(api.rules), true);
  assert.equal(Object.isFrozen(api.pf2e), true);
  assert.equal(Object.isFrozen(api.guidelines), true);
  assert.equal(Object.isFrozen(api.routeConditions), true);
  assert.equal(Object.isFrozen(api.consequences), true);
  assert.equal(Object.isFrozen(api.integrations), true);
  assert.equal(Object.isFrozen(api.integrations.effectForge), true);
  assert.equal(Object.isFrozen(api.integrations.weatherForge), true);
  assert.equal(Object.isFrozen(api.builder), true);
  assert.equal(Object.isFrozen(api.presentation), true);
  assert.equal(Object.isFrozen(api.presentation.chat), true);
  assert.equal(Object.isFrozen(api.ui), true);
  assert.equal(Object.isFrozen(api.persistence), true);
  assert.equal(Object.isFrozen(api.persistence.blueprints), true);
  assert.equal(Object.isFrozen(api.persistence.sessions), true);
  assert.equal(Object.isFrozen(api.sessionManager), true);
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


test("public route API can initialize and traverse a simple chase", () => {
  const api = createPublicApi();
  const blueprint = sampleBlueprint();
  let session = api.route.initializeSession(blueprint, { sessionId: "api-route-session", status: "active" });
  session = api.route.resolveDeterministic(session, "runtime-heroes").session;
  assert.equal(session.groups[0].position.nodeId, "obstacle-1");
  session = api.route.advanceGroup(session, "runtime-heroes");
  assert.equal(session.groups[0].position.nodeId, "end");
  assert.equal(api.route.completion(session).allGroupsCompleted, true);
});

test("Effect Forge availability capability is detected dynamically from Critical Forge public API", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    modules: new Map([["pf2e-critical-forge", {
      api: {
        version: "0.9.6",
        moduleVersion: "1.0.1-rc.4",
        schemaVersion: 2,
        effects: {
          migrate() {},
          analyze() {},
          apply() {},
          readItem() {}
        }
      }
    }]])
  };
  try {
    const api = createPublicApi();
    assert.equal(api.getCapabilities().effectForgeAvailable, true);
    assert.equal(api.integrations.effectForge.inspect().compatible, true);
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});


test("Weather Forge availability capability is detected dynamically from its public API", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    modules: new Map([["pf2e-weather-forge", {
      active: true,
      api: {
        version: 1,
        capabilities: { currentWeatherContext: true },
        getWeather() { return { timeSegment: "evening", precipitation: "none", temperature: 15, windStrength: 1 }; },
        async getCurrentWeatherContext() { return { version: 1, weather: this.getWeather() }; }
      }
    }]])
  };
  try {
    const api = createPublicApi();
    assert.equal(api.getCapabilities().weatherForgeAvailable, true);
    assert.equal(api.integrations.weatherForge.inspect().compatible, true);
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("dev.9 advertises Player View and synchronization when their services are supplied", () => {
  const ui = { openPlayerView() {}, getOpenPlayerViews() { return []; } };
  const sync = { sendIntent() {}, publishSession() {} };
  const api = createPublicApi({ ui, sync });
  assert.equal(api.version, 9);
  assert.equal(api.contracts.playerView, 1);
  assert.equal(api.contracts.playerStateProjector, 1);
  assert.equal(api.contracts.sessionSync, 1);
  assert.equal(api.getCapabilities().playerView, true);
  assert.equal(api.getCapabilities().sessionSync, true);
  assert.equal(api.getCapabilities().playerIntents, true);
  assert.equal(api.sync, sync);
});
