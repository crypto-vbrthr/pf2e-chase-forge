import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptCompatibleExtendedGraph,
  isBranchingBuilderBlueprint,
  listBranchGroups
} from "../scripts/builder/branching-builder-model.js";
import { addParticipantToBasicBlueprint } from "../scripts/builder/basic-builder-model.js";
import { materializeLibraryCopyLocalization, resolveBuilderRouteData } from "../scripts/app/chase-builder-app.js";
import { createChaseBlueprint, createChaseCard } from "../scripts/data/factories.js";

function image() { return { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] }; }
function card(ref, name) {
  return createChaseCard({
    id: ref,
    source: { moduleId: "addon", packId: "urban", version: "1" },
    type: "obstacle",
    name,
    description: `${name} description`,
    gmNotes: `${name} notes`,
    obstacle: { requiredPoints: 1, scalable: false },
    approaches: [{ id: `${ref}-a`, label: "Athletics", statistic: "athletics", dc: { mode: "simple", proficiency: "trained", hidden: true } }],
    tags: ["urban"]
  });
}
function node(id, type, cardRef = null) { return { id, type, label: id, description: "", cardRef, public: true, image: image(), metadata: {} }; }
function edge(id, from, to, { type = "normal", label = "" } = {}) { return { id, from, to, type, visibility: "public", label, description: "", conditions: [], metadata: {} }; }

function copiedChoiceMergeBlueprint() {
  const refs = ["addon:street", "addon:roof", "addon:alley", "addon:gate"];
  return createChaseBlueprint({
    id: "world-copy",
    source: { moduleId: "pf2e-chase-forge", packId: "world-builder", version: "1.0.5" },
    name: "Copied Library Chase",
    settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "branched", startDistance: 1 },
    groups: [
      { id: "q", name: "Quarry", role: "quarry", participants: [], public: true, metadata: {} },
      { id: "p", name: "Pursuers", role: "pursuer", participants: [], public: true, metadata: {} }
    ],
    graph: {
      startNodeId: "start",
      endNodeIds: ["end"],
      nodes: [node("start", "start"), node("street", "card", refs[0]), node("choice", "choice"), node("roof", "card", refs[1]), node("alley", "card", refs[2]), node("merge", "merge"), node("gate", "card", refs[3]), node("end", "end")],
      edges: [
        edge("e1", "start", "street"), edge("e2", "street", "choice"),
        edge("e3", "choice", "roof", { type: "branch", label: "High Route" }), edge("e4", "choice", "alley", { type: "branch", label: "Low Route" }),
        edge("e5", "roof", "merge"), edge("e6", "alley", "merge"), edge("e7", "merge", "gate"), edge("e8", "gate", "end")
      ]
    },
    contentSnapshots: {
      mode: "snapshot",
      cards: refs.map(ref => ({ ref, source: { moduleId: "addon", packId: "urban", version: "1" }, data: card(ref, ref.split(":")[1]), metadata: {} })),
      images: [], effects: [], metadata: {}
    }
  });
}

test("copied conventional choice/merge Library graphs are adopted by the managed Branching Builder", () => {
  const source = copiedChoiceMergeBlueprint();
  assert.equal(isBranchingBuilderBlueprint(source), false);
  const adopted = adoptCompatibleExtendedGraph(source);
  assert.equal(isBranchingBuilderBlueprint(adopted), true);
  assert.equal(adopted.graph.nodes.some(item => item.type === "choice"), false);
  const groups = listBranchGroups(adopted);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].routes.map(route => route.nodes.map(item => item.ref)), [["addon:roof"], ["addon:alley"]]);
  assert.equal(groups[0].sourceNodeId, "street");
  assert.equal(groups[0].mergeNodeId, "merge");
});

test("unsupported advanced world copies remain document-editable without being mislabeled as Basic Builder graphs", () => {
  const refs = ["addon:street", "addon:roof", "addon:alley"];
  const advanced = createChaseBlueprint({
    id: "terminal-split",
    source: { moduleId: "pf2e-chase-forge", packId: "world-builder", version: "1.0.5" },
    name: "Terminal Split",
    settings: { chaseType: "escape", length: "short", difficulty: "moderate", routeComplexity: "branched", startDistance: 1 },
    groups: [{ id: "p", name: "Pursuers", role: "pursuer", participants: [], public: true, metadata: {} }],
    graph: {
      startNodeId: "start", endNodeIds: ["end-a", "end-b"],
      nodes: [node("start", "start"), node("street", "card", refs[0]), node("choice", "choice"), node("roof", "card", refs[1]), node("alley", "card", refs[2]), node("end-a", "end"), node("end-b", "end")],
      edges: [edge("e1", "start", "street"), edge("e2", "street", "choice"), edge("e3", "choice", "roof", { type: "branch", label: "A" }), edge("e4", "choice", "alley", { type: "branch", label: "B" }), edge("e5", "roof", "end-a"), edge("e6", "alley", "end-b")]
    },
    contentSnapshots: { mode: "snapshot", cards: refs.map(ref => ({ ref, data: card(ref, ref), metadata: {} })), images: [], effects: [], metadata: {} }
  });
  const unchanged = adoptCompatibleExtendedGraph(advanced);
  assert.equal(isBranchingBuilderBlueprint(unchanged), false);
  const withParticipant = addParticipantToBasicBlueprint(unchanged, "p", { id: "pc-1", kind: "actor", uuid: "Actor.pc1", name: "PC", ownerUserIds: [] });
  assert.equal(withParticipant.groups[0].participants.length, 1);
  assert.notEqual(withParticipant.metadata?.builder?.mode, "basic");

  const route = resolveBuilderRouteData(withParticipant, { cards: { get: ref => card(ref, ref) } }, { librarySelected: false });
  assert.equal(route.builderSupported, false);
  assert.equal(route.routeWorkspaceSupported, true);
  assert.equal(route.cards.length, 3);
});


