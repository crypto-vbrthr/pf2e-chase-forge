import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BLUEPRINT_TRANSFER } from "../scripts/core/constants.js";
import { listBlueprintMedia, makePortableBlueprint, remapBlueprintMedia, safeChaseFilename } from "../scripts/persistence/blueprint-transfer.js";
import { createChasePersistenceService } from "../scripts/persistence/persistence-service.js";
import { createMemoryChaseStore } from "../scripts/persistence/memory-store.js";
import { createRegistryService } from "../scripts/registries/registry-service.js";
import { createRouteGraphEngine } from "../scripts/engine/route-graph-engine.js";
import { createChaseRulesEngine } from "../scripts/rules/chase-rules-engine.js";
import { sampleBlueprint, sampleCard } from "./helpers.js";

function setup() {
  const registries = createRegistryService();
  registries.registerPack("pf2e-chase-forge", { id: "core", label: "Core", cards: [sampleCard()], templates: [] });
  const routeEngine = createRouteGraphEngine();
  const rulesEngine = createChaseRulesEngine({ registries, routeEngine });
  return { registries, persistence: createChasePersistenceService({ registries, routeEngine, rulesEngine, store: createMemoryChaseStore() }) };
}

function withMedia() {
  const chase = sampleBlueprint();
  chase.name = "Wald / Höhle";
  chase.image = { mode: "manual", path: "worlds/old/assets/header.webp", candidates: [{ id: "a", path: "worlds/old/assets/alt.png" }] };
  chase.graph.nodes[0].image = { mode: "manual", path: "worlds/old/assets/start.svg" };
  chase.groups[0].participants[0].image = "worlds/old/assets/hero.webp";
  chase.metadata = { media: { soundtrack: { path: "worlds/old/assets/chase.ogg" } }, scenery: "Narrative worlds/old/assets/stays.webp text" };
  return chase;
}

test("Media inventory includes embedded card, end-node, participant and audio paths, without mistaking descriptions for paths", () => {
  const chase = withMedia();
  chase.contentSnapshots = { mode: "snapshot", cards: [{ ref: "core:market-crowd", data: { image: { path: "worlds/old/assets/card.webp" } } }], images: [{ ref: "a", data: { src: "worlds/old/assets/sound.mp3" } }] };
  const paths = listBlueprintMedia(chase).map(item => item.path);
  for (const name of ["header.webp", "alt.png", "start.svg", "hero.webp", "chase.ogg", "card.webp", "sound.mp3"]) {
    assert.ok(paths.some(item => item.endsWith(name)), name);
  }
  assert.ok(!paths.some(item => item.includes("stays.webp")));
});

test("Data-relative paths stay identical unless an explicit source mapping is requested", () => {
  const chase = withMedia();
  const before = structuredClone(chase);
  const noMapping = remapBlueprintMedia(chase);
  assert.deepEqual(noMapping.blueprint, chase);
  assert.deepEqual(chase, before);
  const moved = remapBlueprintMedia(chase, { fromPrefix: "worlds/old/assets", toPrefix: "worlds/new/assets" });
  assert.ok(moved.changed >= 5);
  assert.equal(moved.blueprint.image.path, "worlds/new/assets/header.webp");
  assert.equal(moved.blueprint.graph.nodes[0].image.path, "worlds/new/assets/start.svg");
  assert.equal(moved.blueprint.groups[0].participants[0].image, "worlds/new/assets/hero.webp");
  assert.equal(moved.blueprint.metadata.media.soundtrack.path, "worlds/new/assets/chase.ogg");
  assert.equal(chase.image.path, "worlds/old/assets/header.webp");
  assert.ok(moved.blueprint.metadata.scenery.includes("worlds/old/assets/stays.webp"));
});

