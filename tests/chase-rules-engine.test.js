import test from "node:test";
import assert from "node:assert/strict";
import { ChaseRulesError } from "../scripts/core/errors.js";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createChaseSession,
  createParticipant,
  createParticipantGroup
} from "../scripts/data/factories.js";
import { createChaseRulesEngine, getChaseLengthGuideline, recommendObstaclePoints } from "../scripts/rules/chase-rules-engine.js";

function card(id, requiredPoints = 3, dc = 20) {
  return createChaseCard({
    id,
    name: id,
    obstacle: { requiredPoints },
    approaches: [{ id: "athletics", label: "Athletics", statistic: "athletics", dc: { mode: "fixed", value: dc } }]
  });
}

const cards = new Map([
  ["core:c1", card("core:c1", 3, 20)],
  ["core:c2", card("core:c2", 2, 20)],
  ["core:c3", card("core:c3", 2, 20)],
  ["core:branch-a", card("core:branch-a", 1, 15)],
  ["core:branch-b", card("core:branch-b", 1, 15)]
]);

function participant(id) {
  return createParticipant({ id, kind: "actor", uuid: `Actor.${id}`, name: id });
}

function group(id, role = "participant", participantIds = [`${id}-1`, `${id}-2`], metadata = {}) {
  return createParticipantGroup({
    id,
    name: id,
    role,
    participants: participantIds.map(participant),
    metadata
  });
}

function linearGraph() {
  return {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "c1", type: "card", cardRef: "core:c1" }),
      createChaseNode({ id: "c2", type: "card", cardRef: "core:c2" }),
      createChaseNode({ id: "c3", type: "card", cardRef: "core:c3" }),
      createChaseNode({ id: "end", type: "end" })
    ],
    edges: [
      createChaseEdge({ id: "e1", from: "start", to: "c1" }),
      createChaseEdge({ id: "e2", from: "c1", to: "c2" }),
      createChaseEdge({ id: "e3", from: "c2", to: "c3" }),
      createChaseEdge({ id: "e4", from: "c3", to: "end" })
    ],
    startNodeId: "start",
    endNodeIds: ["end"]
  };
}

function branchGraph() {
  return {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "c1", type: "card", cardRef: "core:c1" }),
      createChaseNode({ id: "a", type: "card", cardRef: "core:branch-a" }),
      createChaseNode({ id: "b", type: "card", cardRef: "core:branch-b" }),
      createChaseNode({ id: "end", type: "end" })
    ],
    edges: [
      createChaseEdge({ id: "s", from: "start", to: "c1" }),
      createChaseEdge({ id: "a1", from: "c1", to: "a", type: "branch" }),
      createChaseEdge({ id: "b1", from: "c1", to: "b", type: "branch" }),
      createChaseEdge({ id: "a2", from: "a", to: "end" }),
      createChaseEdge({ id: "b2", from: "b", to: "end" })
    ],
    startNodeId: "start",
    endNodeIds: ["end"]
  };
}

function blueprint({ id = "bp", chaseType = "pursuit", groups = [group("heroes", "pursuer")], graph = linearGraph(), victory = {}, partyLevel = 5 } = {}) {
  return createChaseBlueprint({
    id,
    name: id,
    settings: {
      chaseType,
      length: "short",
      difficulty: "moderate",
      routeComplexity: graph === linearGraph ? "linear" : "branched",
      partyLevel,
      victory
    },
    groups,
    graph
  });
}

function engine() {
  return createChaseRulesEngine({ cardResolver: id => cards.get(id) ?? null });
}

function activeSingleGroupSession({ graph = linearGraph(), requiredStart = null, participantIds = ["hero-1", "hero-2"], role = "pursuer", chaseType = "pursuit" } = {}) {
  const bp = blueprint({
    chaseType,
    groups: [group("heroes", role, participantIds)],
    graph
  });
  let session = engine().initializeSession(bp, {
    status: "active",
    startPositions: requiredStart ? { heroes: requiredStart } : {},
    autoResolveStart: true
  });
  session = engine().beginRound(session);
  return session;
}

