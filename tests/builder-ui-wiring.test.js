import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerChaseBuilderSceneControls } from "../scripts/app/chase-builder-app.js";

test("GM scene controls receive a Chase Forge Builder button on object-style controls", async () => {
  const handlers = new Map();
  let opened = 0;
  const previousHooks = globalThis.Hooks;
  const previousGame = globalThis.game;
  globalThis.Hooks = { on(name, callback) { handlers.set(name, callback); } };
  globalThis.game = { user: { isGM: true }, i18n: { localize: key => key } };
  try {
    registerChaseBuilderSceneControls({ openBuilder() { opened += 1; } });
    const controls = { tokens: { name: "tokens", tools: {} } };
    handlers.get("getSceneControlButtons")(controls);
    const tool = controls.tokens.tools["chase-forge-builder"];
    assert.ok(tool);
    assert.equal(tool.button, true);
    assert.equal(tool.visible, true);
    assert.equal(Number.isInteger(tool.order), true);
    assert.equal(typeof tool.onChange, "function");
    assert.equal(tool.onClick, undefined);
    tool.onChange();
    assert.equal(opened, 1);
  } finally {
    if (previousHooks === undefined) delete globalThis.Hooks; else globalThis.Hooks = previousHooks;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test("non-GM scene controls do not expose the Builder button", () => {
  const handlers = new Map();
  const previousHooks = globalThis.Hooks;
  const previousGame = globalThis.game;
  globalThis.Hooks = { on(name, callback) { handlers.set(name, callback); } };
  globalThis.game = { user: { isGM: false }, i18n: { localize: key => key } };
  try {
    registerChaseBuilderSceneControls({ openBuilder() {} });
    const controls = { tokens: { name: "tokens", tools: {} } };
    handlers.get("getSceneControlButtons")(controls);
    assert.equal(controls.tokens.tools["chase-forge-builder"], undefined);
  } finally {
    if (previousHooks === undefined) delete globalThis.Hooks; else globalThis.Hooks = previousHooks;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test("Builder template and localization resources are packaged", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.match(template, /data-action="saveBlueprint"/);
  assert.match(template, /data-participant-drop/);
  assert.match(template, /data-builder-card/);
  assert.match(template, /data-action="applyWeatherForge"/);
  assert.doesNotMatch(template, /\(concat\s/);
  assert.match(css, /\.chase-builder-shell/);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder\s*\{[^}]*display:\s*flex !important;[^}]*overflow:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.window-content\s*\{[^}]*flex:\s*1 1 auto !important;[^}]*overflow-y:\s*scroll !important;[^}]*overflow-x:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-shell\s*\{[^}]*display:\s*grid !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-main\s*\{[^}]*display:\s*flex !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-editor-scroll\s*\{[^}]*flex:\s*0 0 auto !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.chase-builder-editor-scroll::\-webkit-scrollbar,[^}]*\.chase-builder-sidebar::\-webkit-scrollbar\s*\{[^}]*width:\s*12px;/s);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.Title"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Builder.Title"].length > 0, true);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.WeatherForgeApply"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Builder.WeatherForgeApply"].length > 0, true);
});

test("Builder UI service lazily creates a GM ApplicationV2 window and reuses it", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; this.renderCalls = 0; }
    async render() { this.renderCalls += 1; return this; }
    async close() { return this; }
    async _prepareContext() { return {}; }
    async _onRender() {}
  }
  const HandlebarsApplicationMixin = Base => class extends Base {};
  globalThis.foundry = { applications: { api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2: { confirm: async () => true } } } };
  globalThis.game = { user: { isGM: true }, i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  try {
    const { createChaseBuilderUiService } = await import("../scripts/app/chase-builder-app.js");
    const fakeApi = { persistence: { blueprints: {} } };
    const service = createChaseBuilderUiService({ getApi: () => fakeApi });
    const first = await service.openBuilder();
    const second = await service.openBuilder();
    assert.equal(first, second);
    assert.equal(first.renderCalls, 2);
    assert.equal(service.getOpenBuilder(), first);
    await service.closeBuilder();
    assert.equal(service.getOpenBuilder(), null);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousUi === undefined) delete globalThis.ui; else globalThis.ui = previousUi;
  }
});

