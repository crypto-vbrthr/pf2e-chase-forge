import test from "node:test";
import assert from "node:assert/strict";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createChaseSession,
  createParticipant,
  createParticipantGroup
} from "../scripts/data/factories.js";
import { createPublicApi } from "../scripts/api/public-api.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";
import { projectChasePublicState } from "../scripts/player/public-state-projector.js";
import { sampleBlueprint } from "./helpers.js";

function installFoundryGlobals() {
  const previous = { game: globalThis.game, ui: globalThis.ui, Hooks: globalThis.Hooks, ChatMessage: globalThis.ChatMessage };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    modules: new Map(),
    i18n: { localize: key => key, format: key => key }
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.Hooks = { callAll() {} };
  globalThis.ChatMessage = { async create(data) { return data; }, getSpeaker() { return { alias: "Chase Forge" }; } };
  return () => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  };
}

function actorParticipant(id, name = id) {
  return createParticipant({ id, kind: "actor", uuid: `Actor.${id}`, name });
}

function scalableCard() {
  return createChaseCard({
    id: "scale-card",
    name: "Scale Card",
    obstacle: { requiredPoints: 2 },
    approaches: [{ id: "athletics", label: "Athletics", type: "check", statistic: "athletics", dc: { mode: "fixed", value: 15 } }],
    metadata: { chasePointScaling: { mode: "groupMinus1" } }
  });
}

function branchedThreePersonBlueprint({ chaseType = "pursuit", role = "pursuer" } = {}) {
  const participants = [actorParticipant("a", "A"), actorParticipant("b", "B"), actorParticipant("c", "C")];
  const group = createParticipantGroup({ id: "team", name: "Team", role, participants });
  return createChaseBlueprint({
    id: `rc2-${chaseType}`,
    name: "RC2 Integration",
    settings: { chaseType, length: "short", difficulty: "moderate", routeComplexity: "branched", partyLevel: 5 },
    groups: [group],
    graph: {
      nodes: [
        createChaseNode({ id: "start", type: "start" }),
        createChaseNode({ id: "card", type: "card", cardRef: "scale-card" }),
        createChaseNode({ id: "left", type: "card", cardRef: "scale-card" }),
        createChaseNode({ id: "right", type: "card", cardRef: "scale-card" }),
        createChaseNode({ id: "merge", type: "merge" }),
        createChaseNode({ id: "end", type: "end" })
      ],
      edges: [
        createChaseEdge({ id: "s", from: "start", to: "card" }),
        createChaseEdge({ id: "l", from: "card", to: "left", type: "branch" }),
        createChaseEdge({ id: "r", from: "card", to: "right", type: "branch" }),
        createChaseEdge({ id: "lm", from: "left", to: "merge" }),
        createChaseEdge({ id: "rm", from: "right", to: "merge" }),
        createChaseEdge({ id: "e", from: "merge", to: "end" })
      ],
      startNodeId: "start",
      endNodeIds: ["end"]
    },
    contentSnapshots: { mode: "snapshot", cards: [{ ref: "scale-card", kind: "card", data: scalableCard() }] }
  });
}

test("RC2 Campaign continuation preserves a split runtime topology and participant round state", async () => {
  const cleanup = installFoundryGlobals();
  try {
    const api = createPublicApi({ ui: { async openRunner() {} }, sync: { async publishSession() {} } });
    await api.persistence.blueprints.create(sampleBlueprint());
    const started = await api.integrations.campaignForge.start("blueprint", "blueprint-1", {
      campaign: { entryId: "quest-split", linkId: "link-split" }
    });
    let session = api.rules.beginRound(started.session);
    const split = api.rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["hero-2"] });
    session = structuredClone(split.session);
    session.roundState.actedParticipantIds = ["hero-1"];
    await api.sessionManager.saveSession(createChaseSession(session));

    const reopened = await api.integrations.campaignForge.start("blueprint", "blueprint-1", {
      campaign: { entryId: "quest-split", linkId: "link-split" }
    });
    assert.equal(reopened.reused, true);
    assert.equal(reopened.sessionId, started.sessionId);
    assert.equal(reopened.session.groups.length, 2);
    assert.ok(reopened.session.groups.some(group => group.parentRuntimeGroupId === "runtime-heroes"));
    assert.deepEqual(reopened.session.roundState.actedParticipantIds, ["hero-1"]);
  } finally { cleanup(); }
});