test("rules session resolves a technical start node onto the first obstacle", () => {
  const rules = engine();
  const session = rules.initializeSession(blueprint(), { status: "active" });
  assert.equal(session.groups[0].position.nodeId, "c1");
  assert.equal(session.schemaVersion, 4);
  assert.equal(session.rules.escapeLead, 3);
});

test("critical success gives 2 Chase Points by default", () => {
  const rules = engine();
  const session = activeSingleGroupSession();
  const result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", approachId: "athletics", degree: "criticalSuccess" });
  assert.equal(result.chasePointDelta, 2);
  assert.equal(result.session.groups[0].position.progress, 2);
  assert.equal(result.obstacleCleared, false);
});

test("success gives 1 Chase Point and failure gives none", () => {
  const rules = engine();
  let session = activeSingleGroupSession();
  let result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "success" });
  assert.equal(result.chasePointDelta, 1);
  session = result.session;
  result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-2", degree: "failure" });
  assert.equal(result.chasePointDelta, 0);
  assert.equal(result.session.groups[0].position.progress, 1);
});

test("critical failure loses 1 Chase Point but progress never drops below zero", () => {
  const rules = engine();
  const session = activeSingleGroupSession();
  const result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "criticalFailure" });
  assert.equal(result.chasePointDelta, -1);
  assert.equal(result.session.groups[0].position.progress, 0);
});

test("enough Chase Points immediately clear the obstacle and do not carry over", () => {
  const rules = engine();
  let session = activeSingleGroupSession();
  session = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "criticalSuccess" }).session;
  const result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-2", degree: "success" });
  assert.equal(result.obstacleCleared, true);
  assert.equal(result.session.groups[0].position.nodeId, "c2");
  assert.equal(result.session.groups[0].position.progress, 0);
  assert.deepEqual(result.traversedEdgeIds, ["e2"]);
});

test("a participant who has not acted can act on the next obstacle in the same round", () => {
  const rules = engine();
  cards.set("core:c1", card("core:c1", 1, 20));
  try {
    let session = activeSingleGroupSession();
    session = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "success" }).session;
    assert.equal(session.groups[0].position.nodeId, "c2");
    const second = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-2", degree: "success" });
    assert.equal(second.session.groups[0].position.progress, 1);
  } finally {
    cards.set("core:c1", card("core:c1", 3, 20));
  }
});

test("the same participant cannot act twice in one round", () => {
  const rules = engine();
  let session = activeSingleGroupSession();
  session = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "success" }).session;
  assert.throws(() => rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "success" }), error => error instanceof ChaseRulesError && error.code === "PARTICIPANT_ALREADY_ACTED");
});

test("a skipped turn loses one Chase Point", () => {
  const rules = engine();
  let session = activeSingleGroupSession();
  session.groups[0].position.progress = 2;
  session = createChaseSession(session);
  const result = rules.skipParticipantTurn(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1" });
  assert.equal(result.penaltyApplied, true);
  assert.equal(result.session.groups[0].position.progress, 1);
  assert.ok(result.session.roundState.skippedParticipantIds.includes("hero-1"));
});

test("endRound automatically penalizes rolled participants who did not act", () => {
  const rules = engine();
  let session = activeSingleGroupSession();
  session.groups[0].position.progress = 2;
  session = createChaseSession(session);
  session = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "failure" }).session;
  const ended = rules.endRound(session, { advanceSteady: false, completeOnOutcome: false });
  assert.equal(ended.skipped.length, 1);
  assert.equal(ended.skipped[0].participantId, "hero-2");
  assert.equal(ended.session.groups[0].position.progress, 1);
  assert.equal(ended.session.roundState.phase, "ended");
});

test("automatic non-check contribution normally adds one point", () => {
  const rules = engine();
  const session = activeSingleGroupSession();
  const result = rules.applyAutomaticContribution(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1" });
  assert.equal(result.points, 1);
  assert.equal(result.session.groups[0].position.progress, 1);
});

test("a particularly helpful automatic contribution can add two points", () => {
  const rules = engine();
  const session = activeSingleGroupSession();
  const result = rules.applyAutomaticContribution(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", points: 2 });
  assert.equal(result.session.groups[0].position.progress, 2);
});

test("a separated participant advances on one success regardless of card point requirement", () => {
  const rules = engine();
  const session = activeSingleGroupSession({ participantIds: ["solo"] });
  const result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "solo", degree: "success" });
  assert.equal(result.obstacleCleared, true);
  assert.equal(result.session.groups[0].position.nodeId, "c2");
});