test("Only exact path-prefix boundaries are rewritten; outside paths and remote URLs are untouched", () => {
  const obj = { image: { path: "worlds/old/assets/img.webp", candidates: [
    { path: "worlds/old/assets-extra/other.webp" },
    { path: "https://example.com/worlds/old/assets/remote.webp" },
    { path: "/worlds/old/assets/root.webp" },
    { path: "worlds/old/assets/img-two.png?cache=1" }
  ] } };
  const moved = remapBlueprintMedia(obj, { fromPrefix: "worlds/old/assets", toPrefix: "worlds/new/assets" });
  assert.equal(moved.changed, 2);
  assert.equal(moved.blueprint.image.path, "worlds/new/assets/img.webp");
  assert.equal(moved.blueprint.image.candidates[0].path, obj.image.candidates[0].path);
  assert.equal(moved.blueprint.image.candidates[1].path, obj.image.candidates[1].path);
  assert.equal(moved.blueprint.image.candidates[2].path, obj.image.candidates[2].path);
  assert.equal(moved.blueprint.image.candidates[3].path, "worlds/new/assets/img-two.png?cache=1");
});

test("Unsafe path mapping prefixes are rejected", () => {
  for (const unsafe of ["../worlds/foo", "worlds/../foo", "http://site/foo", "/worlds/foo", "C:/data", "worlds//foo"]) {
    assert.throws(() => remapBlueprintMedia(withMedia(), { fromPrefix: "worlds/old", toPrefix: unsafe }), Error);
  }
  assert.throws(() => remapBlueprintMedia(withMedia(), { toPrefix: "worlds/new" }), Error);
});

test("JSON export with card snapshots preserves portable content but never changes the stored Chase", async () => {
  const { persistence } = setup();
  const original = await persistence.blueprints.create(withMedia());
  const envelope = JSON.parse(await persistence.blueprints.exportJson(original.id, { snapshotCards: true }));
  assert.equal(envelope.format, BLUEPRINT_TRANSFER.FORMAT);
  assert.equal(envelope.blueprint.contentSnapshots.mode, "snapshot");
  assert.equal(envelope.blueprint.contentSnapshots.cards[0].ref, "core:market-crowd");
  assert.ok(envelope.blueprint.contentSnapshots.cards[0].data);
  assert.equal(envelope.media.base, "Foundry Data");
  assert.equal(envelope.media.bundled, false);
  assert.ok(envelope.media.references.some(item => item.path === "worlds/old/assets/header.webp"));
  const stored = await persistence.blueprints.get(original.id);
  assert.equal(stored.contentSnapshots.mode, "references");
});

test("Imported JSON creates new Chase id, preserves branches, snapshots and media paths", async () => {
  const { persistence } = setup();
  const original = await persistence.blueprints.create(withMedia());
  const json = await persistence.blueprints.exportJson(original.id, { snapshotCards: true });
  const imported = await persistence.blueprints.importJson(json, { mediaPaths: { fromPrefix: "worlds/old", toPrefix: "worlds/new" } });
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.metadata.importedFromId, original.id);
  assert.deepEqual(imported.graph.edges, original.graph.edges);
  assert.equal(imported.contentSnapshots.mode, "snapshot");
  assert.equal(imported.image.path, "worlds/new/assets/header.webp");
  assert.equal((await persistence.blueprints.list()).length, 2);
});

test("Missing card registrations are explicitly reported, never silently replaced", async () => {
  const { persistence, registries } = setup();
  const original = await persistence.blueprints.create(sampleBlueprint());
  registries.unregisterPack("pf2e-chase-forge", "core");
  const envelope = JSON.parse(await persistence.blueprints.exportJson(original.id, { snapshotCards: true }));
  assert.ok(envelope.missingCardRefs.includes("core:market-crowd"));
  assert.equal(envelope.blueprint.contentSnapshots.mode, "references");
});

