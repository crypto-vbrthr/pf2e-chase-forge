import test from "node:test";
import assert from "node:assert/strict";
import { createCoreTemplatePack } from "../scripts/content/core-templates.js";
import { MODULE_ID } from "../scripts/core/constants.js";
import { createChaseCard, createChaseTemplate } from "../scripts/data/factories.js";
import { buildGraphIndex } from "../scripts/data/graph.js";
import { createPublicApi } from "../scripts/api/public-api.js";
import { createRegistryService } from "../scripts/registries/registry-service.js";
import { createChaseGenerator, generateChaseFromTemplate, inspectGenerationCandidates, selectGenerationCards } from "../scripts/generator/chase-generator.js";
import { createBasicBuilderDraft, addParticipantToBasicBlueprint } from "../scripts/builder/basic-builder-model.js";
import { listBranchGroups } from "../scripts/builder/branching-builder-model.js";

function card(id, { tags = [], min = 1, max = 20, type = "obstacle" } = {}) {
  return createChaseCard({
    id,
    name: id,
    type,
    tags,
    level: { min, max },
    obstacle: { requiredPoints: 2 },
    approaches: [{ id: `${id}-a`, label: "Check", statistic: "athletics", dc: { mode: "level" } }]
  });
}

function pathCardCounts(blueprint) {
  const { outgoing, nodeById } = buildGraphIndex(blueprint.graph);
  const counts = [];
  const walk = (nodeId, seen, cards) => {
    if (seen.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    const nextCards = cards + (node.type === "card" ? 1 : 0);
    if (node.type === "end") {
      counts.push(nextCards);
      return;
    }
    const nextSeen = new Set(seen).add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) walk(edge.to, nextSeen, nextCards);
  };
  walk(blueprint.graph.startNodeId, new Set(), 0);
  return counts;
}

test("Core template pack registers structural generator templates without shipping the Core Card library", () => {
  const registries = createRegistryService();
  registries.registerPack(MODULE_ID, createCoreTemplatePack());
  assert.equal(registries.listCards().length, 0);
  assert.equal(registries.listTemplates().length, 5);
  assert.ok(registries.getTemplate("core:classic-pursuit"));
  assert.ok(registries.getTemplate("core:branching-pursuit"));
  assert.ok(registries.getTemplate("core:escape"));
  assert.ok(registries.getTemplate("core:against-clock"));
  assert.ok(registries.getTemplate("core:race"));
});

test("candidate inspection respects level, required/excluded tags, and environmental preference scoring", () => {
  const template = createChaseTemplate({
    id: "test:template",
    settings: { partyLevel: 5, environmentTags: ["city"] },
    filters: { requiredTags: ["chase"], excludedTags: ["forbidden"], preferredTags: ["rooftop"], requireLevelMatch: true }
  });
  const result = inspectGenerationCandidates(template, [
    card("city-roof", { tags: ["chase", "city", "rooftop"], min: 1, max: 10 }),
    card("city-street", { tags: ["chase", "city"], min: 1, max: 10 }),
    card("wrong-level", { tags: ["chase", "city", "rooftop"], min: 10, max: 20 }),
    card("excluded", { tags: ["chase", "city", "forbidden"], min: 1, max: 10 })
  ]);
  assert.deepEqual(result.eligible.map(item => item.card.id), ["city-roof", "city-street"]);
  assert.ok(result.eligible[0].score > result.eligible[1].score);
  assert.equal(result.rejected.length, 2);
});

test("seeded card selection is deterministic", () => {
  const template = createChaseTemplate({ id: "test:seeded", filters: {}, generator: { allowDuplicates: true } });
  const cards = [card("a"), card("b"), card("c"), card("d")];
  const first = selectGenerationCards(template, cards, { count: 10, seed: "fixed-seed", allowDuplicates: true });
  const second = selectGenerationCards(template, cards, { count: 10, seed: "fixed-seed", allowDuplicates: true });
  assert.deepEqual(first.selected.map(item => item.id), second.selected.map(item => item.id));
  assert.equal(first.seed, "fixed-seed");
});

test("generator creates editable placeholder cards when no registered card pool is available", () => {
  const template = createCoreTemplatePack().templates.find(item => item.id === "core:classic-pursuit");
  const result = generateChaseFromTemplate(template, [], { seed: "empty-pool", partyLevel: 3, name: "Fallback Chase" });
  assert.equal(result.report.targetLength, 8);
  assert.equal(result.report.fallbackCards, 8);
  assert.equal(result.report.selectedRegisteredCards, 0);
  assert.equal(result.blueprint.graph.nodes.filter(node => node.type === "card").length, 8);
  assert.ok(result.blueprint.contentSnapshots.cards.every(record => record.data.metadata.generatorFallback === true));
  assert.equal(result.blueprint.metadata.generator.seed, "empty-pool");
});

