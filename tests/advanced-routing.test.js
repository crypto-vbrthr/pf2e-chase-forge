import test from "node:test";
import assert from "node:assert/strict";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createParticipant,
  createParticipantGroup
} from "../scripts/data/factories.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";

function participant(id) {
  return createParticipant({ id, kind: "actor", uuid: `Actor.${id}`, name: id });
}

function group(id, role, ids) {
  return createParticipantGroup({ id, name: id, role, participants: ids.map(participant) });
}

const cards = new Map();
function addCard(id, { points = 2, scaling = null } = {}) {
  const card = createChaseCard({
    id,
    name: id,
    obstacle: { requiredPoints: points },
    approaches: [{ id: "athletics", label: "Athletics", type: "check", statistic: "athletics", dc: { mode: "fixed", value: 15 } }],
    metadata: scaling ? { chasePointScaling: { mode: scaling } } : {}
  });
  cards.set(id, card);
  return card;
}
addCard("c1", { points: 3, scaling: "groupMinus1" });
addCard("left", { points: 1 });
addCard("right", { points: 1 });
addCard("after", { points: 3, scaling: "groupMinus1" });

function graph() {
  return {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "c1-node", type: "card", cardRef: "c1" }),
      createChaseNode({ id: "left-node", type: "card", cardRef: "left" }),
      createChaseNode({ id: "right-node", type: "card", cardRef: "right" }),
      createChaseNode({ id: "merge", type: "merge" }),
      createChaseNode({ id: "after-node", type: "card", cardRef: "after" }),
      createChaseNode({ id: "end", type: "end" })
    ],
    edges: [
      createChaseEdge({ id: "s", from: "start", to: "c1-node" }),
      createChaseEdge({ id: "l", from: "c1-node", to: "left-node", type: "branch" }),
      createChaseEdge({ id: "r", from: "c1-node", to: "right-node", type: "branch" }),
      createChaseEdge({ id: "lm", from: "left-node", to: "merge" }),
      createChaseEdge({ id: "rm", from: "right-node", to: "merge" }),
      createChaseEdge({ id: "ma", from: "merge", to: "after-node" }),
      createChaseEdge({ id: "ae", from: "after-node", to: "end" })
    ],
    startNodeId: "start",
    endNodeIds: ["end"]
  };
}

function blueprint() {
  return createChaseBlueprint({
    id: "advanced",
    name: "Advanced",
    settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "branched", partyLevel: 5 },
    groups: [group("heroes", "pursuer", ["a", "b", "c"] )],
    graph: graph()
  });
}

function engine() {
  return createChaseRulesEngine({ cardResolver: id => cards.get(id) ?? null });
}

function activeSession() {
  const rules = engine();
  let session = rules.initializeSession(blueprint(), { status: "active", autoResolveStart: true });
  session = rules.beginRound(session);
  return { rules, session };
}

test("runtime groups can split at a fresh obstacle and preserve participant turn state", () => {
  const { rules } = activeSession();
  let { session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  session = split.session;
  assert.equal(session.groups.length, 2);
  const original = session.groups.find(item => item.id === "runtime-heroes");
  const child = session.groups.find(item => item.id === split.childRuntimeGroupId);
  assert.deepEqual(original.participantIds, ["a", "b"]);
  assert.deepEqual(child.participantIds, ["c"]);
  assert.equal(child.position.nodeId, original.position.nodeId);
  assert.equal(child.parentRuntimeGroupId, "runtime-heroes");
});

test("runtime groups cannot split after Chase Points were already accumulated on the current obstacle", () => {
  const { rules, session } = activeSession();
  const progressed = structuredClone(session);
  progressed.groups[0].position.progress = 1;
  assert.equal(rules.canSplitRuntimeGroup(progressed, "runtime-heroes").allowed, false);
  assert.throws(() => rules.splitRuntimeGroup(progressed, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] }), /cannot be split/i);
});

