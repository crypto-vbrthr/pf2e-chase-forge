import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBuilderRouteData,
  validateLibraryBlueprintPreview
} from "../scripts/app/chase-builder-app.js";
import { createChaseBlueprint, createChaseCard } from "../scripts/data/factories.js";
import { validateChaseBlueprint } from "../scripts/data/validators.js";

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

function linearReferenceBlueprint() {
  return createChaseBlueprint({
    id: "library-linear",
    source: { moduleId: "addon", packId: "urban", version: "1" },
    name: "Linear Library Chase",
    settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "linear", startDistance: 1 },
    groups: [
      { id: "q", name: "Quarry", role: "quarry", participants: [], public: true, metadata: {} },
      { id: "p", name: "Pursuers", role: "pursuer", participants: [], public: true, metadata: {} }
    ],
    graph: {
      startNodeId: "start",
      endNodeIds: ["end"],
      nodes: [
        { id: "start", type: "start", label: "Start", description: "", cardRef: null, public: true, image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }, metadata: {} },
        { id: "c1", type: "card", label: "Crowd", description: "", cardRef: "addon:crowd", public: true, image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }, metadata: {} },
        { id: "c2", type: "card", label: "Stall", description: "", cardRef: "addon:stall", public: true, image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }, metadata: {} },
        { id: "end", type: "end", label: "End", description: "", cardRef: null, public: true, image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }, metadata: {} }
      ],
      edges: [
        { id: "e1", from: "start", to: "c1", type: "normal", visibility: "public", label: "", description: "", conditions: [], metadata: {} },
        { id: "e2", from: "c1", to: "c2", type: "normal", visibility: "public", label: "", description: "", conditions: [], metadata: {} },
        { id: "e3", from: "c2", to: "end", type: "normal", visibility: "public", label: "", description: "", conditions: [], metadata: {} }
      ]
    },
    contentSnapshots: { mode: "references", cards: [], images: [], effects: [], metadata: {} }
  });
}

test("linear reference-mode Library Blueprints use registry cards instead of editable snapshot cards", () => {
  const blueprint = linearReferenceBlueprint();
  const registry = new Map([
    ["addon:crowd", card("addon:crowd", "Crowd")],
    ["addon:stall", card("addon:stall", "Stall")]
  ]);
  const chaseApi = {
    cards: { get: id => registry.get(id) ?? null },
    validation: { blueprint: validateChaseBlueprint }
  };

  const route = resolveBuilderRouteData(blueprint, chaseApi, { librarySelected: true });
  assert.equal(route.builderSupported, true, "the graph is intentionally Basic-Builder shaped");
  assert.equal(route.cards.length, 2);
  assert.equal(route.cards[0].card.name, "Crowd");
  assert.equal(route.cards[0].card.gmNotes, "Crowd notes");
  assert.equal(route.routeWorkspaceSupported, true);

  const validation = validateLibraryBlueprintPreview(blueprint, chaseApi, route.libraryPreview);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.some(issue => issue.code === "BASIC_BUILDER_CARD_MISSING"), false);
});

test("Library Blueprint preview reports genuinely unresolved registry card references", () => {
  const blueprint = linearReferenceBlueprint();
  const chaseApi = {
    cards: { get: id => id === "addon:crowd" ? card("addon:crowd", "Crowd") : null },
    validation: { blueprint: validateChaseBlueprint }
  };
  const route = resolveBuilderRouteData(blueprint, chaseApi, { librarySelected: true });
  const validation = validateLibraryBlueprintPreview(blueprint, chaseApi, route.libraryPreview);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors.find(issue => issue.code === "LIBRARY_CARD_UNRESOLVED")?.details?.refs, ["addon:stall"]);
});
