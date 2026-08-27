import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerChaseBuilderSceneControls, skillLabel } from "../scripts/app/chase-builder-app.js";

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
  assert.match(template, /data-action="createJournalEntry"/);
  assert.match(template, /data-action="copyJournalLink"/);
  assert.match(template, /data-participant-drop/);
  assert.match(template, /data-builder-card/);
  assert.match(template, /data-card-field="pointScalingMode"/);
  assert.doesNotMatch(template, /data-card-field="scalable"/);
  assert.match(template, /data-action="applyWeatherForge"/);
  assert.match(template, /data-action="addBranchAfterCard"/);
  assert.match(template, /data-action="appendBranchCard"/);
  assert.match(template, /data-branch-edge/);
  assert.doesNotMatch(template, /\(concat\s/);
  assert.match(css, /\.chase-builder-shell/);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder\s*\{[^}]*display:\s*flex !important;[^}]*overflow:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.window-content\s*\{[^}]*flex:\s*1 1 auto !important;[^}]*overflow:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-shell\s*\{[^}]*display:\s*grid !important;[^}]*height:\s*100% !important;[^}]*overflow:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-main\s*\{[^}]*display:\s*flex !important;[^}]*height:\s*100% !important;[^}]*overflow-y:\s*auto !important;[^}]*overflow-x:\s*hidden !important;/s);
  assert.match(css, /\.pf2e-chase-forge\.chase-forge-builder \.chase-builder-sidebar\s*\{[^}]*height:\s*100% !important;[^}]*overflow-y:\s*auto !important;[^}]*overflow-x:\s*hidden !important;/s);
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
  assert.match(css, /\.pf2e-chase-journal-link/);
  assert.match(css, /\.chase-builder-main::\-webkit-scrollbar,[^}]*\.chase-builder-sidebar::\-webkit-scrollbar\s*\{[^}]*width:\s*12px;/s);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.Title"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Builder.Title"].length > 0, true);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.WeatherForgeApply"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Builder.WeatherForgeApply"].length > 0, true);
  assert.equal(de["PF2E_CHASE_FORGE.Builder.PointScalingMode"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Builder.PointScalingMode"].length > 0, true);
  assert.equal(de["PF2E_CHASE_FORGE.Journal.CopyLink"].length > 0, true);
  assert.equal(en["PF2E_CHASE_FORGE.Journal.CopyLink"].length > 0, true);
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
  assert.match(source, /setImportantStyle\(windowContent, "overflow", "hidden"\)/);
  assert.match(source, /setImportantStyle\(main, "overflow-y", "auto"\)/);
  assert.match(source, /setImportantStyle\(sidebar, "overflow-y", "auto"\)/);
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


test("visual route selection preserves both Builder pane scroll positions while opening the inspector", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /_captureScrollPosition\(\)/);
  assert.match(source, /_restoreCapturedScrollPosition\(\)/);
  assert.match(source, /main\.scrollTop = pending\.main/);
  assert.match(source, /sidebar\.scrollTop = pending\.sidebar/);
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
  assert.match(template, /data-action="toggleLibraryGroup"/);
  assert.match(template, /data-library-group-id=/);
  assert.match(template, /aria-expanded=/);
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

test("Builder groups registered Chase Cards by source/category for the Core Card Library", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(template, /registeredCardGroups/);
  assert.match(template, /<optgroup label="\{\{label\}\}">/);
  assert.match(source, /localizeChaseCard/);
  assert.match(source, /registeredCardGroupMap/);
  assert.match(source, /stampRecommendedPointScaling/);
  assert.match(source, /rollingGroupSizeForBlueprint/);
  assert.match(source, /obstaclePointScalingModeForIndex/);
});

test("Builder exposes template generation and seeded reroll controls", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(template, /name="generatorTemplate"/);
  assert.match(template, /data-action="generateFromTemplate"/);
  assert.match(template, /data-action="rerollGeneratedRoute"/);
  assert.match(template, /generationMeta/);
  assert.match(source, /this\.chaseApi\.generator\.generate/);
  assert.match(source, /this\.chaseApi\.generator\.reroll/);
  assert.match(source, /_confirmGenerateRoute/);
});


