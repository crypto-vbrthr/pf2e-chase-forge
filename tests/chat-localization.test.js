import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RESULT_OUTCOMES } from "../scripts/core/constants.js";
import { obstacleChatHtml, rollResultChatHtml, createChaseChatPresenter } from "../scripts/presentation/chat-presenter.js";
import { optionLabel, createChaseRunnerUiService } from "../scripts/app/chase-runner-app.js";

const dictionaries = {
  de: JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8")),
  en: JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"))
};

async function withLanguage(lang, callback) {
  const previousGame = globalThis.game;
  globalThis.game = {
    user: { isGM: true },
    i18n: {
      lang,
      localize(key) { return dictionaries[lang][key] ?? key; },
      format(key, data = {}) {
        const template = dictionaries[lang][key] ?? key;
        return template.replace(/\{(\w+)\}/g, (_match, variable) => String(data[variable] ?? `{${variable}}`));
      }
    }
  };
  try { await callback(); }
  finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
}

function sampleObstacle() {
  return {
    session: { round: 2 },
    runtimeGroup: { id: "test" },
    groupDefinition: { name: "Heroes" },
    obstacle: {
      progress: 1, requiredPoints: 3,
      card: {
        name: "Broken Bridge",
        image: { mode: "manual", path: "worlds/test/bridge.png" },
        description: "Cross the gap.",
        approaches: [{ label: "Jump", statistic: "athletics", description: "Leap across.", dc: { value: 26, hidden: true } }]
      }
    }
  };
}

test("English Chat cards use localized headings, totals and outcomes without German leakage", async () => {
  await withLanguage("en", () => {
    const obstacle = obstacleChatHtml(sampleObstacle());
    assert.match(obstacle, /Possible approaches/);
    assert.match(obstacle, /Round 2/);
    assert.match(obstacle, /Progress 1 \/ 3/);
    assert.match(obstacle, /alt="Chase obstacle"/);
    assert.doesNotMatch(obstacle, /Mögliche|Runde 2|Fortschritt|Verfolgung/);
    assert.doesNotMatch(obstacle, /26/); // hidden DC must stay hidden in public Chat

    const roll = rollResultChatHtml({ participantName: "Kikus", approachLabel: "Jump", result: {
      degree: "criticalFailure", effectiveTotal: 3, chasePointDelta: -1, obstacleCleared: false
    } });
    assert.match(roll, /Critical Failure/);
    assert.match(roll, /Roll 3/);
    assert.match(roll, /Chase Points: <strong>-1<\/strong>/);
    assert.doesNotMatch(roll, /Kritischer|Verfolgungspunkte|Wurf 3/);
    assert.equal(optionLabel("quarryEscaped"), "Quarry escaped");
    assert.equal(optionLabel("quarryCaught"), "Quarry caught");
    assert.equal(optionLabel("raceLost"), "Race lost");
    assert.equal(optionLabel("custom"), "Special outcome");
  });
});

test("German Chat cards and Runner outcomes stay German", async () => {
  await withLanguage("de", () => {
    const obstacle = obstacleChatHtml(sampleObstacle());
    assert.match(obstacle, /Mögliche Vorgehensweisen/);
    assert.match(obstacle, /Runde 2/);
    assert.match(obstacle, /Fortschritt 1 \/ 3/);
    assert.match(obstacle, /alt="Verfolgungshindernis"/);
    const roll = rollResultChatHtml({ participantName: "Kikus", approachLabel: "Springen", result: {
      degree: "criticalSuccess", effectiveTotal: 31, chasePointDelta: 2, obstacleCleared: true
    } });
    assert.match(roll, /Kritischer Erfolg/);
    assert.match(roll, /Wurf 31/);
    assert.match(roll, /Verfolgungspunkte: <strong>\+2<\/strong>/);
    assert.match(roll, /Hindernis überwunden/);
    assert.equal(optionLabel("quarryEscaped"), "Flüchtige entkommen");
    assert.equal(optionLabel("raceLost"), "Rennen verloren");
  });
});