test("Builder layout diagnostics do not structured-clone Foundry application position objects", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /snapshotApplicationPosition\(app\?\.position\)/);
  assert.doesNotMatch(source, /applicationPosition:\s*cloneData\(app\?\.position/);
  assert.match(source, /console\.error\(`\$\{prefix\} failed`/);
});


test("builder applies runtime layout enforcement for Foundry ApplicationV2", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /function applyBuilderRuntimeLayout/);
  assert.match(source, /setImportantStyle\(windowContent, "overflow-y", "scroll"\)/);
  assert.match(source, /setImportantStyle\(shell, "display", "grid"\)/);
  assert.match(source, /render\+500ms/);
});


test("Builder integrates optional Weather Forge prefill without overwriting loaded Blueprints implicitly", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /_applyWeatherForgePrefill/);
  assert.match(source, /onlyUnset:\s*true/);
  assert.match(source, /applyWeatherForge:\s*this\._actionApplyWeatherForge/);
  assert.match(source, /existingWeather && weather === existingWeatherLabel \? cloneData\(existingWeather\)/);
});

test("new Builder window prefills current Weather Forge values when integration is available", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; this.renderCalls = 0; }
    async render() { this.renderCalls += 1; return this; }
    async close() { return this; }
    async _prepareContext() { return {}; }
    async _onRender() {}
  }
  const HandlebarsApplicationMixin = Base => class extends Base {};
  globalThis.foundry = { applications: { api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2: { confirm: async () => true } } } };
  globalThis.game = { user: { isGM: true }, i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  try {
    const { createChaseBuilderUiService } = await import("../scripts/app/chase-builder-app.js");
    const fakeApi = {
      persistence: { blueprints: {} },
      integrations: {
        weatherForge: {
          moduleId: "pf2e-weather-forge",
          contractVersion: 1,
          isAvailable: () => true,
          readCurrent: async () => ({
            available: true,
            timeOfDay: "evening",
            weather: {
              label: "Regen, 11 °C, Brise",
              source: { moduleId: "pf2e-weather-forge", capturedAt: "2026-08-24T19:00:00.000Z" }
            }
          })
        }
      },
      factories: { blueprint: value => value }
    };
    const service = createChaseBuilderUiService({ getApi: () => fakeApi });
    const app = await service.openBuilder();
    assert.equal(app.draft.settings.timeOfDay, "evening");
    assert.equal(app.draft.settings.weather.label, "Regen, 11 °C, Brise");
    assert.equal(app.draft.settings.weather.source.moduleId, "pf2e-weather-forge");
    await service.closeBuilder();
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousUi === undefined) delete globalThis.ui; else globalThis.ui = previousUi;
  }
});


test("Builder participant drag-and-drop uses capture-phase handlers and robust drag payload parsing", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /_bindParticipantDropZones/);
  assert.match(source, /addEventListener\("dragover", dragover, true\)/);
  assert.match(source, /addEventListener\("drop", drop, true\)/);
  assert.match(source, /readParticipantDragData\(event\)/);
  assert.match(source, /resolveParticipantDropUuid\(data\)/);
  assert.match(source, /dropEffect = "copy"/);
});

test("participant drop UUID resolver supports Actor and Scene Token payloads", async () => {
  const { resolveParticipantDropUuid } = await import("../scripts/app/chase-builder-app.js");
  assert.equal(resolveParticipantDropUuid({ uuid: "Actor.abc" }), "Actor.abc");
  assert.equal(resolveParticipantDropUuid({ type: "Actor", id: "abc" }), "Actor.abc");
  assert.equal(resolveParticipantDropUuid({ type: "Token", sceneId: "scene1", tokenId: "token1" }), "Scene.scene1.Token.token1");
  assert.equal(resolveParticipantDropUuid({ type: "TokenDocument", scene: "scene1", id: "token1" }), "Scene.scene1.Token.token1");
  assert.equal(resolveParticipantDropUuid(null), null);
});