test("Builder skill labels use PF2e/local module localization instead of English slug fallbacks", () => {
  const previousGame = globalThis.game;
  const previousConfig = globalThis.CONFIG;
  globalThis.CONFIG = { PF2E: { skills: { athletics: "PF2E.Skill.Athletics" } } };
  globalThis.game = { i18n: { localize: key => ({
    "PF2E.Skill.Athletics": "Athletik",
    "PF2E_CHASE_FORGE.Skill.perception": "Wahrnehmung"
  })[key] ?? key } };
  try {
    assert.equal(skillLabel("athletics"), "Athletik");
    assert.equal(skillLabel("perception"), "Wahrnehmung");
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousConfig === undefined) delete globalThis.CONFIG; else globalThis.CONFIG = previousConfig;
  }
});

test("Runner and player sync pass branch route selection using the rules-engine object contract", async () => {
  const runner = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const sync = await readFile(new URL("../scripts/sync/chase-session-sync.js", import.meta.url), "utf8");
  assert.match(runner, /chooseRoute\(session, \{ runtimeGroupId: target\.dataset\.runtimeGroupId, edgeId: target\.dataset\.edgeId \}\)/);
  assert.match(sync, /chooseRoute\(session, \{ runtimeGroupId, edgeId \}\)/);
});