test("a separated critical success grants +2 circumstance bonus to the next check", () => {
  const rules = engine();
  let session = activeSingleGroupSession({ participantIds: ["solo"] });
  let result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "solo", degree: "criticalSuccess" });
  assert.equal(result.pendingCheckBonus.value, 2);
  session = rules.endRound(result.session, { advanceSteady: false, completeOnOutcome: false }).session;
  session = rules.beginRound(session);
  result = rules.resolveCheck(session, { runtimeGroupId: "runtime-heroes", participantId: "solo", approachId: "athletics", total: 18 });
  assert.equal(result.appliedPendingBonus, 2);
  assert.equal(result.effectiveTotal, 20);
  assert.equal(result.degree, "success");
  assert.equal(result.session.groups[0].rules.pendingCheckBonus, null);
});

test("resolveCheck uses natural 20/1 degree adjustment", () => {
  const rules = engine();
  const session = activeSingleGroupSession();
  const result = rules.resolveCheck(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", approachId: "athletics", total: 18, natural: 20 });
  assert.equal(result.degree, "success");
});

test("cleared obstacle with multiple outgoing routes waits for an explicit branch choice", () => {
  const rules = engine();
  cards.set("core:c1", card("core:c1", 1, 20));
  try {
    const session = activeSingleGroupSession({ graph: branchGraph() });
    const result = rules.applyDegree(session, { runtimeGroupId: "runtime-heroes", participantId: "hero-1", degree: "success" });
    assert.equal(result.routeChoiceRequired, true);
    assert.equal(result.session.groups[0].position.nodeId, "c1");
    const chosen = rules.chooseRoute(result.session, { runtimeGroupId: "runtime-heroes", edgeId: "a1" });
    assert.equal(chosen.session.groups[0].position.nodeId, "a");
  } finally {
    cards.set("core:c1", card("core:c1", 3, 20));
  }
});

test("steady pace advances one obstacle per round by default", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("npc", "quarry", [], { npc: true })] });
  let session = rules.initializeSession(bp, { status: "active", startPositions: { npc: "c1" } });
  assert.equal(session.groups[0].rules.paceMode, "steady");
  session = rules.beginRound(session);
  const ended = rules.endRound(session, { autoSkipUnacted: false, completeOnOutcome: false });
  assert.equal(ended.steadyAdvances[0].advancedObstacles, 1);
  assert.equal(ended.session.groups[0].position.nodeId, "c2");
});

test("fractional steady pace can model a slower hard obstacle", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("npc", "quarry", [], { npc: true, obstaclesPerRound: 0.5 })] });
  let session = rules.initializeSession(bp, { status: "active", startPositions: { npc: "c1" } });
  session = rules.beginRound(session);
  session = rules.endRound(session, { autoSkipUnacted: false, completeOnOutcome: false }).session;
  assert.equal(session.groups[0].position.nodeId, "c1");
  session = rules.beginRound(session);
  session = rules.endRound(session, { autoSkipUnacted: false, completeOnOutcome: false }).session;
  assert.equal(session.groups[0].position.nodeId, "c2");
});


test("pursuit start-distance helper places quarry one obstacle ahead on an initial linear route", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  const positions = rules.deriveStartPositions(bp);
  assert.equal(positions.q, "c2");
  assert.equal(positions.p, "c1");
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false });
  assert.equal(session.groups.find(item => item.id === "runtime-q").position.nodeId, "c2");
  assert.equal(session.groups.find(item => item.id === "runtime-p").position.nodeId, "c1");
});

test("startDistance zero supports a deliberately short same-position pursuit", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  bp.settings.startDistance = 0;
  const positions = rules.deriveStartPositions(bp);
  assert.equal(positions.q, "c1");
  assert.equal(positions.p, "c1");
});

test("pursuit ends when pursuer and quarry occupy the same chase position", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { q: "c2", p: "c2" } });
  const outcome = rules.evaluateOutcome(session);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.outcome, "quarryCaught");
});