test("split subgroups can take different branch routes", () => {
  const { rules } = activeSession();
  let { session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  session = split.session;

  // The singleton clears c1 with one success under the separated-PC rule.
  let childResult = rules.applyDegree(session, { runtimeGroupId: split.childRuntimeGroupId, participantId: "c", approachId: "athletics", degree: "success" });
  session = childResult.session;
  assert.equal(childResult.routeChoiceRequired, true);
  session = rules.chooseRoute(session, { runtimeGroupId: split.childRuntimeGroupId, edgeId: "l" }).session;
  assert.equal(session.groups.find(item => item.id === split.childRuntimeGroupId).position.nodeId, "left-node");

  // The GM activates the remaining subgroup and sends it down the other branch.
  session = rules.selectActiveGroup(session, "runtime-heroes");
  const second = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "a", approachId: "athletics", degree: "success" });
  session = second.session;
  assert.equal(second.routeChoiceRequired, true);
  session = rules.chooseRoute(session, { runtimeGroupId: "runtime-heroes", edgeId: "r" }).session;
  assert.equal(session.groups.find(item => item.id === "runtime-heroes").position.nodeId, "right-node");
});

test("co-located subgroups merge without restoring actions already spent this round", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  let current = split.session;
  current.roundState.actedParticipantIds = ["a"];
  current.activeGroupId = "runtime-heroes";
  current = structuredClone(current);

  const merged = rules.mergeRuntimeGroups(current, { runtimeGroupIds: ["runtime-heroes", split.childRuntimeGroupId], targetRuntimeGroupId: "runtime-heroes" });
  const next = merged.session;
  assert.equal(next.groups.length, 1);
  assert.deepEqual(new Set(next.groups[0].participantIds), new Set(["a", "b", "c"]));
  assert.equal(rules.canParticipantAct(next, "runtime-heroes", "a"), false);
  assert.equal(rules.canParticipantAct(next, "runtime-heroes", "b"), true);
  assert.equal(rules.canParticipantAct(next, "runtime-heroes", "c"), true);
});

test("automatic group order recommends the subgroup with the longest shortest remaining route", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  let current = split.session;
  const original = current.groups.find(item => item.id === "runtime-heroes");
  const child = current.groups.find(item => item.id === split.childRuntimeGroupId);
  original.position.nodeId = "after-node";
  original.routeHistory = ["start", "c1-node", "left-node", "merge", "after-node"];
  original.edgeHistory = ["s", "l", "lm", "ma"];
  child.position.nodeId = "c1-node";
  child.routeHistory = ["start", "c1-node"];
  child.edgeHistory = ["s"];
  current = rules.setGroupOrderMode(current, "automatic");
  const order = rules.getGroupOrderState(current);
  assert.equal(order.recommendedRuntimeGroupId, child.id);
  assert.ok(order.candidates[0].distance > order.candidates[1].distance);
});

test("group-distance helper reports zero for co-located groups", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  assert.equal(rules.getShortestGroupDistance(split.session, "runtime-heroes", split.childRuntimeGroupId), 0);
});

test("catching one split quarry subgroup does not end the whole chase while another quarry subgroup remains active", () => {
  const multi = createChaseBlueprint({
    id: "split-quarry",
    name: "Split Quarry",
    settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "branched", partyLevel: 5 },
    groups: [
      group("quarry", "quarry", ["q1", "q2"]),
      group("pursuers", "pursuer", ["p1"])
    ],
    graph: graph()
  });
  const rules = engine();
  let session = rules.initializeSession(multi, {
    status: "active",
    autoResolveStart: true,
    startPositions: { quarry: "c1-node", pursuers: "left-node" }
  });
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-quarry", participantIds: ["q2"] });
  session = structuredClone(split.session);
  const caught = session.groups.find(item => item.id === split.childRuntimeGroupId);
  caught.position.nodeId = "left-node";
  caught.position.progress = 0;

  const partial = rules.resolveRuntimeOutcomes(session);
  session = partial.session;
  assert.equal(partial.evaluation.ended, false);
  assert.equal(session.groups.find(item => item.id === split.childRuntimeGroupId).metadata.runtimeResolution.outcome, "caught");
  assert.equal(rules.canGroupAct(session, split.childRuntimeGroupId), false);

  const remaining = session.groups.find(item => item.id === "runtime-quarry");
  remaining.completed = true;
  remaining.position.nodeId = "end";
  const finished = rules.resolveRuntimeOutcomes(session);
  assert.equal(finished.evaluation.ended, true);
  assert.equal(finished.evaluation.outcome, "custom");
  assert.equal(finished.evaluation.details.mixedPursuitOutcome, true);
});