test("Every supported terminal result has translated Runner and Player label in both locales", () => {
  for (const outcome of RESULT_OUTCOMES) {
    for (const lang of ["de", "en"]) {
      const runner = dictionaries[lang][`PF2E_CHASE_FORGE.Runner.Label.${outcome}`];
      const player = dictionaries[lang][`PF2E_CHASE_FORGE.Outcome.${outcome}`];
      assert.ok(runner, `${lang}: missing Runner.Label.${outcome}`);
      assert.ok(player, `${lang}: missing Outcome.${outcome}`);
      assert.notEqual(runner, outcome);
      assert.notEqual(player, outcome);
    }
  }
});

test("Chat cards are localized at message creation, including presenter post methods", async () => {
  const previousChatMessage = globalThis.ChatMessage;
  const created = [];
  globalThis.ChatMessage = {
    getSpeaker: () => ({ alias: "Chase Forge" }),
    async create(message) { created.push(message); return message; }
  };
  try {
    const chat = createChaseChatPresenter();
    await withLanguage("en", async () => {
      await chat.postObstacle(sampleObstacle());
      await chat.postRollResult({ participantName: "Kikus", approachLabel: "Jump", result: { degree: "success", chasePointDelta: 1 } });
    });
    assert.match(created[0].content, /Possible approaches/);
    assert.match(created[1].content, /Success/);
    assert.doesNotMatch(created[0].content + created[1].content, /Runde|Fortschritt|Verfolgungspunkte/);
    assert.equal(created[1].flags["pf2e-chase-forge"].type, "rollResult");
  } finally {
    if (previousChatMessage === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChatMessage;
  }
});

test("Chat and Runner have no German hardcoded presentation strings", async () => {
  const presenterSource = await readFile(new URL("../scripts/presentation/chat-presenter.js", import.meta.url), "utf8");
  const runnerSource = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  assert.doesNotMatch(presenterSource, /(?:Kritischer|Verfolgungshindernis|Mögliche Vorgehensweisen|Hindernis überwunden|Runde \\|Fortschritt \\)/);
  assert.match(runnerSource, /PF2E_CHASE_FORGE\.Runner\.ChaseAborted/);
  assert.doesNotMatch(runnerSource, /title: "Verfolgungsjagd abgebrochen"/);
});


test("English Runner completion event posts Result: Quarry escaped, not German fallback", async () => {
  const previous = { ChatMessage: globalThis.ChatMessage, foundry: globalThis.foundry, ui: globalThis.ui };
  class ApplicationV2 {
    constructor() {}
    async render() { return this; }
    async close() { return this; }
  }
  const messages = [];
  globalThis.foundry = {
    applications: { api: { ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {} } }
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ alias: "Chase Forge" }),
    async create(data) { messages.push(data); return data; }
  };
  const session = { id: "locale-end", status: "active", groups: [], events: [], blueprintSnapshot: { graph: { nodes: [] }, groups: [] } };
  const api = {
    sessionManager: {
      async getSession() { return session; },
      async saveSession(value) { return value; },
      async finishSession() { return { session: { ...session, status: "completed", events: [{ type: "chaseCompleted", outcome: "quarryEscaped" }] } }; }
    },
    rules: { evaluateOutcome: () => ({ ended: true, outcome: "quarryEscaped" }) },
    sync: { async publishSession() {} },
    ui: { getOpenBuilder: () => null },
    images: { async resolveBlueprint() { return null; } }
  };
  const service = createChaseRunnerUiService({ getApi: () => api });
  try {
    await withLanguage("en", async () => {
      const runner = await service.openRunner({ sessionId: "locale-end" });
      await runner._saveOrFinish(session);
      assert.equal(messages.length, 1);
      assert.match(messages[0].content, /Chase finished/);
      assert.match(messages[0].content, /Result: Quarry escaped/);
      assert.doesNotMatch(messages[0].content, /Flüchtige|Ergebnis|Verfolgungsjagd/);
      await service.closeRunner("locale-end");
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
