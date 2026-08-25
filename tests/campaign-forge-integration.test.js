import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import { CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION, inspectCampaignForgeApi } from "../scripts/integrations/campaign-forge-bridge.js";
import { CHASE_LIFECYCLE_HOOKS } from "../scripts/persistence/session-manager.js";
import { sampleBlueprint } from "./helpers.js";

function installGame({ campaignApi = null } = {}) {
  const previous = { game: globalThis.game, ui: globalThis.ui, Hooks: globalThis.Hooks, ChatMessage: globalThis.ChatMessage };
  const modules = new Map();
  if (campaignApi) modules.set("campaign-forge", { active: true, version: "1.0.1", api: campaignApi });
  globalThis.game = {
    user: { id: "gm", isGM: true },
    modules,
    i18n: { localize: key => key, format: (key, data) => `${key}:${data?.name ?? ""}` }
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.ChatMessage = { async create(data) { return data; }, getSpeaker() { return { alias: "Chase Forge" }; } };
  const hooks = [];
  globalThis.Hooks = { callAll(name, payload) { hooks.push({ name, payload }); } };
  return { hooks, cleanup() { for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value; } };
}

test("Campaign Forge bridge lists world and read-only Library chases without copying domain data", async () => {
  const env = installGame();
  try {
    const api = createPublicApi();
    await api.persistence.blueprints.create(sampleBlueprint());
    api.extensions.forModule("campaign-addon").registerPack({
      id: "prepared", label: "Prepared", cards: [], templates: [], imageProviders: [],
      blueprints: [sampleBlueprint(undefined, { id: "library-chase", name: "Library Chase" })]
    });
    const values = await api.integrations.campaignForge.listPrepared();
    assert.equal(values.length, 2);
    const world = values.find(item => item.kind === "blueprint");
    const library = values.find(item => item.kind === "library");
    assert.equal(world.id, "blueprint-1");
    assert.equal(world.readOnly, false);
    assert.equal(library.id, "campaign-addon:library-chase");
    assert.equal(library.readOnly, true);
    assert.equal(Object.isFrozen(values), true);
  } finally { env.cleanup(); }
});

test("Campaign Forge bridge opens, creates, and directly starts prepared chases with campaign provenance", async () => {
  const env = installGame();
  const opened = [];
  const runners = [];
  const synced = [];
  try {
    const api = createPublicApi({
      ui: {
        async openBuilder(options) { opened.push(options); return options; },
        async openRunner(options) { runners.push(options); return options; }
      },
      sync: { async publishSession(session) { synced.push(session.id); return { sent: 0 }; } }
    });
    await api.persistence.blueprints.create(sampleBlueprint());
    await api.integrations.campaignForge.open("blueprint", "blueprint-1");
    await api.integrations.campaignForge.openNew();
    const started = await api.integrations.campaignForge.start("blueprint", "blueprint-1", {
      campaign: { entryId: "quest-1", entryTitle: "The Pursuit", linkId: "link-1" }
    });
    assert.deepEqual(opened[0], { blueprintId: "blueprint-1" });
    assert.deepEqual(opened[1], { newChase: true });
    assert.equal(started.session.status, "active");
    assert.equal(started.session.metadata.startedFromCampaignForge, true);
    assert.equal(started.session.metadata.campaign.entryId, "quest-1");
    assert.equal(started.session.metadata.campaign.linkId, "link-1");
    assert.deepEqual(runners, [{ sessionId: started.sessionId }]);
    assert.deepEqual(synced, [started.sessionId]);
  } finally { env.cleanup(); }
});

test("completed Campaign-started Chase returns a ChaseResult carrying Campaign provenance and emits lifecycle hooks", async () => {
  const env = installGame();
  try {
    const api = createPublicApi({ ui: { async openRunner() {} }, sync: { async publishSession() {} } });
    await api.persistence.blueprints.create(sampleBlueprint());
    const started = await api.integrations.campaignForge.start("blueprint", "blueprint-1", {
      campaign: { entryId: "event-1", entryTitle: "Escape", linkId: "link-2" }
    });
    const completed = await api.sessionManager.finishSession(started.sessionId, {
      ended: true,
      outcome: "goalReached",
      endingNodeId: "end",
      winnerGroupIds: [],
      loserGroupIds: [],
      reason: "test",
      details: { source: "campaign-test" }
    });
    assert.equal(completed.result.metadata.campaign.entryId, "event-1");
    const returned = await api.integrations.campaignForge.getResult(started.sessionId);
    assert.equal(returned.id, completed.result.id);
    assert.equal(returned.reference, `ChaseResult.${completed.result.id}`);
    const latest = await api.integrations.campaignForge.getLatestResult("blueprint", "blueprint-1", { entryId: "event-1" });
    assert.equal(latest.id, completed.result.id);
    assert.ok(env.hooks.some(call => call.name === CHASE_LIFECYCLE_HOOKS.started && call.payload.campaign?.entryId === "event-1"));
    assert.ok(env.hooks.some(call => call.name === CHASE_LIFECYCLE_HOOKS.completed && call.payload.result?.id === completed.result.id));
  } finally { env.cleanup(); }
});

test("Campaign integration is optional, capability-detected, and exposed as Contract v1", () => {
  const env = installGame({ campaignApi: { apiVersion: 1, stability: "stable", addExternalLink() {}, removeExternalLink() {}, integrations: { getStatus() {} } } });
  try {
    const api = createPublicApi();
    assert.equal(api.version, 15);
    assert.equal(api.contracts.campaignForgeIntegration, CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION);
    assert.equal(api.getCapabilities().campaignForgeBridge, true);
    assert.equal(api.getCapabilities().campaignForgeAvailable, true);
    assert.equal(api.hooks.started, CHASE_LIFECYCLE_HOOKS.started);
    assert.equal(inspectCampaignForgeApi(globalThis.game.modules.get("campaign-forge").api).compatible, true);
  } finally { env.cleanup(); }
});
