import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicApi } from "../scripts/api/public-api.js";
import { createChaseBlueprint, createChaseCard } from "../scripts/data/factories.js";

function blueprint(card = null) {
  return createChaseBlueprint({
    id: "visual-bp",
    name: "Visual Chase",
    tags: ["night"],
    settings: { environmentTags: ["city"], toneTags: ["tense"], movementModes: ["land"], timeOfDay: "night" },
    image: { mode: "manual", path: "blueprint.webp", alt: "Blueprint art" },
    contentSnapshots: card ? { mode: "snapshot", cards: [{ ref: card.id, kind: "card", data: card }] } : undefined
  });
}

test("Visual System resolves manual and predefined card images", async () => {
  const api = createPublicApi();
  assert.equal(api.version, 14);
  assert.equal(api.contracts.visualSystem, 1);
  assert.equal(api.getCapabilities().visualSystem, true);

  const manual = createChaseCard({ id: "manual", name: "Manual", image: { mode: "manual", path: "manual.webp", alt: "Manual art" } });
  assert.deepEqual(await api.images.resolveCard(manual, { blueprint: blueprint() }), {
    id: "manual.webp", path: "manual.webp", providerId: null, alt: "Manual art", tags: [], metadata: {}, mode: "manual", fallback: false
  });

  const predefined = createChaseCard({
    id: "predefined", name: "Predefined",
    image: {
      mode: "predefined", imageId: "second",
      candidates: [
        { id: "first", path: "first.webp", alt: "First" },
        { id: "second", path: "second.webp", alt: "Second", metadata: { credit: "Pack" } }
      ]
    }
  });
  const result = await api.images.resolveCard(predefined, { blueprint: blueprint() });
  assert.equal(result.path, "second.webp");
  assert.equal(result.alt, "Second");
  assert.equal(result.metadata.credit, "Pack");
});

test("automatic providers receive combined Blueprint and card visual context", async () => {
  const api = createPublicApi();
  let received = null;
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals", label: "Visuals", cards: [], templates: [],
    imageProviders: [{
      id: "contextual", priority: 50,
      getImages(context) {
        received = context;
        return [{ id: "roof-night", path: "roof-night.webp", alt: "Night rooftop", tags: ["roof"] }];
      }
    }]
  });
  const card = createChaseCard({ id: "roof", name: "Roof", tags: ["rooftop"], metadata: { imageTags: ["height"] }, image: { mode: "automatic" } });
  const result = await api.images.resolveCard(card, { blueprint: blueprint() });
  assert.equal(result.path, "roof-night.webp");
  assert.equal(result.providerId, "visual-addon:contextual");
  assert.equal(received.timeOfDay, "night");
  assert.equal(received.tags.includes("city"), true);
  assert.equal(received.tags.includes("rooftop"), true);
  assert.equal(received.tags.includes("height"), true);
});

test("Visual System candidate discovery combines predefined and provider images and can pin a candidate", async () => {
  const api = createPublicApi();
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals", label: "Visuals", cards: [], templates: [],
    imageProviders: [{ id: "provider", getImages: () => [{ id: "dynamic", path: "dynamic.webp", alt: "Dynamic" }] }]
  });
  const card = createChaseCard({
    id: "mixed", name: "Mixed",
    image: { mode: "automatic", candidates: [{ id: "embedded", path: "embedded.webp", alt: "Embedded" }] }
  });
  const result = await api.images.candidatesFor(card.image, { blueprint: blueprint(), card });
  assert.deepEqual(result.candidates.map(candidate => candidate.path), ["embedded.webp", "dynamic.webp"]);
  const pinned = api.images.applyCandidate(card.image, result.candidates[1], { mode: "provider" });
  assert.equal(pinned.mode, "provider");
  assert.equal(pinned.path, "dynamic.webp");
  assert.equal(pinned.imageId, "dynamic");
  assert.equal(pinned.providerId, "visual-addon:provider");
});

test("Visual System caches automatic provider resolution until explicitly refreshed", async () => {
  const api = createPublicApi();
  let calls = 0;
  api.extensions.forModule("visual-addon").registerPack({
    id: "visuals", label: "Visuals", cards: [], templates: [],
    imageProviders: [{ id: "cached", getImages: () => { calls += 1; return [{ id: "one", path: "one.webp" }]; } }]
  });
  const card = createChaseCard({ id: "cached-card", image: { mode: "automatic" } });
  const bp = blueprint();
  await api.images.resolveCard(card, { blueprint: bp });
  await api.images.resolveCard(card, { blueprint: bp });
  assert.equal(calls, 1);
  api.images.clearCache();
  await api.images.resolveCard(card, { blueprint: bp });
  assert.equal(calls, 2);
});

test("card visuals can intentionally fall back to Blueprint art", async () => {
  const api = createPublicApi();
  const card = createChaseCard({ id: "none", name: "No art", image: { mode: "none" } });
  const result = await api.images.resolveCard(card, { blueprint: blueprint(), fallbackToBlueprint: true });
  assert.equal(result.path, "blueprint.webp");
  assert.equal(result.fallback, true);
});

test("Builder and Runner wire the visual system into image browsing, candidate selection and runtime rendering", async () => {
  const builder = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const builderTemplate = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  assert.match(builder, /browseCardImage:\s*this\._actionBrowseCardImage/);
  assert.match(builder, /selectCardImageCandidate:\s*this\._actionSelectCardImageCandidate/);
  assert.match(builder, /images\?\.resolveCard\?\./);
  assert.match(builderTemplate, /data-action="refreshCardImages"/);
  assert.match(builderTemplate, /data-action="selectCardImageCandidate"/);
  assert.match(builderTemplate, /chase-visual-candidate-grid/);
  assert.match(runner, /images\?\.resolveCard\?\./);
  assert.match(css, /\.chase-visual-candidate-grid/);
});
