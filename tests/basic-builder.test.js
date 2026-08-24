import test from "node:test";
import assert from "node:assert/strict";
import {
  addApproachToBasicCard,
  addCardToBasicBlueprint,
  addManualCardToBasicBlueprint,
  addParticipantToBasicBlueprint,
  createBasicBuilderDraft,
  isBasicLinearBlueprint,
  listBasicCards,
  moveCardInBasicBlueprint,
  removeApproachFromBasicCard,
  removeCardFromBasicBlueprint,
  replaceBasicGroupsForChaseType,
  updateBasicCard,
  validateBasicBuilderBlueprint
} from "../scripts/builder/basic-builder-model.js";
import { createParticipant } from "../scripts/data/factories.js";
import { branchedGraph, sampleBlueprint, sampleCard } from "./helpers.js";

test("Basic Builder creates a valid empty linear Blueprint", () => {
  const blueprint = createBasicBuilderDraft({ name: "Rooftop Chase" });
  assert.equal(blueprint.name, "Rooftop Chase");
  assert.equal(blueprint.settings.routeComplexity, "linear");
  assert.equal(blueprint.contentSnapshots.mode, "snapshot");
  assert.equal(blueprint.groups.length, 2);
  assert.equal(blueprint.groups[0].role, "quarry");
  assert.equal(blueprint.groups[1].role, "pursuer");
  assert.equal(isBasicLinearBlueprint(blueprint), true);
  assert.equal(validateBasicBuilderBlueprint(blueprint).valid, true);
});

test("manual cards become local snapshots and route nodes", () => {
  let blueprint = createBasicBuilderDraft();
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Wide Gap", requiredPoints: 3 }).blueprint;
  const cards = listBasicCards(blueprint);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].card.name, "Wide Gap");
  assert.equal(cards[0].card.obstacle.requiredPoints, 3);
  assert.equal(cards[0].record.metadata.originCardRef, null);
  assert.equal(blueprint.graph.nodes.length, 3);
  assert.equal(blueprint.graph.nodes[1].cardRef, cards[0].ref);
  assert.equal(validateBasicBuilderBlueprint(blueprint, { forStart: true }).valid, true);
});

test("registered cards are cloned per occurrence and keep origin metadata", () => {
  let blueprint = createBasicBuilderDraft();
  const card = sampleCard({ id: "urban:market-crowd", name: "Market Crowd" });
  blueprint = addCardToBasicBlueprint(blueprint, card, { originCardRef: card.id }).blueprint;
  blueprint = addCardToBasicBlueprint(blueprint, card, { originCardRef: card.id }).blueprint;
  const cards = listBasicCards(blueprint);
  assert.equal(cards.length, 2);
  assert.notEqual(cards[0].ref, cards[1].ref);
  assert.equal(cards[0].record.metadata.originCardRef, "urban:market-crowd");
  assert.equal(cards[1].record.metadata.originCardRef, "urban:market-crowd");
  assert.equal(cards[0].card.metadata.originCardRef, "urban:market-crowd");
});

test("card order can be changed without losing snapshots", () => {
  let blueprint = createBasicBuilderDraft();
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "One" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Two" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Three" }).blueprint;
  const refs = listBasicCards(blueprint).map(item => item.ref).sort();
  blueprint = moveCardInBasicBlueprint(blueprint, 2, 0);
  assert.deepEqual(listBasicCards(blueprint).map(item => item.card.name), ["Three", "One", "Two"]);
  assert.deepEqual(listBasicCards(blueprint).map(item => item.ref).sort(), refs);
});

test("card overrides and approach editing remain valid", () => {
  let blueprint = createBasicBuilderDraft();
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Jump" }).blueprint;
  blueprint = updateBasicCard(blueprint, 0, card => ({
    ...card,
    name: "Dangerous Jump",
    obstacle: { ...card.obstacle, requiredPoints: 4 },
    approaches: card.approaches.map(approach => ({
      ...approach,
      label: "Leap",
      statistic: "acrobatics",
      dc: { ...approach.dc, mode: "fixed", value: 24 }
    }))
  }));
  blueprint = addApproachToBasicCard(blueprint, 0, { label: "Climb Around", statistic: "athletics" });
  let card = listBasicCards(blueprint)[0].card;
  assert.equal(card.name, "Dangerous Jump");
  assert.equal(card.obstacle.requiredPoints, 4);
  assert.equal(card.approaches.length, 2);
  assert.equal(card.approaches[0].dc.value, 24);
  blueprint = removeApproachFromBasicCard(blueprint, 0, 0);
  card = listBasicCards(blueprint)[0].card;
  assert.equal(card.approaches.length, 1);
  assert.equal(card.approaches[0].label, "Climb Around");
  assert.equal(validateBasicBuilderBlueprint(blueprint).valid, true);
});

test("cards can be removed and the graph is rebuilt cleanly", () => {
  let blueprint = createBasicBuilderDraft();
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "One" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Two" }).blueprint;
  blueprint = removeCardFromBasicBlueprint(blueprint, 0);
  assert.deepEqual(listBasicCards(blueprint).map(item => item.card.name), ["Two"]);
  assert.equal(blueprint.graph.nodes.length, 3);
  assert.equal(validateBasicBuilderBlueprint(blueprint).valid, true);
});

test("participants can be added without duplicate UUIDs inside a group", () => {
  let blueprint = createBasicBuilderDraft();
  const groupId = blueprint.groups[1].id;
  const participant = createParticipant({ id: "hero", kind: "actor", uuid: "Actor.hero", name: "Hero" });
  blueprint = addParticipantToBasicBlueprint(blueprint, groupId, participant);
  blueprint = addParticipantToBasicBlueprint(blueprint, groupId, { ...participant, id: "hero-copy" });
  assert.equal(blueprint.groups[1].participants.length, 1);
  assert.equal(blueprint.groups[1].participants[0].uuid, "Actor.hero");
});

test("group defaults can be reset for race and against-clock chases", () => {
  let blueprint = createBasicBuilderDraft();
  blueprint = replaceBasicGroupsForChaseType(blueprint, "race", { preserveParticipants: false });
  assert.equal(blueprint.settings.chaseType, "race");
  assert.equal(blueprint.groups.length, 2);
  assert.ok(blueprint.groups.every(group => group.role === "competitor"));
  assert.equal(validateBasicBuilderBlueprint(blueprint).valid, true);
  blueprint = replaceBasicGroupsForChaseType(blueprint, "againstClock", { preserveParticipants: false });
  assert.equal(blueprint.groups.length, 1);
  assert.equal(blueprint.groups[0].role, "participant");
  assert.equal(validateBasicBuilderBlueprint(blueprint).valid, true);
});

test("start validation requires at least one card", () => {
  const blueprint = createBasicBuilderDraft();
  const result = validateBasicBuilderBlueprint(blueprint, { forStart: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === "BASIC_BUILDER_NO_CARDS"));
});

test("Basic Builder refuses to edit a branched graph", () => {
  const branched = sampleBlueprint(branchedGraph(), {
    settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "branched", startDistance: 1 }
  });
  assert.equal(isBasicLinearBlueprint(branched), false);
  assert.throws(() => addManualCardToBasicBlueprint(branched), /linear Blueprints/);
});
