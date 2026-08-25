import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function templateActions(template) {
  return [...template.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);
}

async function assertActionsWired(templatePath, sourcePath) {
  const template = await readFile(new URL(templatePath, import.meta.url), "utf8");
  const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  const actions = [...new Set(templateActions(template))].sort();
  assert.ok(actions.length > 0);
  for (const action of actions) {
    const mapping = new RegExp(`\\b${action}\\s*:\\s*this\\.(_action[A-Za-z0-9_]+)`).exec(source);
    assert.ok(mapping, `${action} is present in the template but missing from ApplicationV2 DEFAULT_OPTIONS.actions`);
    const callback = mapping[1];
    assert.match(source, new RegExp(`static\\s+(?:async\\s+)?${callback}\\s*\\(`), `${action} maps to ${callback}, but that callback is not defined on the ApplicationV2 class`);
  }
}

test("every Builder data-action is wired to an ApplicationV2 action callback", async () => {
  await assertActionsWired("../templates/chase-builder.hbs", "../scripts/app/chase-builder-app.js");
});

test("every GM Runner data-action is wired to an ApplicationV2 action callback", async () => {
  await assertActionsWired("../templates/chase-runner.hbs", "../scripts/app/chase-runner-app.js");
});

test("every Player View data-action is wired to an ApplicationV2 action callback", async () => {
  await assertActionsWired("../templates/chase-player.hbs", "../scripts/app/chase-player-app.js");
});