test("branching generator keeps the requested path length while visually creating split/merge alternatives", () => {
  const template = createCoreTemplatePack().templates.find(item => item.id === "core:branching-pursuit");
  const pool = Array.from({ length: 12 }, (_, index) => card(`card-${index + 1}`, { tags: ["city"] }));
  const result = generateChaseFromTemplate(template, pool, { seed: "branch-seed", partyLevel: 5, environmentTags: ["city"] });
  const branchGroups = listBranchGroups(result.blueprint);
  assert.equal(result.report.targetLength, 8);
  assert.equal(result.report.branchCount, 1);
  assert.equal(branchGroups.length, 1);
  assert.deepEqual(branchGroups[0].routes.map(route => route.nodes.length), [1, 1]);
  assert.deepEqual(pathCardCounts(result.blueprint).sort((a, b) => a - b), [8, 8]);
  assert.equal(result.blueprint.settings.routeComplexity, "branched");
});

test("generation preserves the world Blueprint identity and participants while applying a template chase type", () => {
  let source = createBasicBuilderDraft({ id: "world-chase", name: "Existing Chase", chaseType: "pursuit" });
  source = addParticipantToBasicBlueprint(source, source.groups[0].id, { id: "hero", kind: "actor", uuid: "Actor.hero", name: "Hero" });
  const template = createCoreTemplatePack().templates.find(item => item.id === "core:escape");
  const result = generateChaseFromTemplate(template, [], { seed: "preserve", sourceBlueprint: source, name: source.name });
  assert.equal(result.blueprint.id, "world-chase");
  assert.equal(result.blueprint.name, "Existing Chase");
  assert.equal(result.blueprint.settings.chaseType, "escape");
  assert.equal(result.blueprint.groups.flatMap(group => group.participants).some(participant => participant.uuid === "Actor.hero"), true);
});

test("public API exposes generator contract, registered templates, inspection, generation, and reroll", () => {
  const registries = createRegistryService();
  registries.registerPack(MODULE_ID, createCoreTemplatePack());
  registries.registerPack("test-addon", {
    id: "cards",
    label: "Cards",
    cards: [card("street", { tags: ["city"] })]
  });
  const api = createPublicApi({ registries });
  assert.equal(api.version, 12);
  assert.equal(api.contracts.generator, 1);
  assert.equal(api.getCapabilities().generatorTemplates, true);
  assert.equal(api.getCapabilities().seededGeneration, true);
  assert.equal(api.getCapabilities().generatorFallbackCards, true);
  assert.equal(api.generator.listTemplates().length, 5);
  const result = api.generator.generate("core:classic-pursuit", { seed: "api-seed", partyLevel: 2, environmentTags: ["city"] });
  assert.equal(result.blueprint.metadata.generator.templateId, "core:classic-pursuit");
  const rerolled = api.generator.reroll(result.blueprint, { seed: "api-seed-2" });
  assert.equal(rerolled.blueprint.id, result.blueprint.id);
  assert.equal(rerolled.blueprint.metadata.generator.seed, "api-seed-2");
  assert.equal(Object.isFrozen(api.generator), true);
});


test("core generator templates localize lazily after Foundry i18n becomes available", () => {
  const previousGame = globalThis.game;
  const registries = createRegistryService();
  delete globalThis.game;
  registries.registerPack(MODULE_ID, createCoreTemplatePack());
  globalThis.game = { i18n: { localize: key => ({
    "PF2E_CHASE_FORGE.Generator.TemplateClassicPursuit": "Klassische Verfolgung",
    "PF2E_CHASE_FORGE.Generator.TemplateClassicPursuitHint": "Eine lokalisierte Beschreibung.",
    "PF2E_CHASE_FORGE.Generator.PlaceholderName": "Generiertes Hindernis"
  })[key] ?? key } };
  try {
    const generator = createChaseGenerator({ templates: registries.templates, cards: registries.cards });
    const template = generator.listTemplates().find(item => item.id === "core:classic-pursuit");
    assert.equal(template.name, "Klassische Verfolgung");
    assert.equal(template.description, "Eine lokalisierte Beschreibung.");
    assert.equal(template.generator.fallbackNamePrefix, "Generiertes Hindernis");
    const generated = generator.generate("core:classic-pursuit", { seed: "localized", partyLevel: 1 });
    assert.equal(generated.template.name, "Klassische Verfolgung");
    assert.match(generated.blueprint.contentSnapshots.cards[0].data.name, /^Generiertes Hindernis/);
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});
