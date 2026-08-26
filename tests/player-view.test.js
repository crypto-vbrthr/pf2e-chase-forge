import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicApi } from "../scripts/api/public-api.js";
import { createChasePlayerUiService } from "../scripts/app/chase-player-app.js";
import { projectChasePublicState } from "../scripts/player/public-state-projector.js";
import { createChaseBlueprint, createChaseCard, createChaseEdge, createChaseNode, createChaseSession, createParticipant, createParticipantGroup } from "../scripts/data/factories.js";

function playerSession() {
  const card = createChaseCard({
    id: "world:roof-gap",
    name: "Der Dachsprung",
    description: "Eine breite Gasse trennt die Dächer.",
    gmNotes: "Geheime Wache hinter dem Kamin.",
    obstacle: { requiredPoints: 3 },
    approaches: [{ id: "jump", label: "Springen", description: "Über die Gasse springen.", statistic: "athletics", dc: { mode: "fixed", value: 27, hidden: true } }],
    image: { mode: "manual", path: "modules/test/roof.webp", alt: "Dächer" }
  });
  const group = createParticipantGroup({
    id: "heroes", name: "Helden", role: "pursuer",
    participants: [createParticipant({ id: "hero", uuid: "Actor.hero", name: "Kikus", image: "kikus.webp" })]
  });
  const graph = {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "roof", type: "card", cardRef: card.id }),
      createChaseNode({ id: "safe", type: "end", label: "Gassen" }),
      createChaseNode({ id: "secret", type: "end", label: "Geheime Abkürzung" })
    ],
    edges: [
      createChaseEdge({ id: "to-roof", from: "start", to: "roof" }),
      createChaseEdge({ id: "normal", from: "roof", to: "safe", type: "branch", visibility: "public", label: "Durch die Gassen" }),
      createChaseEdge({ id: "secret-edge", from: "roof", to: "secret", type: "shortcut", visibility: "discoverable", label: "Geheime Abkürzung" })
    ],
    startNodeId: "start", endNodeIds: ["safe", "secret"]
  };
  const blueprint = createChaseBlueprint({
    id: "bp", name: "Dachjagd", groups: [group], graph,
    settings: { partyLevel: 8 },
    contentSnapshots: { mode: "snapshot", cards: [{ ref: card.id, kind: "card", data: card }] }
  });
  return createChaseSession({
    id: "session-player", blueprintId: blueprint.id, blueprintSnapshot: blueprint,
    status: "active", round: 2,
    groups: [{ id: "runtime-heroes", groupId: "heroes", participantIds: ["hero"], position: { nodeId: "roof", progress: 1 }, routeHistory: ["start", "roof"], edgeHistory: ["to-roof"], rules: { paceMode: "roll" } }],
    roundState: { phase: "active", actedParticipantIds: [], skippedParticipantIds: [] },
    nodeState: {}
  });
}

test("Player state projection exposes images, approaches and public routes without GM DCs or notes", async () => {
  const api = createPublicApi();
  const session = playerSession();
  const user = { id: "player", isGM: false };
  const fromUuid = async () => ({ documentName: "Actor", id: "hero", testUserPermission: candidate => candidate.id === "player" });
  const state = await projectChasePublicState(api, session, { user, fromUuid });
  const serialized = JSON.stringify(state);
  assert.equal(state.sessionId, session.id);
  assert.equal(state.groups[0].obstacle.image.path, "modules/test/roof.webp");
  assert.equal(state.availableActions.some(action => action.type === "roll" && action.approach.statistic === "athletics"), true);
  assert.equal(state.visibleRoutes.length, 0);
  assert.doesNotMatch(serialized, /27/);
  assert.doesNotMatch(serialized, /Geheime Wache/);
  assert.doesNotMatch(serialized, /secret-edge/);
});


