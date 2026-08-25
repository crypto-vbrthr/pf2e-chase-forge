import test from "node:test";
import assert from "node:assert/strict";
import { createBasicBuilderDraft, addManualCardToBasicBlueprint, addParticipantToBasicBlueprint, replaceBasicGroupsForChaseType } from "../scripts/builder/basic-builder-model.js";
import {
  addBranchAfterCard,
  appendCardToBranchRoute,
  appendMainlineManualCard,
  isBranchingBuilderBlueprint,
  listBranchGroups,
  listEditableCards,
  removeBranchGroup,
  updateBranchRoute,
  validateBranchingBuilderBlueprint
} from "../scripts/builder/branching-builder-model.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";

function branchedDraft() {
  let blueprint = createBasicBuilderDraft({ name: "Branch Test" });
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Marktplatz", requiredPoints: 1 }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Nordtor", requiredPoints: 1 }).blueprint;
  blueprint = addParticipantToBasicBlueprint(blueprint, blueprint.groups[0].id, { id: "runner", kind: "abstract", name: "Runner" });
  const sourceNodeId = blueprint.graph.nodes.find(node => node.type === "card" && node.label === "Marktplatz").id;
  return addBranchAfterCard(blueprint, sourceNodeId, { leftLabel: "Dächer", rightLabel: "Gassen" });
}

test("Branching Builder converts a linear route into a valid split and merge graph", () => {
  const blueprint = branchedDraft();
  assert.equal(isBranchingBuilderBlueprint(blueprint), true);
  assert.equal(blueprint.settings.routeComplexity, "branched");
  assert.equal(blueprint.metadata.builder.mode, "branching");
  const branches = listBranchGroups(blueprint);
  assert.equal(branches.length, 1);
  assert.deepEqual(branches[0].routes.map(route => route.label).sort(), ["Dächer", "Gassen"]);
  assert.equal(branches[0].routes.every(route => route.nodes.length === 1), true);
  assert.equal(validateBranchingBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("Branch routes can be extended with additional obstacles", () => {
  let blueprint = branchedDraft();
  const first = listBranchGroups(blueprint)[0].routes[0];
  blueprint = appendCardToBranchRoute(blueprint, first.edgeId, { name: "Glockenturm" });
  const route = listBranchGroups(blueprint)[0].routes.find(candidate => candidate.edgeId === first.edgeId);
  assert.equal(route.nodes.length, 2);
  assert.equal(route.nodes.at(-1).name, "Glockenturm");
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});


test("Branching Builder can append new mainline obstacles after a branch block", () => {
  let blueprint = branchedDraft();
  const before = listEditableCards(blueprint).map(entry => entry.card?.name);
  blueprint = appendMainlineManualCard(blueprint, { name: "Hafen" }).blueprint;
  const after = listEditableCards(blueprint).map(entry => entry.card?.name);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.includes("Hafen"), true);
  const endId = blueprint.graph.endNodeIds[0];
  const incoming = blueprint.graph.edges.filter(edge => edge.to === endId);
  assert.equal(incoming.length, 1);
  const addedNode = blueprint.graph.nodes.find(node => node.id === incoming[0].from);
  assert.equal(addedNode?.label, "Hafen");
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});

test("Branching Builder supports multiple sequential branch blocks on the mainline", () => {
  let blueprint = branchedDraft();
  blueprint = appendMainlineManualCard(blueprint, { name: "Hafen" }).blueprint;
  const harbor = blueprint.graph.nodes.find(node => node.type === "card" && node.label === "Hafen");
  assert.ok(harbor);
  blueprint = addBranchAfterCard(blueprint, harbor.id, { leftLabel: "Pier", rightLabel: "Lagerhaus" });
  const groups = listBranchGroups(blueprint);
  assert.equal(groups.length, 2);
  assert.equal(validateBranchingBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("Branch entry labels and visibility are editable without exposing hidden routes by default", () => {
  let blueprint = branchedDraft();
  const route = listBranchGroups(blueprint)[0].routes[0];
  blueprint = updateBranchRoute(blueprint, route.edgeId, { label: "Geheime Dachroute", visibility: "discoverable" });
  const updated = listBranchGroups(blueprint)[0].routes.find(candidate => candidate.edgeId === route.edgeId);
  assert.equal(updated.label, "Geheime Dachroute");
  assert.equal(updated.visibility, "discoverable");
});

test("Removing the last branch restores the basic linear Builder", () => {
  let blueprint = branchedDraft();
  const branchId = listBranchGroups(blueprint)[0].branchGroupId;
  blueprint = removeBranchGroup(blueprint, branchId);
  assert.equal(blueprint.metadata.builder.mode, "basic");
  assert.equal(blueprint.settings.routeComplexity, "linear");
  assert.equal(listEditableCards(blueprint).length, 2);
});

test("Rules Engine pauses after a cleared obstacle when a player route decision is required", () => {
  const blueprint = branchedDraft();
  const rules = createChaseRulesEngine({
    cardResolver: (cardRef, _session) => blueprint.contentSnapshots.cards.find(record => record.ref === cardRef)?.data ?? null
  });
  let session = rules.initializeSession(blueprint, { status: "active" });
  const groupId = session.groups[0].id;
  session = rules.beginRound(session);
  const result = rules.applyAutomaticContribution(session, { runtimeGroupId: groupId, participantId: "runner", points: 1 });
  assert.equal(result.obstacleCleared, true);
  assert.equal(result.routeChoiceRequired, true);
  assert.equal(result.session.groups[0].position.nodeId, blueprint.graph.nodes.find(node => node.label === "Marktplatz").id);
});

test("adding a participant to an existing branch keeps the Builder editable", () => {
  let blueprint = branchedDraft();
  const groupId = blueprint.groups[1].id;
  blueprint = addParticipantToBasicBlueprint(blueprint, groupId, {
    id: "late-pursuer",
    kind: "actor",
    uuid: "Actor.late-pursuer",
    name: "Late Pursuer"
  });
  assert.equal(blueprint.metadata.builder.mode, "branching");
  assert.equal(blueprint.settings.routeComplexity, "branched");
  assert.equal(isBranchingBuilderBlueprint(blueprint), true);
  assert.equal(blueprint.groups[1].participants.some(participant => participant.id === "late-pursuer"), true);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});


test("group resets on an existing branch keep the Builder mode intact", () => {
  let blueprint = branchedDraft();
  blueprint = replaceBasicGroupsForChaseType(blueprint, blueprint.settings.chaseType, { preserveParticipants: true });
  assert.equal(blueprint.metadata.builder.mode, "branching");
  assert.equal(blueprint.settings.routeComplexity, "branched");
  assert.equal(isBranchingBuilderBlueprint(blueprint), true);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});
