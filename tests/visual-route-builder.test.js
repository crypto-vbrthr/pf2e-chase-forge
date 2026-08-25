import test from "node:test";
import assert from "node:assert/strict";
import { createBasicBuilderDraft, addManualCardToBasicBlueprint } from "../scripts/builder/basic-builder-model.js";
import { addBranchAfterCard, appendCardToBranchRoute, listBranchGroups, listEditableCards } from "../scripts/builder/branching-builder-model.js";
import { buildRouteDiagramModel } from "../scripts/app/chase-builder-app.js";

function cardViews(blueprint) {
  return listEditableCards(blueprint).map(item => ({
    ...item,
    displayIndex: item.index + 1,
    typeLabel: item.card?.type ?? "obstacle"
  }));
}

test("visual route diagram keeps linear cards in compact mainline order", () => {
  let blueprint = createBasicBuilderDraft({ name: "Linear Diagram" });
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Markt" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Tor" }).blueprint;
  const diagram = buildRouteDiagramModel(cardViews(blueprint), [], { editable: true });
  assert.deepEqual(diagram.items.map(item => item.card?.name), ["Markt", "Tor"]);
  assert.equal(diagram.branchCount, 0);
  assert.equal(diagram.empty, false);
});

test("visual route diagram inserts a split immediately after its source obstacle and merges before continuation", () => {
  let blueprint = createBasicBuilderDraft({ name: "Branch Diagram" });
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Marktplatz" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Nordtor" }).blueprint;
  const sourceNodeId = blueprint.graph.nodes.find(node => node.type === "card" && node.label === "Marktplatz").id;
  blueprint = addBranchAfterCard(blueprint, sourceNodeId, { leftLabel: "Dächer", rightLabel: "Gassen" });
  const groups = listBranchGroups(blueprint);
  const diagram = buildRouteDiagramModel(cardViews(blueprint), groups, { editable: true });

  assert.deepEqual(diagram.items.map(item => item.kind), ["card", "branch", "card"]);
  assert.equal(diagram.items[0].card.name, "Marktplatz");
  assert.equal(diagram.items[1].branch.sourceLabel, "Marktplatz");
  assert.equal(diagram.items[2].card.name, "Nordtor");
  assert.deepEqual(diagram.items[1].branch.routes.map(route => route.label).sort(), ["Dächer", "Gassen"]);
  assert.equal(diagram.items[1].branch.routes.every(route => route.cards.length === 1), true);
});

test("visual route lanes include every card on unequal branch paths without duplicating them on the mainline", () => {
  let blueprint = createBasicBuilderDraft({ name: "Long Branch Diagram" });
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Marktplatz" }).blueprint;
  blueprint = addManualCardToBasicBlueprint(blueprint, { name: "Hafen" }).blueprint;
  const sourceNodeId = blueprint.graph.nodes.find(node => node.type === "card" && node.label === "Marktplatz").id;
  blueprint = addBranchAfterCard(blueprint, sourceNodeId, { leftLabel: "Dächer", rightLabel: "Gassen" });
  const left = listBranchGroups(blueprint)[0].routes.find(route => route.label === "Dächer");
  blueprint = appendCardToBranchRoute(blueprint, left.edgeId, { name: "Glockenturm" });

  const groups = listBranchGroups(blueprint);
  const diagram = buildRouteDiagramModel(cardViews(blueprint), groups, { editable: true });
  const branch = diagram.items.find(item => item.isBranch).branch;
  const roofs = branch.routes.find(route => route.label === "Dächer");
  assert.deepEqual(roofs.cards.map(card => card.name), ["Route A – Hindernis", "Glockenturm"]);
  assert.deepEqual(diagram.items.filter(item => item.isCard).map(item => item.card.name), ["Marktplatz", "Hafen"]);
});