test("pursuit ends in escape when quarry reaches an ending", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { q: "end", p: "c3" } });
  const outcome = rules.evaluateOutcome(session);
  assert.equal(outcome.outcome, "quarryEscaped");
  assert.equal(outcome.reason, "escapeEndpoint");
});

test("escape chase can end at the start of a round with a three-obstacle lead", () => {
  const rules = engine();
  const bp = blueprint({ chaseType: "escape", groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { q: "c3", p: "start" } });
  assert.equal(rules.getObstacleLead(session, "runtime-q", "runtime-p"), 3);
  const outcome = rules.evaluateOutcome(session, { phase: "startOfRound" });
  assert.equal(outcome.outcome, "quarryEscaped");
  assert.equal(outcome.reason, "leadThreshold");
});

test("against-the-clock chase expires at the configured round limit", () => {
  const rules = engine();
  const bp = blueprint({ chaseType: "againstClock", groups: [group("heroes", "participant", [])], victory: { roundLimit: 2 } });
  let session = rules.initializeSession(bp, { status: "active" });
  session = createChaseSession({ ...session, round: 2 });
  const outcome = rules.evaluateOutcome(session, { phase: "endOfRound" });
  assert.equal(outcome.outcome, "timeExpired");
});

test("against-the-clock goal reached wins before expiry", () => {
  const rules = engine();
  const bp = blueprint({ chaseType: "againstClock", groups: [group("heroes", "participant", [])], victory: { roundLimit: 2 } });
  let session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { heroes: "end" } });
  session = createChaseSession({ ...session, round: 2 });
  const outcome = rules.evaluateOutcome(session, { phase: "endOfRound" });
  assert.equal(outcome.outcome, "goalReached");
});

test("race chase declares the group that reaches an ending", () => {
  const rules = engine();
  const bp = blueprint({ chaseType: "race", groups: [group("a", "competitor", []), group("b", "competitor", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { a: "end", b: "c3" } });
  const outcome = rules.evaluateOutcome(session);
  assert.equal(outcome.outcome, "raceWon");
  assert.deepEqual(outcome.winnerGroupIds, ["runtime-a"]);
});

test("quarry acts before pursuers in pursuit and escape policy", () => {
  const rules = engine();
  for (const chaseType of ["pursuit", "escape"]) {
    const bp = blueprint({ chaseType, groups: [group("p", "pursuer", []), group("q", "quarry", [])] });
    const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false });
    assert.deepEqual(rules.getTurnPolicy(session).suggestedOrder.slice(0, 2), ["runtime-q", "runtime-p"]);
  }
});

test("race policy requires initiative", () => {
  const rules = engine();
  const bp = blueprint({ chaseType: "race", groups: [group("a", "competitor", []), group("b", "competitor", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false });
  assert.equal(rules.getTurnPolicy(session).initiativeRequired, true);
});

test("GM Core obstacle-point guideline uses group size minus one or two with minimum one", () => {
  assert.deepEqual(recommendObstaclePoints(4), { groupSize: 4, oneLess: 3, twoLess: 2 });
  assert.deepEqual(recommendObstaclePoints(1), { groupSize: 1, oneLess: 1, twoLess: 1 });
});

test("GM Core chase-length guidelines are 6, 8, and 10 obstacles", () => {
  assert.equal(getChaseLengthGuideline("short"), 6);
  assert.equal(getChaseLengthGuideline("medium"), 8);
  assert.equal(getChaseLengthGuideline("long"), 10);
});

test("completeSession produces a persisted result summary", () => {
  const rules = engine();
  const bp = blueprint({ groups: [group("q", "quarry", []), group("p", "pursuer", [])] });
  const session = rules.initializeSession(bp, { status: "active", autoResolveStart: false, startPositions: { q: "c2", p: "c2" } });
  const evaluation = rules.evaluateOutcome(session);
  const completed = rules.completeSession(session, evaluation);
  assert.equal(completed.session.status, "completed");
  assert.equal(completed.result.outcome, "quarryCaught");
  assert.equal(completed.result.sessionId, session.id);
});