test("Malformed and wrong-format JSON is rejected before a Chase is written", async () => {
  const { persistence } = setup();
  for (const value of ["{not JSON", JSON.stringify({}), JSON.stringify({ format: "not-chase", blueprint: sampleBlueprint() }), JSON.stringify({ format: BLUEPRINT_TRANSFER.FORMAT, version: 999, blueprint: sampleBlueprint() })]) {
    await assert.rejects(() => persistence.blueprints.importJson(value));
  }
  assert.equal((await persistence.blueprints.list()).length, 0);
});

test("Download filename never contains a directory traversal or forbidden filename characters", () => {
  assert.equal(safeChaseFilename("Wald / Höhle"), "Wald-Hohle.json");
  assert.equal(safeChaseFilename("../"), "chase.json");
});

test("Builder exposes localized JSON transfer controls and both handler actions", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  for (const action of ["exportBlueprintJson", "importBlueprintJson"]) {
    assert.match(template, new RegExp(`data-action="${action}"`));
    assert.match(source, new RegExp(`${action}: this\\._action`));
  }
  assert.ok(de["PF2E_CHASE_FORGE.Transfer.Import"]);
  assert.ok(en["PF2E_CHASE_FORGE.Transfer.MediaNotice"]);
});

test("GM Builder buttons export the visible draft and import a new Chase with an optional media prefix", async () => {
  const { persistence } = setup();
  const source = await persistence.blueprints.create(withMedia());
  const json = await persistence.blueprints.exportJson(source.id, { snapshotCards: true });
  const previous = Object.fromEntries(["foundry", "game", "ui", "document", "saveDataToFile"].map(key => [key, globalThis[key]]));
  const output = [];
  let selectedInput;
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; }
    async render() { return this; }
    async close() { return this; }
  }
  globalThis.foundry = {
    applications: { api: {
      ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {},
      DialogV2: {
        wait: async options => options.buttons.find(button => button.action === "import").callback(null, null, {
          element: { querySelector: selector => ({ value: selector.includes("From") ? "worlds/old" : "worlds/moved" }) }
        }),
        confirm: async () => true
      }
    } }
  };
  globalThis.game = { user: { isGM: true }, i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: { info() {}, warn() {}, error(message) { throw new Error(message); } } };
  globalThis.saveDataToFile = (data, mime, name) => output.push({ data, mime, name });
  globalThis.document = {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, "input");
      const input = {
        style: {}, files: [{ name: "import.json", size: json.length, text: async () => json }],
        addEventListener(name, handler) { if (name === "change") this.handler = handler; },
        click() { this.promise = this.handler(); },
        remove() {}
      };
      selectedInput = input;
      return input;
    }
  };
  try {
    const { createChaseBuilderUiService } = await import("../scripts/app/chase-builder-app.js");
    const { createChaseBlueprint } = await import("../scripts/data/factories.js");
    const api = { persistence, factories: { blueprint: createChaseBlueprint }, moduleVersion: "1.1.1-dev.1" };
    const service = createChaseBuilderUiService({ getApi: () => api });
    const app = await service.openBuilder({ blueprintId: source.id });
    await app.constructor.DEFAULT_OPTIONS.actions.exportBlueprintJson.call(app);
    assert.equal(output.length, 1);
    assert.equal(output[0].mime, "application/json");
    assert.match(output[0].name, /Wald-Hohle\.json$/);
    assert.equal(JSON.parse(output[0].data).blueprint.contentSnapshots.mode, "snapshot");
    await app.constructor.DEFAULT_OPTIONS.actions.importBlueprintJson.call(app);
    await selectedInput.promise;
    const all = await persistence.blueprints.list();
    assert.equal(all.length, 2);
    const imported = all.find(entry => entry.id !== source.id);
    assert.equal(imported.image.path, "worlds/moved/assets/header.webp");
    assert.equal((await persistence.blueprints.get(source.id)).image.path, "worlds/old/assets/header.webp");
    assert.equal(app.draft.id, imported.id);
    await service.closeBuilder();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