test("RC2 race initiative stays participant-based after a competitor group splits", () => {
  const card = scalableCard();
  const rules = createChaseRulesEngine({ cardResolver: id => id === card.id ? card : null });
  const bp = branchedThreePersonBlueprint({ chaseType: "race", role: "competitor" });
  let session = rules.initializeSession(bp, { status: "active", autoResolveStart: true });
  session = rules.beginRound(session, { initiativeOrder: ["a", "b", "c"] });
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-team", participantIds: ["c"] });
  session = split.session;

  assert.equal(rules.getNextRaceParticipantId(session), "a");
  assert.equal(rules.canParticipantAct(session, split.childRuntimeGroupId, "c"), false);
  session = rules.applyAutomaticContribution(session, { runtimeGroupId: "runtime-team", participantId: "a", points: 0 }).session;
  assert.equal(rules.getNextRaceParticipantId(session), "b");
  session = rules.applyAutomaticContribution(session, { runtimeGroupId: "runtime-team", participantId: "b", points: 0 }).session;
  assert.equal(rules.getNextRaceParticipantId(session), "c");
  assert.equal(rules.canParticipantAct(session, split.childRuntimeGroupId, "c"), true);
});

test("RC2 merge re-evaluates scalable Chase Points while preserving legitimately accumulated progress", () => {
  const card = scalableCard();
  const rules = createChaseRulesEngine({ cardResolver: id => id === card.id ? card : null });
  const bp = branchedThreePersonBlueprint();
  let session = rules.initializeSession(bp, { status: "active", autoResolveStart: true });
  session = rules.beginRound(session);
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-team", participantIds: ["c"] });
  session = structuredClone(split.session);
  const source = session.groups.find(group => group.id === "runtime-team");
  const child = session.groups.find(group => group.id === split.childRuntimeGroupId);
  source.position.progress = 1;
  child.position.progress = 1;
  session = createChaseSession(session);

  const merged = rules.mergeRuntimeGroups(session, {
    runtimeGroupIds: [source.id, child.id],
    targetRuntimeGroupId: source.id
  });
  const current = merged.session.groups.find(group => group.id === source.id);
  assert.equal(current.participantIds.length, 3);
  assert.equal(merged.routeChoiceRequired, true);
  assert.equal(merged.session.nodeState.card.groups[source.id].requiredPoints, 2);
});

test("RC2 Player projection identifies the controlled split group and its current companions", async () => {
  const bp = branchedThreePersonBlueprint();
  const session = createChaseSession({
    id: "player-split",
    blueprintId: bp.id,
    blueprintSnapshot: bp,
    status: "active",
    round: 2,
    groups: [
      { id: "runtime-team", groupId: "team", participantIds: ["a"], position: { nodeId: "left", progress: 0 }, routeHistory: ["start", "card", "left"], edgeHistory: ["s", "l"], rules: { paceMode: "roll" } },
      { id: "runtime-team-child", groupId: "team", participantIds: ["b", "c"], parentRuntimeGroupId: "runtime-team", position: { nodeId: "right", progress: 0 }, routeHistory: ["start", "card", "right"], edgeHistory: ["s", "r"], rules: { paceMode: "roll" } }
    ],
    roundState: { phase: "active", actedParticipantIds: [], skippedParticipantIds: [], initiativeOrder: [] },
    activeGroupId: "runtime-team-child"
  });
  const api = createPublicApi();
  const state = await projectChasePublicState(api, session, {
    user: { id: "player-b", isGM: false },
    fromUuid: async uuid => ({ documentName: "Actor", uuid, testUserPermission: user => user.id === "player-b" && uuid === "Actor.b" })
  });
  const ownedGroup = state.groups.find(group => group.runtimeGroupId === "runtime-team-child");
  assert.equal(state.current.runtimeGroupId, "runtime-team-child");
  assert.equal(ownedGroup.name, "B + C");
  assert.deepEqual(ownedGroup.participants.map(item => [item.name, item.controlled]), [["B", true], ["C", false]]);
  assert.equal(state.availableActions.some(action => action.participantId === "b" && action.runtimeGroupId === "runtime-team-child"), true);
  assert.equal(state.availableActions.some(action => action.participantId === "a"), false);
});
