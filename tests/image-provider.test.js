import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";

test("image providers are ordered by priority and return normalized candidates", async () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("visual-addon");
  extension.registerPack({
    id: "visuals",
    label: "Visuals",
    cards: [],
    templates: [],
    imageProviders: [
      {
        id: "low",
        priority: 10,
        getImages: () => [{ path: "low.webp", weight: 10 }]
      },
      {
        id: "high",
        priority: 100,
        getImages: () => [{ id: "night-roof", path: "high.webp", weight: 1, tags: ["night", "roof"] }]
      }
    ]
  });

  assert.deepEqual(api.images.providers.list().map(provider => provider.id), [
    "visual-addon:high",
    "visual-addon:low"
  ]);

  const result = await api.images.collectCandidates({ tags: ["night"] });
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.candidates.map(candidate => candidate.path), ["high.webp", "low.webp"]);
  assert.equal(result.candidates[0].providerId, "visual-addon:high");
});

test("image provider support predicate can suppress a provider", async () => {
  const api = createPublicApi();
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals",
    label: "Visuals",
    cards: [],
    templates: [],
    imageProviders: [{
      id: "night-only",
      supports: context => context.timeOfDay === "night",
      getImages: () => [{ path: "night.webp" }]
    }]
  });

  const day = await api.images.collectCandidates({ timeOfDay: "day" });
  const night = await api.images.collectCandidates({ timeOfDay: "night" });
  assert.equal(day.candidates.length, 0);
  assert.equal(night.candidates.length, 1);
});

test("a failing image provider is isolated and reported without blocking other providers", async () => {
  const api = createPublicApi();
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals",
    label: "Visuals",
    cards: [],
    templates: [],
    imageProviders: [
      { id: "broken", priority: 100, getImages: () => { throw new Error("boom"); } },
      { id: "working", priority: 10, getImages: () => [{ path: "ok.webp" }] }
    ]
  });

  const result = await api.images.collectCandidates({});
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].path, "ok.webp");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].providerId, "visual-addon:broken");
});

test("disabled visual packs do not contribute image candidates", async () => {
  const api = createPublicApi();
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals",
    label: "Visuals",
    enabledByDefault: false,
    cards: [],
    templates: [],
    imageProviders: [{ id: "provider", getImages: () => [{ path: "hidden.webp" }] }]
  });

  const result = await api.images.collectCandidates({});
  assert.equal(result.candidates.length, 0);
});


test("candidate collection can target explicit provider ids", async () => {
  const api = createPublicApi();
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals",
    label: "Visuals",
    cards: [],
    templates: [],
    imageProviders: [
      { id: "one", getImages: () => [{ path: "one.webp" }] },
      { id: "two", getImages: () => [{ path: "two.webp" }] }
    ]
  });
  const result = await api.images.collectCandidates({}, { providerIds: ["visual-addon:two"] });
  assert.deepEqual(result.candidates.map(candidate => candidate.path), ["two.webp"]);
});
