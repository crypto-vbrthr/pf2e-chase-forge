import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localizeApproachLabel, localizeChaseCard, localizeNodeLabel, localizeStatisticLabel } from "../scripts/content/content-localization.js";

function withEnglishI18n(run) {
  const previousGame = globalThis.game;
  const previousConfig = globalThis.CONFIG;
  globalThis.CONFIG = { PF2E: { skills: {} } };
  const translations = {
    "PF2E_CHASE_FORGE.Skill.athletics": "Athletics",
    "PF2E_CHASE_FORGE.Skill.survival": "Survival",
    "PF2E_CHASE_FORGE.Skill.nature": "Nature",
    "PF2E_CHASE_FORGE.Statistic.fortitude": "Fortitude",
    "PF2E_CHASE_FORGE.Builder.MergeNode": "Merge"
  };
  globalThis.game = { i18n: { localize: key => translations[key] ?? key } };
  try { return run(); }
  finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousConfig === undefined) delete globalThis.CONFIG; else globalThis.CONFIG = previousConfig;
  }
}

test("saved stock statistic labels are relocalized to the active client language", () => withEnglishI18n(() => {
  assert.equal(localizeApproachLabel({ label: "Athletik", statistic: "athletics" }), "Athletics");
  assert.equal(localizeApproachLabel({ label: "Überlebenskunde", statistic: "survival" }), "Survival");
  assert.equal(localizeApproachLabel({ label: "Naturkunde", statistic: "nature" }), "Nature");
  assert.equal(localizeApproachLabel({ label: "Zähigkeit", statistic: "fortitude" }), "Fortitude");
  assert.equal(localizeStatisticLabel("athletics"), "Athletics");
}));

test("custom approach labels remain custom instead of being translated as stock skill names", () => withEnglishI18n(() => {
  assert.equal(localizeApproachLabel({ label: "Vault the wall", statistic: "athletics" }), "Vault the wall");
}));

test("snapshotted cards relocalize legacy German stock approach labels", () => withEnglishI18n(() => {
  const card = localizeChaseCard({
    id: "test:card",
    type: "obstacle",
    name: "Test",
    obstacle: { requiredPoints: 1, scalable: true },
    approaches: [{ id: "a1", label: "Athletik", type: "check", statistic: "athletics", dc: { mode: "none" } }]
  });
  assert.equal(card.approaches[0].label, "Athletics");
}));

test("merge node labels are structural UI text and follow the active language", () => withEnglishI18n(() => {
  assert.equal(localizeNodeLabel({ id: "merge-1", type: "merge", label: "Zusammenführung" }), "Merge");
}));

test("builder and runner wire localized approach and merge labels into their contexts", async () => {
  const builder = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/app/chase-runner-app.js", import.meta.url), "utf8");
  const player = await readFile(new URL("../scripts/app/chase-player-app.js", import.meta.url), "utf8");
  const branching = await readFile(new URL("../scripts/builder/branching-builder-model.js", import.meta.url), "utf8");
  assert.match(builder, /label: localizeApproachLabel\(approach\)/);
  assert.match(runner, /statisticLabel: localizeStatisticLabel\(approach\.statistic\)/);
  assert.match(runner, /label: localizeNodeLabel\(node\)/);
  assert.match(player, /copy\.approach\.label = localizeApproachLabel\(copy\.approach\)/);
  assert.match(branching, /PF2E_CHASE_FORGE\.Builder\.MergeNode/);
});
