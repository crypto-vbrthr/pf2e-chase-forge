import test from "node:test";
import assert from "node:assert/strict";
import { buildLibraryBlueprintPreview, buildRouteDiagramModel } from "../scripts/app/chase-builder-app.js";
import { createChaseCard } from "../scripts/data/factories.js";

function card(id, name) {
  return createChaseCard({
    id,
    source: { moduleId: "addon", packId: "urban", version: "1" },
    type: "obstacle",
    name,
    description: `${name} description`,
    gmNotes: `${name} notes`,
    obstacle: { requiredPoints: 1, scalable: false },
    approaches: [{ id: `${id}-a`, label: "Athletics", statistic: "athletics", dc: { mode: "simple", proficiency: "trained", hidden: true } }],
    tags: ["urban"]
  });
}

function node(id, type, cardRef = null) {
  return { id, type, label: id, description: "", cardRef, public: true, image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }, metadata: {} };
}
function edge(id, from, to, label = "") {
  return { id, from, to, type: label ? "branch" : "normal", visibility: "public", label, description: "", conditions: [], metadata: {} };
}

test("reference-mode Library Blueprints expose registered card details to the Builder preview", () => {
  const cards = new Map([
    ["addon:street", card("addon:street", "Crowded Street")],
    ["addon:roof", card("addon:roof", "Rooftop")],
    ["addon:alley", card("addon:alley", "Alley")],
    ["addon:gate", card("addon:gate", "Gate")]
  ]);
  const blueprint = {
    graph: {
      startNodeId: "start",
      endNodeIds: ["end"],
      nodes: [
        node("start", "start"),
        node("street", "card", "addon:street"),
        node("choice", "choice"),
        node("roof", "card", "addon:roof"),
        node("alley", "card", "addon:alley"),
        node("merge", "merge"),
        node("gate", "card", "addon:gate"),
        node("end", "end")
      ],
      edges: [
        edge("e1", "start", "street"), edge("e2", "street", "choice"),
        edge("e3", "choice", "roof", "High Route"), edge("e4", "choice", "alley", "Low Route"),
        edge("e5", "roof", "merge"), edge("e6", "alley", "merge"),
        edge("e7", "merge", "gate"), edge("e8", "gate", "end")
      ]
    },
    contentSnapshots: { mode: "references", cards: [] }
  };
  const chaseApi = { cards: { get: id => cards.get(id) ?? null } };
  const preview = buildLibraryBlueprintPreview(blueprint, chaseApi);
  assert.equal(preview.cards.length, 4);
  assert.equal(preview.cards.find(item => item.ref === "addon:roof")?.card?.description, "Rooftop description");
  assert.equal(preview.cards.find(item => item.ref === "addon:roof")?.card?.gmNotes, "Rooftop notes");
  assert.equal(preview.branchGroups.length, 1);
  assert.deepEqual(preview.branchGroups[0].routes.map(route => route.nodes.map(item => item.ref)), [["addon:roof"], ["addon:alley"]]);

  const diagram = buildRouteDiagramModel(preview.cards, preview.branchGroups, { editable: false });
  assert.equal(diagram.items.filter(item => item.isBranch).length, 1);
  assert.equal(diagram.items.find(item => item.isCard)?.card?.name, "Crowded Street");
});

test("Library Blueprint preview prefers an embedded snapshot when one exists", () => {
  const registered = card("addon:street", "Registry Version");
  const snap = card("addon:street", "Snapshot Version");
  const blueprint = {
    graph: { startNodeId: "start", endNodeIds: ["end"], nodes: [node("start", "start"), node("street", "card", "addon:street"), node("end", "end")], edges: [edge("e1", "start", "street"), edge("e2", "street", "end")] },
    contentSnapshots: { mode: "snapshot", cards: [{ ref: "addon:street", data: snap, metadata: {} }] }
  };
  const preview = buildLibraryBlueprintPreview(blueprint, { cards: { get: () => registered } });
  assert.equal(preview.cards[0].card.name, "Snapshot Version");
});