test("Runner and Player View expose full-resolution obstacle image popouts", async () => {
  const runnerTemplate = await readFile(new URL("../templates/chase-runner.hbs", import.meta.url), "utf8");
  const playerTemplate = await readFile(new URL("../templates/chase-player.hbs", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const player = await readFile(new URL("../scripts/app/chase-player-app.js", import.meta.url), "utf8");
  const popout = await readFile(new URL("../scripts/images/image-popout.js", import.meta.url), "utf8");
  assert.match(runnerTemplate, /data-action="openImage"/);
  assert.match(playerTemplate, /data-action="openImage"/);
  assert.match(runner, /openChaseImage/);
  assert.match(player, /openChaseImage/);
  assert.match(popout, /foundry\?\.applications\?\.apps\?\.ImagePopout/);
  assert.match(popout, /new ImagePopoutV2\(\{\s*src: path,/s);
});

test("GM Runner presents the acting participant's current-round outcome", async () => {
  const runner = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-runner.hbs", import.meta.url), "utf8");
  assert.match(runner, /function lastParticipantResult/);
  assert.match(runner, /checkResolved/);
  assert.match(runner, /chasePointDelta/);
  assert.match(template, /participant\.lastResult/);
  assert.match(template, /chase-runner-participant-result/);
});


test("Builder exposes branch-aware before/after insertion controls and preserves scroll for route mutations", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  assert.match(template, /data-action="insertManualCardBefore"/);
  assert.match(template, /data-action="insertManualCardAfter"/);
  assert.match(source, /insertManualCardRelativeToBuilderCard/);
  assert.match(source, /_insertManualCardRelative\(target, position\)/);
  assert.match(source, /addManualCardToBasicBlueprint\(this\._draft, \{ index: selected\.index \+ \(position === "after" \? 1 : 0\) \}\)/);
  assert.match(css, /\.chase-route-insert-actions/);

  const addManualStart = source.indexOf("static async _actionAddManualCard()");
  const addManualEnd = source.indexOf("static async _actionAddRegisteredCard()", addManualStart);
  assert.match(source.slice(addManualStart, addManualEnd), /this\._captureScrollPosition\(\)/);
  const removeStart = source.indexOf("static async _actionRemoveCard");
  const removeEnd = source.indexOf("static async _actionAddApproach", removeStart);
  assert.match(source.slice(removeStart, removeEnd), /this\._captureScrollPosition\(\)/);
});

test("relative insertion helper is an instance method and destructive route edits require confirmation", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));

  // ApplicationV2 action callbacks are rebound to the application instance. The shared helper
  // therefore has to live on the instance prototype, not only as a static class method.
  assert.match(source, /\n\s+async _insertManualCardRelative\(target, position\) \{/);
  assert.doesNotMatch(source, /static async _insertManualCardRelative\(target, position\)/);
  assert.match(source, /return this\._insertManualCardRelative\(target, "before"\)/);
  assert.match(source, /return this\._insertManualCardRelative\(target, "after"\)/);

  const removeCardStart = source.indexOf("static async _actionRemoveCard");
  const removeCardEnd = source.indexOf("static async _actionAddApproach", removeCardStart);
  assert.match(source.slice(removeCardStart, removeCardEnd), /await this\._confirmCardRemoval\(cardRef\)/);

  const removeBranchStart = source.indexOf("static async _actionRemoveBranchGroup");
  const removeBranchEnd = source.indexOf("static async _actionSelectRouteCard", removeBranchStart);
  assert.match(source.slice(removeBranchStart, removeBranchEnd), /await this\._confirmBranchRemoval\(\)/);
  assert.match(source.slice(removeBranchStart, removeBranchEnd), /this\._captureScrollPosition\(\)/);

  assert.ok(de["PF2E_CHASE_FORGE.Builder.RemoveCardConfirm"]?.includes("{name}"));
  assert.ok(en["PF2E_CHASE_FORGE.Builder.RemoveCardConfirm"]?.includes("{name}"));
  assert.ok(de["PF2E_CHASE_FORGE.Builder.RemoveBranchConfirm"]?.includes("Zweige"));
  assert.ok(en["PF2E_CHASE_FORGE.Builder.RemoveBranchConfirm"]?.includes("branch routes"));
});


test("empty branch lanes expose an inline add-obstacle action", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(template, /chase-route-lane-empty[\s\S]*data-action="appendBranchCard"[\s\S]*data-edge-id="\{\{route\.edgeId\}\}"/);
  assert.match(css, /\.chase-route-lane-empty \.chase-route-empty-add/);
  const actionStart = source.indexOf("static async _actionAppendBranchCard");
  const actionEnd = source.indexOf("static async _actionRemoveBranchGroup", actionStart);
  assert.match(source.slice(actionStart, actionEnd), /this\._captureScrollPosition\(\)/);
});


test("participant mutations preserve Builder scroll position before re-render", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");

  const dropStart = source.indexOf("async _handleDrop(event, explicitZone = null)");
  const dropEnd = source.indexOf("async _journalTarget()", dropStart);
  const dropBlock = source.slice(dropStart, dropEnd);
  assert.match(dropBlock, /_syncDraftFromForm\(\);\s*this\._captureScrollPosition\(\);\s*this\._draft = addParticipantToBasicBlueprint/s);

  const addStart = source.indexOf("static async _actionAddSelectedTokens");
  const addEnd = source.indexOf("static async _actionRemoveParticipant", addStart);
  const addBlock = source.slice(addStart, addEnd);
  assert.match(addBlock, /_syncDraftFromForm\(\);\s*this\._captureScrollPosition\(\);/s);

  const removeStart = source.indexOf("static async _actionRemoveParticipant");
  const removeEnd = source.indexOf("static async _actionResetGroups", removeStart);
  const removeBlock = source.slice(removeStart, removeEnd);
  assert.match(removeBlock, /_syncDraftFromForm\(\);\s*this\._captureScrollPosition\(\);/s);
});