test("owned Library copies freeze card text in the current Foundry language", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      localize: key => ({
        "ADDON.Card.Name": "Rutschige Dachziegel",
        "ADDON.Card.Description": "Die Dächer werden steiler und glänzen vor Nässe.",
        "ADDON.Card.GMNotes": "Ein klassisches Hindernis auf den Dächern."
      })[key] ?? key
    }
  };
  try {
    const raw = createChaseCard({
      id: "addon:slick-tiles",
      source: { moduleId: "addon", packId: "urban", version: "1" },
      type: "obstacle",
      name: "Slick Roof Tiles",
      description: "The roofs steepen and the tiles shine with moisture.",
      gmNotes: "A classic rooftop hazard.",
      obstacle: { requiredPoints: 2, scalable: true },
      approaches: [{ id: "athletics", label: "athletics", statistic: "athletics", dc: { mode: "simple", proficiency: "trained", hidden: true } }],
      metadata: { i18n: { name: "ADDON.Card.Name", description: "ADDON.Card.Description", gmNotes: "ADDON.Card.GMNotes" } }
    });
    const copied = createChaseBlueprint({
      id: "localized-copy",
      source: { moduleId: "pf2e-chase-forge", packId: "world-builder", version: "1.0.5" },
      name: "Der Läufer über den Dächern",
      metadata: { libraryOrigin: { blueprintId: "addon:rooftop" }, i18nBase: "ADDON.Chase" },
      settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "linear", startDistance: 1 },
      groups: [{ id: "p", name: "Verfolger", role: "pursuer", participants: [], public: true, metadata: {} }],
      graph: {
        startNodeId: "start", endNodeIds: ["end"],
        nodes: [node("start", "start"), { ...node("tiles", "card", raw.id), label: "Slick Roof Tiles" }, node("end", "end")],
        edges: [edge("e1", "start", "tiles"), edge("e2", "tiles", "end")]
      },
      contentSnapshots: { mode: "snapshot", cards: [{ ref: raw.id, data: raw, metadata: {} }], images: [], effects: [], metadata: {} }
    });
    const chaseApi = {
      factories: { blueprint: createChaseBlueprint, card: createChaseCard },
      cards: { get: ref => ref === raw.id ? raw : null }
    };
    const localized = materializeLibraryCopyLocalization(copied, chaseApi);
    const frozen = localized.contentSnapshots.cards[0].data;
    assert.equal(frozen.name, "Rutschige Dachziegel");
    assert.equal(frozen.description, "Die Dächer werden steiler und glänzen vor Nässe.");
    assert.equal(frozen.gmNotes, "Ein klassisches Hindernis auf den Dächern.");
    assert.equal(frozen.metadata.i18n, undefined);
    assert.equal(localized.graph.nodes.find(item => item.id === "tiles")?.label, "Rutschige Dachziegel");
    assert.equal(localized.metadata.i18nBase, undefined);
  } finally {
    globalThis.game = previousGame;
  }
});

test("localization repair preserves text already customized in an older Library copy", () => {
  const previousGame = globalThis.game;
  globalThis.game = { i18n: { localize: key => ({ "ADDON.Card.Name": "Rutschige Dachziegel", "ADDON.Card.Description": "Deutsche Beschreibung" })[key] ?? key } };
  try {
    const raw = createChaseCard({
      id: "addon:slick-tiles",
      source: { moduleId: "addon", packId: "urban", version: "1" },
      type: "obstacle",
      name: "Slick Roof Tiles",
      description: "English description",
      gmNotes: "English notes",
      obstacle: { requiredPoints: 2, scalable: true },
      approaches: [],
      metadata: { i18n: { name: "ADDON.Card.Name", description: "ADDON.Card.Description" } }
    });
    const edited = createChaseCard({ ...raw, name: "Meine eigenen Dachziegel" });
    const copied = createChaseBlueprint({
      id: "edited-copy",
      source: { moduleId: "pf2e-chase-forge", packId: "world-builder", version: "1.0.5" },
      metadata: { libraryOrigin: { blueprintId: "addon:rooftop" } },
      settings: { chaseType: "pursuit", length: "short", difficulty: "moderate", routeComplexity: "linear", startDistance: 1 },
      groups: [{ id: "p", name: "Pursuers", role: "pursuer", participants: [], public: true, metadata: {} }],
      graph: { startNodeId: "start", endNodeIds: ["end"], nodes: [node("start", "start"), { ...node("tiles", "card", raw.id), label: "Slick Roof Tiles" }, node("end", "end")], edges: [edge("e1", "start", "tiles"), edge("e2", "tiles", "end")] },
      contentSnapshots: { mode: "snapshot", cards: [{ ref: raw.id, data: edited, metadata: {} }], images: [], effects: [], metadata: {} }
    });
    const localized = materializeLibraryCopyLocalization(copied, {
      factories: { blueprint: createChaseBlueprint, card: createChaseCard },
      cards: { get: () => raw }
    });
    const frozen = localized.contentSnapshots.cards[0].data;
    assert.equal(frozen.name, "Meine eigenen Dachziegel");
    assert.equal(frozen.description, "Deutsche Beschreibung");
    assert.equal(localized.graph.nodes.find(item => item.id === "tiles")?.label, "Meine eigenen Dachziegel");
  } finally {
    globalThis.game = previousGame;
  }
});