test("manual group order can override the automatic recommendation without restoring spent actions", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  let current = rules.setGroupOrderMode(split.session, "manual");
  const candidates = rules.getGroupOrderState(current).candidates;
  assert.equal(candidates.length, 2);
  const chosen = candidates.find(item => item.runtimeGroupId === split.childRuntimeGroupId);
  assert.ok(chosen);
  current = rules.selectActiveGroup(current, split.childRuntimeGroupId);
  assert.equal(rules.canParticipantAct(current, split.childRuntimeGroupId, "c"), true);
  assert.equal(rules.canParticipantAct(current, "runtime-heroes", "a"), false);

  current = rules.applyAutomaticContribution(current, { runtimeGroupId: split.childRuntimeGroupId, participantId: "c", points: 0 }).session;
  assert.equal(current.roundState.actedParticipantIds.includes("c"), true);
  assert.equal(rules.canParticipantAct(current, split.childRuntimeGroupId, "c"), false);
});

test("ending a round can auto-skip unacted participants even when automatic group order prefers a later-stored subgroup", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  let current = structuredClone(split.session);
  const original = current.groups.find(item => item.id === "runtime-heroes");
  const child = current.groups.find(item => item.id === split.childRuntimeGroupId);
  original.position.nodeId = "after-node";
  original.position.progress = 0;
  original.routeHistory = ["start", "c1-node", "left-node", "merge", "after-node"];
  original.edgeHistory = ["s", "l", "lm", "ma"];
  child.position.nodeId = "c1-node";
  child.position.progress = 0;
  child.routeHistory = ["start", "c1-node"];
  child.edgeHistory = ["s"];
  current = rules.setGroupOrderMode(current, "automatic");
  assert.equal(rules.getGroupOrderState(current).recommendedRuntimeGroupId, child.id);
  const ended = rules.endRound(current, { autoSkipUnacted: true, advanceSteady: false, completeOnOutcome: false });
  assert.equal(ended.session.roundState.phase, "ended");
  assert.deepEqual(new Set(ended.session.roundState.actedParticipantIds), new Set(["a", "b", "c"]));
});

test("participants can transfer between compatible co-located subgroups only before obstacle progress is accumulated", () => {
  const { rules, session } = activeSession();
  const split = rules.splitRuntimeGroup(session, { runtimeGroupId: "runtime-heroes", participantIds: ["c"] });
  let current = split.session;
  assert.equal(rules.canTransferParticipants(current, "runtime-heroes", split.childRuntimeGroupId).allowed, true);
  const moved = rules.transferParticipants(current, {
    fromRuntimeGroupId: "runtime-heroes",
    toRuntimeGroupId: split.childRuntimeGroupId,
    participantIds: ["b"]
  });
  current = moved.session;
  assert.deepEqual(current.groups.find(item => item.id === "runtime-heroes").participantIds, ["a"]);
  assert.deepEqual(new Set(current.groups.find(item => item.id === split.childRuntimeGroupId).participantIds), new Set(["b", "c"]));

  current = structuredClone(current);
  current.groups.find(item => item.id === "runtime-heroes").position.progress = 1;
  assert.equal(rules.canTransferParticipants(current, "runtime-heroes", split.childRuntimeGroupId).allowed, false);
  assert.throws(() => rules.transferParticipants(current, {
    fromRuntimeGroupId: "runtime-heroes",
    toRuntimeGroupId: split.childRuntimeGroupId,
    participantIds: ["a"]
  }), /before Chase Point progress/i);
});
