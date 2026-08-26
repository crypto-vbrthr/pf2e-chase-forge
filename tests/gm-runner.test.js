import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createChaseChatPresenter, obstacleChatHtml, rollResultChatHtml } from "../scripts/presentation/chat-presenter.js";
import { createChaseRunnerUiService } from "../scripts/app/chase-runner-app.js";
import { createPublicApi } from "../scripts/api/public-api.js";

test("GM Runner template and styles are packaged with core runner actions", async () => {
  const template = await readFile(new URL("../templates/chase-runner.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  assert.match(template, /data-action="beginRound"/);
  assert.match(template, /data-action="endRound"/);
  assert.match(template, /data-action="rollApproach"/);
  assert.match(template, /data-action="chooseRoute"/);
  assert.match(template, /data-action="unlockEdge"/);
  assert.match(template, /data-action="lockEdge"/);
  assert.match(template, /data-action="confirmConsequence"/);
  assert.match(template, /data-action="postObstacle"/);
  assert.match(template, /data-action="syncPlayers"/);
  assert.match(css, /\.chase-runner-shell/);
  assert.match(css, /\.pf2e-chase-forge-chat/);
});


test("GM Runner keeps its toolbar outside the scroll viewport and protects Unicode headings", async () => {
  const css = await readFile(new URL("../styles/chase-forge.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  assert.match(css, /chase-forge-runner \.window-content[\s\S]*overflow: hidden !important/);
  assert.match(css, /\.chase-runner-scroll[\s\S]*overflow-y: auto/);
  assert.match(css, /\.chase-runner-toolbar[\s\S]*position: relative/);
  assert.match(css, /\.chase-runner-obstacle h4[\s\S]*font-family: inherit !important[\s\S]*text-transform: none !important/);
  assert.match(css, /\.chase-route-inspector-title h4[\s\S]*font-family: inherit !important[\s\S]*text-transform: none !important/);
  assert.match(source, /scroller\?\.style\?\.setProperty[\s\S]*overflow-y", "auto"/);
  assert.equal(de["PF2E_CHASE_FORGE.CoreCards.city-city-gate.Name"], "Schließendes Stadttor");
});

test("public obstacle Chat presentation excludes hidden GM mechanics", () => {
  const html = obstacleChatHtml({
    session: { round: 2 },
    runtimeGroup: { id: "runtime-heroes" },
    groupDefinition: { name: "Heroes" },
    obstacle: {
      progress: 1,
      requiredPoints: 3,
      node: { label: "Roof" },
      card: {
        name: "Wide Gap",
        description: "A roof gap blocks the route.",
        gmNotes: "Secret guard arrives next round.",
        image: { mode: "none", path: null },
        approaches: [{ id: "athletics", label: "Jump", description: "Leap across.", statistic: "athletics", dc: { value: 27, hidden: true } }]
      }
    }
  });
  assert.match(html, /Wide Gap/);
  assert.match(html, /Jump/);
  assert.match(html, /1 \/ 3/);
  assert.doesNotMatch(html, /27/);
  assert.doesNotMatch(html, /Secret guard/);
});

test("roll result Chat presentation summarizes degree and Chase Point delta", () => {
  const html = rollResultChatHtml({ participantName: "Kikus", approachLabel: "Jump", result: { degree: "criticalSuccess", effectiveTotal: 31, chasePointDelta: 2, obstacleCleared: true } });
  assert.match(html, /Kikus/);
  assert.match(html, /Kritischer Erfolg/);
  assert.match(html, /\+2/);
  assert.match(html, /Hindernis überwunden/);
});

test("Chat presenter writes module-scoped flags", async () => {
  const previousChatMessage = globalThis.ChatMessage;
  let created = null;
  globalThis.ChatMessage = { getSpeaker: () => ({ alias: "Chase Forge" }), async create(data) { created = data; return data; } };
  try {
    const presenter = createChaseChatPresenter();
    await presenter.postEvent({ title: "Started" }, { flags: { sessionId: "session-1" } });
    assert.equal(created.flags["pf2e-chase-forge"].type, "event");
    assert.equal(created.flags["pf2e-chase-forge"].sessionId, "session-1");
  } finally {
    if (previousChatMessage === undefined) delete globalThis.ChatMessage; else globalThis.ChatMessage = previousChatMessage;
  }
});

test("Runner UI service is GM-only and reuses one ApplicationV2 per session", async () => {
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
  globalThis.foundry = { applications: { api: { ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {} } } };
  globalThis.game = { user: { isGM: true }, i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  const fakeApi = { sessionManager: { async getSession(id) { return { id }; } } };
  try {
    const service = createChaseRunnerUiService({ getApi: () => fakeApi });
    const first = await service.openRunner({ sessionId: "session-1" });
    const second = await service.openRunner({ sessionId: "session-1" });
    assert.equal(first, second);
    assert.equal(first.renderCalls, 2);
    assert.equal(service.getOpenRunner("session-1"), first);
    await service.closeRunner("session-1");
    assert.equal(service.getOpenRunner("session-1"), null);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousUi === undefined) delete globalThis.ui; else globalThis.ui = previousUi;
  }
});

test("public API advertises GM Runner only when a runner UI is supplied", async () => {
  const ui = { openRunner: async ({ sessionId }) => sessionId, closeRunner: () => true, getOpenRunner: () => null, getOpenRunners: () => [] };
  const api = createPublicApi({ ui });
  assert.equal(api.version, 18);
  assert.equal(api.contracts.gmRunner, 1);
  assert.equal(api.contracts.chatPresenter, 1);
  assert.equal(api.getCapabilities().gmRunner, true);
  assert.equal(api.getCapabilities().chatWorkflow, true);
  assert.equal(await api.ui.openRunner({ sessionId: "session-1" }), "session-1");
});

test("Builder start action hands newly started sessions to the GM Runner", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  assert.match(source, /openRunner\?\.\(\{ sessionId: session\.id \}\)/);
  assert.match(source, /presentation\?\.chat\?\.postEvent/);
  assert.match(source, /Runner\.ChatStarted/);
  assert.match(source, /openSessionRunner/);
});


test("Runner lifecycle refreshes the open Builder session list after abort/finish changes", async () => {
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  assert.match(source, /async function refreshOpenBuilder/);
  assert.match(source, /abortSession\(this\.sessionId\)[\s\S]*refreshOpenBuilder\(this\.chaseApi\)/);
  assert.match(source, /_saveOrFinish[\s\S]*refreshOpenBuilder\(this\.chaseApi\)/);
});

test("completion dialog escapes imported or user-authored HTML before interpolation", async () => {
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  assert.match(source, /function escapeHtml\(value\)/);
  assert.match(source, /escapeHtml\(summary\.image\.path\)/);
  assert.match(source, /summary\.winnerNames\.map\(escapeHtml\)/);
  assert.match(source, /escapeHtml\(summary\.endingDescription\)/);
  assert.match(source, /escapeHtml\(summary\?\.outcomeLabel/);
});

test("race Runner captures participant initiative values before beginning the round", async () => {
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-runner.hbs", import.meta.url), "utf8");
  assert.match(template, /data-race-initiative-row/);
  assert.match(template, /data-race-initiative-value/);
  assert.match(source, /querySelectorAll\?\.\("\[data-race-initiative-row\]"\)/);
  assert.match(source, /beginRound\(session, \{ initiativeOrder \}\)/);
});

test("Runner abort uses Foundry DialogV2 confirmation to avoid native-modal keyboard focus loss", async () => {
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const helperStart = source.indexOf("async function confirmAbortSession()");
  const helperEnd = source.indexOf("function optionLabel", helperStart);
  const actionStart = source.indexOf("static async _actionAbortSession()");
  const actionEnd = source.indexOf("static async _actionPostObstacle", actionStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  const helper = source.slice(helperStart, helperEnd);
  const action = source.slice(actionStart, actionEnd);
  assert.match(helper, /DialogV2\?\.confirm/);
  assert.match(helper, /modal:\s*true/);
  assert.match(action, /await confirmAbortSession\(\)/);
  assert.doesNotMatch(action, /globalThis\.confirm/);
});


test("GM Runner shows each participant's PF2e approach modifier beside the skill button", async () => {
  const source = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-runner.hbs", import.meta.url), "utf8");
  assert.match(source, /participantApproachModifiers/);
  assert.match(source, /getStatisticModifier/);
  assert.match(template, /participant\.approaches/);
  assert.match(template, /chase-skill-modifier/);
});
