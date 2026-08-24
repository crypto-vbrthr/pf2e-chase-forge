import test from "node:test";
import assert from "node:assert/strict";
import { createRegistryService } from "../scripts/registries/registry-service.js";
import { createChaseTemplate } from "../scripts/data/factories.js";
import { sampleCard } from "./helpers.js";

function sampleTemplate(overrides = {}) {
  return createChaseTemplate({
    id: "rooftops",
    name: "Rooftop Pursuit",
    settings: {
      chaseType: "pursuit",
      length: "medium",
      difficulty: "moderate",
      routeComplexity: "shortcuts",
      imageMode: "provider"
    },
    ...overrides
  });
}

function sampleProvider(overrides = {}) {
  return {
    id: "urban-images",
    label: "Urban Images",
    priority: 50,
    getImages: () => [{ id: "roof-night", path: "modules/test/images/roof.webp", tags: ["city", "night"] }],
    ...overrides
  };
}

function samplePack(overrides = {}) {
  return {
    id: "urban",
    label: "Urban Pursuits",
    version: "1.0.0",
    cards: [sampleCard({ id: "market-crowd" })],
    templates: [sampleTemplate()],
    imageProviders: [sampleProvider()],
    ...overrides
  };
}

test("registering a pack namespaces all external resources and binds source metadata", () => {
  const registries = createRegistryService();
  const pack = registries.registerPack("urban-addon", samplePack());

  assert.equal(pack.id, "urban-addon:urban");
  assert.deepEqual(pack.cardIds, ["urban-addon:market-crowd"]);
  assert.deepEqual(pack.templateIds, ["urban-addon:rooftops"]);
  assert.deepEqual(pack.imageProviderIds, ["urban-addon:urban-images"]);

  const card = registries.getCard("urban-addon:market-crowd");
  assert.equal(card.source.moduleId, "urban-addon");
  assert.equal(card.source.packId, "urban-addon:urban");
  assert.equal(card.source.version, "1.0.0");

  const template = registries.getTemplate("urban-addon:rooftops");
  assert.equal(template.source.moduleId, "urban-addon");
  assert.equal(template.source.packId, "urban-addon:urban");
});

test("disabled-by-default packs stay registered but are hidden from normal content reads", () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack({ enabledByDefault: false }));

  assert.equal(registries.getPack("urban-addon:urban").enabled, false);
  assert.equal(registries.getCard("urban-addon:market-crowd"), null);
  assert.equal(registries.getTemplate("urban-addon:rooftops"), null);
  assert.equal(registries.listImageProviders().length, 0);

  assert.ok(registries.getCard("urban-addon:market-crowd", { includeDisabled: true }));
  assert.ok(registries.getTemplate("urban-addon:rooftops", { includeDisabled: true }));
  assert.equal(registries.listImageProviders({ includeDisabled: true }).length, 1);
});

test("pack activation immediately changes card, template, and provider visibility", async () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack({ enabledByDefault: false }));

  await registries.setPackEnabled("urban-addon:urban", true);
  assert.ok(registries.getCard("urban-addon:market-crowd"));
  assert.ok(registries.getTemplate("urban-addon:rooftops"));
  assert.equal(registries.listImageProviders().length, 1);

  await registries.setPackEnabled("urban-addon:urban", false);
  assert.equal(registries.listCards().length, 0);
  assert.equal(registries.listTemplates().length, 0);
  assert.equal(registries.listImageProviders().length, 0);
});

test("external modules cannot register resources into a foreign namespace", () => {
  const registries = createRegistryService();
  assert.throws(
    () => registries.registerPack("urban-addon", samplePack({ cards: [sampleCard({ id: "other-addon:stolen" })] })),
    error => error?.code === "CHASE_NAMESPACE_OWNERSHIP"
  );
  assert.deepEqual(registries.getStats(), {
    packs: 0,
    cards: 0,
    templates: 0,
    imageProviders: 0,
    enabledPacks: 0
  });
});

test("failed pack registration is atomic", () => {
  const registries = createRegistryService();
  const invalid = samplePack({
    cards: [
      sampleCard({ id: "same" }),
      sampleCard({ id: "urban-addon:same" })
    ]
  });

  assert.throws(() => registries.registerPack("urban-addon", invalid));
  assert.equal(registries.getStats().packs, 0);
  assert.equal(registries.getStats().cards, 0);
});

test("failed multi-pack registration rolls the entire batch back", () => {
  const registries = createRegistryService();
  const first = samplePack({ id: "first", cards: [sampleCard({ id: "first-card" })], templates: [], imageProviders: [] });
  const second = samplePack({ id: "second", cards: [sampleCard({ id: "first-card" })], templates: [], imageProviders: [] });

  assert.throws(() => registries.registerPacks("urban-addon", [first, second]));
  assert.equal(registries.getStats().packs, 0);
  assert.equal(registries.getStats().cards, 0);
});

test("same owner may replace a pack transactionally", () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack());

  registries.registerPack("urban-addon", samplePack({
    cards: [sampleCard({ id: "new-card", name: "New Card" })],
    templates: [],
    imageProviders: []
  }), { replace: true });

  assert.equal(registries.getCard("urban-addon:market-crowd", { includeDisabled: true }), null);
  assert.equal(registries.getCard("urban-addon:new-card").name, "New Card");
  assert.deepEqual(registries.getPack("urban-addon:urban").cardIds, ["urban-addon:new-card"]);
});

test("foreign owner cannot replace an existing pack", () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack({ id: "urban" }));

  assert.throws(
    () => registries.registerPack("other-addon", samplePack({ id: "urban-addon:urban" }), { replace: true }),
    error => error?.code === "CHASE_NAMESPACE_OWNERSHIP"
  );
  assert.equal(registries.getStats().packs, 1);
  assert.equal(registries.getPack("urban-addon:urban").sourceModule, "urban-addon");
});

test("unregistering a pack removes only that pack's resources", () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack({ id: "urban" }));
  registries.registerPack("urban-addon", samplePack({
    id: "night",
    cards: [sampleCard({ id: "night-card" })],
    templates: [],
    imageProviders: []
  }));

  assert.equal(registries.unregisterPack("urban-addon", "urban"), true);
  assert.equal(registries.getCard("urban-addon:market-crowd", { includeDisabled: true }), null);
  assert.ok(registries.getCard("urban-addon:night-card"));
  assert.equal(registries.getStats().packs, 1);
});

test("core owner may use the reserved core namespace while extensions may not", () => {
  const registries = createRegistryService();
  registries.registerPack("pf2e-chase-forge", samplePack({
    id: "core:base",
    cards: [sampleCard({ id: "core:market-crowd" })],
    templates: [],
    imageProviders: []
  }));
  assert.ok(registries.getCard("core:market-crowd"));

  assert.throws(
    () => registries.registerPack("urban-addon", samplePack({ id: "core:bad", cards: [], templates: [], imageProviders: [] })),
    error => error?.code === "CHASE_NAMESPACE_OWNERSHIP"
  );
});


test("unregisterAll reports removed resource counts", () => {
  const registries = createRegistryService();
  registries.registerPack("urban-addon", samplePack());
  const removed = registries.unregisterAll("urban-addon");
  assert.deepEqual(removed, { packs: 1, cards: 1, templates: 1, imageProviders: 1 });
});
