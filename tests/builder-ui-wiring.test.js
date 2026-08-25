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
  assert.match(template, /data-action="addBranchAfterCard"/);
  assert.match(template, /data-action="appendBranchCard"/);
  assert.match(template, /data-branch-edge/);
  assert.doesNotMatch(template, /\(concat\s/);
  assert.match(css, /\.chase-builder-shell/);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder\s*\{[^}]*display:\s*flex !important;[^}]*overflow:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.window-content\s*\{[^}]*flex:\s*1 1 auto !important;[^}]*overflow-y:\s*scroll !important;[^}]*overflow-x:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-shell\s*\{[^}]*display:\s*grid !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-main\s*\{[^}]*display:\s*flex !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-editor-scroll\s*\{[^}]*flex:\s*0 0 auto !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
  assert.match(css, /\.chase-builder-toolbar\s*\{[^}]*position:\s*sticky !important;[^}]*top:\s*0 !important;[^}]*z-index:\s*20;/s);
  assert.match(css, /\.chase-builder-branch-routes/);
  assert.match(template, /data-action="selectRouteCard"/);
  assert.match(template, /data-action="selectBranchGroup"/);
  assert.match(template, /chase-route-workspace/);
  assert.match(template, /chase-route-inspector/);
  assert.match(css, /\.chase-route-workspace/);
  assert.match(css, /\.chase-route-card-node/);
  assert.match(css, /\.chase-route-decision-node/);
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
  assert.match(source, /setImportantStyle\(toolbar, "position", "sticky"\)/);
  assert.match(source, /setImportantStyle\(toolbar, "top", "0"\)/);
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


test("manual card action keeps the Builder draft as a ChaseBlueprint in linear and branching modes", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /isBranchingBuilderBlueprint\(this\._draft\)/);
  assert.match(source, /appendMainlineManualCard\(this\._draft\)/);
  assert.match(source, /addManualCardToBasicBlueprint\(this\._draft\)/);
  assert.match(source, /this\._draft = result\.blueprint/);
  assert.match(source, /this\._selectedInspector = result\.ref/);
  assert.doesNotMatch(source, /this\._draft = addManualCardToBasicBlueprint\(this\._draft\);/);
  assert.match(source, /this\._draft\.settings\?\.weather\?\.source\?\.moduleId/);
});


test("visual route selection preserves the Builder window scroll position while opening the inspector", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /_captureScrollPosition\(\)/);
  assert.match(source, /_restoreCapturedScrollPosition\(\)/);
  assert.match(source, /scroller\.scrollTop = top/);
  assert.match(source, /this\._captureScrollPosition\(\);\n\s*return this\.render\(\{ force: true \}\);/);
});

test("Builder form synchronization keeps branching drafts editable through the visual inspector", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const syncStart = source.indexOf("_syncDraftFromForm() {");
  const syncEnd = source.indexOf("async _save({ silent = false } = {})", syncStart);
  const syncBlock = source.slice(syncStart, syncEnd);
  assert.match(syncBlock, /isBuilderEditableBlueprint\(this\._draft\)/);
  assert.match(syncBlock, /const branchingDraft = isBranchingBuilderBlueprint\(this\._draft\)/);
  assert.match(syncBlock, /querySelectorAll\("\[data-branch-edge\]"\)/);
  assert.doesNotMatch(syncBlock, /!isBasicLinearBlueprint\(this\._draft\)/);
});

test("Builder save derives editability locally before validation", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const saveStart = source.indexOf("async _save({ silent = false } = {})");
  assert.notEqual(saveStart, -1);
  const saveEnd = source.indexOf("async _confirmDelete()", saveStart);
  assert.notEqual(saveEnd, -1);
  const saveBlock = source.slice(saveStart, saveEnd);
  assert.match(saveBlock, /const linearEditable = isBasicLinearBlueprint\(this\._draft\);/);
  assert.match(saveBlock, /const branchingEditable = isBranchingBuilderBlueprint\(this\._draft\);/);
  assert.match(saveBlock, /validateBranchingBuilderBlueprint/);
});

test("Builder exposes a permanent New Chase action and separates world Chases from read-only library Chases", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));

  assert.match(template, /data-action="newBlueprint"/);
  assert.match(template, /data-action="loadLibraryBlueprint"/);
  assert.match(template, /data-action="copyLibraryBlueprint"/);
  assert.match(template, /PF2E_CHASE_FORGE\.Builder\.MyChases/);
  assert.match(template, /PF2E_CHASE_FORGE\.Builder\.Library/);
  assert.match(template, /chase-builder-library-group/);
  assert.match(template, /LibraryChasesShort/);
  assert.match(source, /_libraryBlueprintId/);
  assert.match(source, /_worldCopyFromLibrary/);
  assert.match(source, /metadata\.libraryOrigin/);
  assert.match(source, /sessionManager\.createSession\(saved/);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.NewChase"], "Neue Verfolgungsjagd");
  assert.equal(de["PF2E_CHASE_FORGE.Builder.CopyFromLibrary"], "Als eigene Chase übernehmen");
});