test("Player state projection reveals only discovered/public route choices after an obstacle is cleared", async () => {
  const api = createPublicApi();
  const raw = playerSession();
  const session = createChaseSession({ ...raw, nodeState: { roof: { groups: { "runtime-heroes": { cleared: true, requiredPoints: 3 } } } } });
  const state = await projectChasePublicState(api, session, {
    user: { id: "player", isGM: false },
    fromUuid: async () => ({ documentName: "Actor", id: "hero", testUserPermission: candidate => candidate.id === "player" })
  });
  assert.equal(state.availableActions.filter(action => action.type === "roll").length, 0);
  assert.equal(state.visibleRoutes.length, 1);
  assert.equal(state.visibleRoutes[0].edgeId, "normal");
  assert.doesNotMatch(JSON.stringify(state), /secret-edge/);
});

test("Player state projection does not grant roll actions for unowned participants", async () => {
  const api = createPublicApi();
  const state = await projectChasePublicState(api, playerSession(), {
    user: { id: "other", isGM: false },
    fromUuid: async () => ({ documentName: "Actor", testUserPermission: () => false, ownership: { default: 0 } })
  });
  assert.equal(state.availableActions.filter(action => action.type === "roll").length, 0);
  assert.equal(state.visibleRoutes.length, 0);
});

test("Player Chase template and styles package roll, proposal, route and image UI", async () => {
  const template = await readFile(new URL("../templates/chase-player.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  assert.match(template, /data-action="rollApproach"/);
  assert.match(template, /data-action="proposeAction"/);
  assert.match(template, /data-action="chooseRoute"/);
  assert.match(template, /chase-player-hero/);
  assert.match(css, /\.chase-player-shell/);
  assert.match(css, /\.chase-player-route-grid/);
});

test("Player UI service reuses one ApplicationV2 per session", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  class ApplicationV2 {
    constructor() { this.renderCalls = 0; }
    async render() { this.renderCalls += 1; return this; }
    async close() { return this; }
    async _onRender() {}
  }
  globalThis.foundry = { applications: { api: { ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {} } } };
  globalThis.game = { user: { id: "player", isGM: false }, modules: new Map(), i18n: { localize: key => key } };
  const fakeApi = { sync: { requestState() {} } };
  try {
    const service = createChasePlayerUiService({ getApi: () => fakeApi });
    const state = { sessionId: "s1", title: "Test", status: "active", round: 1, groups: [], availableActions: [], personalEffects: [], metadata: {} };
    const first = await service.openPlayerView({ sessionId: "s1", state });
    const second = await service.openPlayerView({ sessionId: "s1", state });
    assert.equal(first, second);
    assert.equal(first.renderCalls, 2);
    await service.closePlayerView("s1");
    assert.equal(service.getOpenPlayerView("s1"), null);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});


test("Player View resolves and displays the controlled actor's PF2e approach modifier", async () => {
  const source = await readFile(new URL("../scripts/app/chase-player-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-player.hbs", import.meta.url), "utf8");
  assert.match(source, /enrichRollActionsWithModifiers/);
  assert.match(source, /getStatisticModifier/);
  assert.match(template, /action\.modifierLabel/);
  assert.match(template, /chase-skill-modifier/);
});

test("Player roll actions expose only the controlled participant's pending separated-PC bonus", async () => {
  const api = createPublicApi();
  const raw = playerSession();
  const session = createChaseSession({
    ...raw,
    groups: raw.groups.map(group => ({
      ...group,
      rules: {
        ...group.rules,
        pendingCheckBonuses: [{ participantId: "hero", value: 2, type: "circumstance", source: "separatedCriticalSuccess", grantedAtRound: 1 }]
      }
    }))
  });
  const state = await projectChasePublicState(api, session, {
    user: { id: "player", isGM: false },
    fromUuid: async () => ({ documentName: "Actor", id: "hero", testUserPermission: candidate => candidate.id === "player" })
  });
  const action = state.availableActions.find(item => item.type === "roll");
  assert.equal(action.pendingCheckBonus.value, 2);
  assert.equal(action.pendingCheckBonus.type, "circumstance");
  assert.equal(action.pendingCheckBonus.participantId, undefined, "player projection does not need to expose internal ownership ids inside the bonus payload");
});
