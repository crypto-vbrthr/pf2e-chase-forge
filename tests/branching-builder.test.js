import test from "node:test";
import assert from "node:assert/strict";
import { createBasicBuilderDraft, addManualCardToBasicBlueprint, addParticipantToBasicBlueprint, replaceBasicGroupsForChaseType } from "../scripts/builder/basic-builder-model.js";
import {
  addBranchAfterCard,
  appendCardToBranchRoute,
  appendMainlineManualCard,
  isBranchingBuilderBlueprint,
  insertManualCardRelativeToBuilderCard,
  listBranchGroups,
  listEditableCards,
  removeBranchGroup,
  removeBuilderCardByRef,
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


test("Branch-lane cards can be removed without breaking the branch graph", () => {
  let blueprint = branchedDraft();
  const groupBefore = listBranchGroups(blueprint)[0];
  const routeBefore = groupBefore.routes[0];
  const branchCardRef = routeBefore.nodes[0].ref;
  blueprint = removeBuilderCardByRef(blueprint, branchCardRef);
  const groupAfter = listBranchGroups(blueprint)[0];
  const routeAfter = groupAfter.routes.find(route => route.edgeId === routeBefore.edgeId);
  assert.ok(routeAfter);
  assert.equal(routeAfter.nodes.length, 0);
  assert.equal(blueprint.contentSnapshots.cards.some(record => record.ref === branchCardRef), false);
  assert.equal(validateBranchingBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("A middle branch-lane card can be removed and its route reconnects", () => {
  let blueprint = branchedDraft();
  const routeEntry = listBranchGroups(blueprint)[0].routes[0];
  blueprint = appendCardToBranchRoute(blueprint, routeEntry.edgeId, { name: "Glockenturm" });
  blueprint = appendCardToBranchRoute(blueprint, routeEntry.edgeId, { name: "Dachfirst" });
  let route = listBranchGroups(blueprint)[0].routes.find(candidate => candidate.edgeId === routeEntry.edgeId);
  assert.equal(route.nodes.length, 3);
  const middleRef = route.nodes[1].ref;
  blueprint = removeBuilderCardByRef(blueprint, middleRef);
  route = listBranchGroups(blueprint)[0].routes.find(candidate => candidate.edgeId === routeEntry.edgeId);
  assert.deepEqual(route.nodes.map(node => node.name), [routeEntry.nodes[0].name, "Dachfirst"]);
  assert.equal(validateBranchingBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("Ordinary mainline cards remain deletable after branching is enabled", () => {
  let blueprint = branchedDraft();
  blueprint = appendMainlineManualCard(blueprint, { name: "Hafen" }).blueprint;
  const harbor = listEditableCards(blueprint).find(entry => entry.card?.name === "Hafen");
  assert.ok(harbor?.ref);
  blueprint = removeBuilderCardByRef(blueprint, harbor.ref);
  assert.equal(listEditableCards(blueprint).some(entry => entry.card?.name === "Hafen"), false);
  assert.equal(validateBranchingBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("A card that owns a branch is protected until the branch block is removed", () => {
  const blueprint = branchedDraft();
  const group = listBranchGroups(blueprint)[0];
  const source = listEditableCards(blueprint).find(entry => entry.nodeId === group.sourceNodeId);
  assert.ok(source?.ref);
  assert.throws(() => removeBuilderCardByRef(blueprint, source.ref), error => error?.code === "BRANCH_SOURCE_CARD");
});


test("relative insertion preserves branch-entry semantics before the first lane card", () => {
  let blueprint = branchedDraft();
  const groupBefore = listBranchGroups(blueprint)[0];
  const routeBefore = groupBefore.routes[0];
  const firstRef = routeBefore.nodes[0].ref;
  const entryId = routeBefore.edgeId;
  const result = insertManualCardRelativeToBuilderCard(blueprint, firstRef, { position: "before", name: "Dachrinne" });
  blueprint = result.blueprint;
  const groupAfter = listBranchGroups(blueprint)[0];
  const routeAfter = groupAfter.routes.find(route => route.edgeId === entryId);
  assert.deepEqual(routeAfter.nodes.map(node => node.name), ["Dachrinne", routeBefore.nodes[0].name]);
  const insertedNode = blueprint.graph.nodes.find(node => node.cardRef === result.ref);
  assert.equal(insertedNode.metadata.branchGroupId, groupAfter.branchGroupId);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});

test("relative insertion after a lane card stays inside that branch lane", () => {
  let blueprint = branchedDraft();
  const groupBefore = listBranchGroups(blueprint)[0];
  const routeBefore = groupBefore.routes[1];
  const targetRef = routeBefore.nodes[0].ref;
  const result = insertManualCardRelativeToBuilderCard(blueprint, targetRef, { position: "after", name: "Hinterhof" });
  blueprint = result.blueprint;
  const routeAfter = listBranchGroups(blueprint)[0].routes.find(route => route.edgeId === routeBefore.edgeId);
  assert.deepEqual(routeAfter.nodes.map(node => node.name), [routeBefore.nodes[0].name, "Hinterhof"]);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
});

test("inserting after a branch source places the new obstacle after the merge and keeps the branch on its source", () => {
  let blueprint = branchedDraft();
  const branchBefore = listBranchGroups(blueprint)[0];
  const sourceNode = blueprint.graph.nodes.find(node => node.id === branchBefore.sourceNodeId);
  const result = insertManualCardRelativeToBuilderCard(blueprint, sourceNode.cardRef, { position: "after", name: "Brunnenplatz" });
  blueprint = result.blueprint;
  const branchAfter = listBranchGroups(blueprint)[0];
  const insertedNode = blueprint.graph.nodes.find(node => node.cardRef === result.ref);
  assert.equal(branchAfter.sourceNodeId, sourceNode.id);
  assert.equal(branchAfter.continuationNodeId, insertedNode.id);
  assert.equal(branchAfter.routes.length, 2);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);

  // Removing the branch must retain the newly inserted post-merge card.
  blueprint = removeBranchGroup(blueprint, branchAfter.branchGroupId);
  assert.equal(listEditableCards(blueprint).some(item => item.card?.name === "Brunnenplatz"), true);
});

test("relative insertion before the mainline continuation after a branch keeps the merge connection valid", () => {
  let blueprint = branchedDraft();
  const continuation = listEditableCards(blueprint).find(item => item.card?.name === "Nordtor");
  const result = insertManualCardRelativeToBuilderCard(blueprint, continuation.ref, { position: "before", name: "Torplatz" });
  blueprint = result.blueprint;
  const branch = listBranchGroups(blueprint)[0];
  const insertedNode = blueprint.graph.nodes.find(node => node.cardRef === result.ref);
  assert.equal(branch.continuationNodeId, insertedNode.id);
  const mergeEdge = blueprint.graph.edges.find(edge => edge.from === branch.mergeNodeId);
  assert.equal(mergeEdge.to, insertedNode.id);
  assert.equal(validateBranchingBuilderBlueprint(blueprint).valid, true);
  blueprint = removeBranchGroup(blueprint, branch.branchGroupId);
  assert.equal(listEditableCards(blueprint).some(item => item.card?.name === "Torplatz"), true);
});
