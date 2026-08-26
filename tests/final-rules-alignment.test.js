import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listCoreCardDefinitions } from "../scripts/content/core-cards.js";
import { createCoreTemplatePack } from "../scripts/content/core-templates.js";

test("Final PF2e rules alignment exposes round limits, minimum proficiency, saves, and attack rolls in the Builder", async () => {
  const source = await readFile(new URL("../scripts/app/chase-builder-app.js", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/chase-builder.hbs", import.meta.url), "utf8");
  assert.match(template, /settings\.victory\.roundLimit/);
  assert.match(template, /data-approach-field="minimumProficiency"/);
  assert.match(source, /"fortitude",\s*"reflex",\s*"will",\s*"attack"/);
});

test("Core Chase content now defaults to simple DCs and Against the Clock carries a real round limit", () => {
  const cards = listCoreCardDefinitions();
  assert.ok(cards.length > 0);
  assert.ok(cards.every(card => card.approaches.every(approach => approach.dc.mode === "simple")));
  const template = createCoreTemplatePack().templates.find(item => item.id === "core:against-clock");
  assert.equal(template.settings.victory.roundLimit, 6);
});
