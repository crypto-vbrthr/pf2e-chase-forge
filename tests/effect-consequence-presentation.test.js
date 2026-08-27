import test from "node:test";
import assert from "node:assert/strict";
import { effectConsequenceChatHtml, prepareOccurrencesForPresentation } from "../scripts/consequences/effect-consequence-presentation.js";
import { EFFECT_CONSEQUENCE_PRESENTATION_MODES, registerSettings, SETTINGS } from "../scripts/settings.js";
import { MODULE_ID } from "../scripts/core/constants.js";

function effectOccurrence(gmConfirmation = false) {
  return {
    occurrenceId: "occ-effect",
    participantId: "hero",
    consequence: {
      id: "smoke",
      kind: "effectForge",
      gmConfirmation,
      payload: { source: "embedded", definition: { schemaVersion: 2, id: "smoke", name: "Smoke Inhalation", components: [] } }
    }
  };
}

function narrativeOccurrence() {
  return {
    occurrenceId: "occ-narrative",
    consequence: { id: "story", kind: "narrative", gmConfirmation: false, payload: { text: "Dust everywhere." } }
  };
}

function apiWith(occurrences) {
  return { consequences: { fromRulesResult: () => occurrences } };
}

test("interactive consequence presentation modes require GM confirmation only for Effect Forge occurrences", () => {
  for (const mode of ["runner", "dialog", "chatGm", "chatPublic"]) {
    const source = [effectOccurrence(false), narrativeOccurrence()];
    const prepared = prepareOccurrencesForPresentation(apiWith(source), {}, mode);
    assert.equal(prepared[0].consequence.gmConfirmation, true, mode);
    assert.equal(prepared[1].consequence.gmConfirmation, false, mode);
  }
});

test("automatic consequence presentation explicitly disables confirmation even when card data requests it", () => {
  const prepared = prepareOccurrencesForPresentation(apiWith([effectOccurrence(true)]), {}, "automatic");
  assert.equal(prepared[0].consequence.gmConfirmation, false);
});

test("actionable consequence Chat card identifies target and effect", () => {
  const html = effectConsequenceChatHtml({ label: "Smoke Inhalation", participantName: "Valeros", description: "Fortitude -1", status: "pending" });
  assert.match(html, /Valeros/);
  assert.match(html, /Smoke Inhalation/);
  assert.match(html, /data-chase-consequence-apply/);
  assert.doesNotMatch(html, /disabled/);
});

test("effect consequence presentation setting exposes all five supported world modes", () => {
  const previousGame = globalThis.game;
  const registrations = [];
  globalThis.game = { settings: { register: (...args) => registrations.push(args) } };
  try {
    registerSettings();
    const entry = registrations.find(([moduleId, key]) => moduleId === MODULE_ID && key === SETTINGS.EFFECT_CONSEQUENCE_PRESENTATION);
    assert.ok(entry);
    const config = entry[2];
    assert.equal(config.scope, "world");
    assert.equal(config.config, true);
    assert.equal(config.default, "runner");
    assert.deepEqual(Object.keys(config.choices), [...EFFECT_CONSEQUENCE_PRESENTATION_MODES]);
  } finally {
    globalThis.game = previousGame;
  }
});