test("Builder re-enables editable controls after a forced ApplicationV2 refresh", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; this.renderCalls = 0; this.element = null; }
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
    const app = await service.openBuilder();

    const fields = [{ disabled: true }, { disabled: true }, { disabled: true }];
    const actionControls = new Map([
      ["duplicateBlueprint", [{ disabled: true }]],
      ["saveBlueprint", [{ disabled: true }]],
      ["resetGroups", [{ disabled: true }]]
    ]);
    const classes = new Set(["chase-builder-read-only"]);
    const editor = {
      classList: {
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
      },
      querySelectorAll(selector) {
        if (selector === "input, textarea, select") return fields;
        return [];
      }
    };
    const root = {
      querySelector(selector) { return selector === ".chase-builder-editor-scroll" ? editor : null; },
      querySelectorAll(selector) {
        const match = selector.match(/^\[data-action="([^"]+)"\]$/);
        return match ? (actionControls.get(match[1]) ?? []) : [];
      }
    };

    assert.equal(app._synchronizeEditorControlState(root, { editable: true, librarySelected: false }), true);
    assert.deepEqual(fields.map(control => control.disabled), [false, false, false]);
    assert.equal(actionControls.get("saveBlueprint")[0].disabled, false);
    assert.equal(actionControls.get("duplicateBlueprint")[0].disabled, false);
    assert.equal(actionControls.get("resetGroups")[0].disabled, false);
    assert.equal(classes.has("chase-builder-read-only"), false);

    app._synchronizeEditorControlState(root, { editable: false, librarySelected: true });
    assert.deepEqual(fields.map(control => control.disabled), [true, true, true]);
    assert.equal(actionControls.get("saveBlueprint")[0].disabled, true);
    assert.equal(classes.has("chase-builder-read-only"), true);
    await service.closeBuilder();
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousUi === undefined) delete globalThis.ui; else globalThis.ui = previousUi;
  }
});

test("Builder filters large registered-card libraries and can insert registered cards before or after the selected route card", async () => {
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));

  assert.match(template, /name="registeredCardSourceFilter"/);
  assert.match(template, /name="registeredCardCategoryFilter"/);
  assert.match(template, /registeredCardVisibleCount/);
  assert.match(template, /registeredCardTotalCount/);
  assert.match(source, /_bindRegisteredCardFilters/);
  assert.match(source, /_registeredCardSourceFilter/);
  assert.match(source, /_registeredCardCategoryFilter/);
  assert.match(css, /\.chase-registered-card-picker/);

  assert.match(template, /data-action="insertRegisteredCardBefore"/);
  assert.match(template, /data-action="insertRegisteredCardAfter"/);
  assert.match(source, /insertCardRelativeToBuilderCard/);
  assert.match(source, /_insertRegisteredCardRelative\(target, position\)/);
  assert.match(source, /originCardRef: rawCard\.id/);

  const moveUpStart = source.indexOf("static async _actionMoveCardUp");
  const moveUpEnd = source.indexOf("static async _actionMoveCardDown", moveUpStart);
  const moveDownEnd = source.indexOf("static async _actionRemoveCard", moveUpEnd);
  assert.match(source.slice(moveUpStart, moveUpEnd), /this\._captureScrollPosition\(\)/);
  assert.match(source.slice(moveUpEnd, moveDownEnd), /this\._captureScrollPosition\(\)/);

  assert.equal(de["PF2E_CHASE_FORGE.Builder.AllRegisteredCardSources"], "Alle Quellen");
  assert.equal(en["PF2E_CHASE_FORGE.Builder.AllRegisteredCardSources"], "All sources");
  assert.ok(de["PF2E_CHASE_FORGE.Builder.InsertRegisteredCardBefore"]);
  assert.ok(en["PF2E_CHASE_FORGE.Builder.InsertRegisteredCardBefore"]);
});

test("external Chase libraries default to collapsed only on first discovery", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /_initializedLibraryGroupDefaults = new Set\(\)/);
  assert.match(source, /if \(group\.moduleId && group\.moduleId !== MODULE_ID\) this\._collapsedLibraryGroups\.add\(group\.id\)/);
  assert.match(source, /this\._initializedLibraryGroupDefaults\.add\(group\.id\)/);
});
