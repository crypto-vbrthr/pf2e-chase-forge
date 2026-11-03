import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { API_VERSION, EXTENSION_CONTRACT_VERSION, MODULE_VERSION, SCHEMA_VERSIONS, BLUEPRINT_TRANSFER } from "../scripts/core/constants.js";
import { EFFECT_CONSEQUENCE_PRESENTATION_MODES } from "../scripts/settings.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("1.1.1-rc.2 manifest, constants, and download tag agree", async () => {
  const [manifest, pkg] = await Promise.all([read("../module.json"), read("../package.json")]);
  const module = JSON.parse(manifest), packageData = JSON.parse(pkg);
  assert.equal(MODULE_VERSION, "1.1.1-rc.2");
  assert.equal(module.version, MODULE_VERSION);
  assert.equal(packageData.version, MODULE_VERSION);
  assert.match(module.download, /\/v1\.1\.1-rc\.2\/pf2e-chase-forge\.zip$/);
});

test("1.1.1-rc.2 does not change the extension or persisted data contracts", () => {
  assert.equal(API_VERSION, 18);
  assert.equal(EXTENSION_CONTRACT_VERSION, 1);
  assert.deepEqual(SCHEMA_VERSIONS, {
    card: 1, template: 1, blueprint: 2, session: 4, result: 1,
    publicState: 1, consequence: 2, pack: 1, persistence: 1
  });
  assert.equal(BLUEPRINT_TRANSFER.VERSION, 1);
  assert.deepEqual(EFFECT_CONSEQUENCE_PRESENTATION_MODES, ["runner", "dialog", "chatGm", "chatPublic", "automatic"]);
});

test("1.1.1-rc.2 retains JSON transfer, route pane scrolling, and draft-only session initialization", async () => {
  const [builder, template, css, persistence] = await Promise.all([
    read("../scripts/app/chase-builder-app.js"), read("../templates/chase-builder.hbs"),
    read("../styles/chase-forge.css"), read("../scripts/persistence/persistence-service.js")
  ]);
  assert.match(builder, /exportBlueprintJson:\s*this\._actionExportBlueprintJson/);
  assert.match(builder, /importBlueprintJson:\s*this\._actionImportBlueprintJson/);
  assert.match(template, /class="chase-route-diagram" role="region" tabindex="0"/);
  assert.match(template, /class="chase-route-inspector" role="region" tabindex="0"/);
  assert.match(css, /\.chase-route-diagram\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.chase-route-inspector\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(persistence, /sessionId:\s*options\.sessionId\s*\?\?\s*createId\("session"\),\s*\.\.\.options,\s*status:\s*"draft"/s);
});
