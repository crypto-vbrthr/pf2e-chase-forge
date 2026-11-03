import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  API_VERSION,
  BLUEPRINT_TRANSFER,
  EXTENSION_CONTRACT_VERSION,
  MODULE_ID,
  MODULE_VERSION,
  SCHEMA_VERSIONS
} from "../scripts/core/constants.js";
import { EFFECT_CONSEQUENCE_PRESENTATION_MODES } from "../scripts/settings.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("release versions, module identity and GitHub download tag stay in sync", async () => {
  const [manifest, pkg] = await Promise.all([read("../module.json"), read("../package.json")]);
  const module = JSON.parse(manifest);
  const packageData = JSON.parse(pkg);
  assert.match(MODULE_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(module.id, MODULE_ID);
  assert.equal(packageData.name, MODULE_ID);
  assert.equal(module.version, MODULE_VERSION);
  assert.equal(packageData.version, MODULE_VERSION);
  const download = new URL(module.download);
  assert.equal(download.hostname, "github.com");
  assert.ok(download.pathname.endsWith(`/${MODULE_ID}/releases/download/v${MODULE_VERSION}/${MODULE_ID}.zip`));
});

test("release preserves public API, extension, persisted schemas and consequence modes", () => {
  assert.equal(API_VERSION, 18);
  assert.equal(EXTENSION_CONTRACT_VERSION, 1);
  assert.deepEqual(SCHEMA_VERSIONS, {
    card: 1, template: 1, blueprint: 2, session: 4, result: 1,
    publicState: 1, consequence: 2, pack: 1, persistence: 1
  });
  assert.equal(BLUEPRINT_TRANSFER.VERSION, 1);
  assert.deepEqual(EFFECT_CONSEQUENCE_PRESENTATION_MODES, [
    "runner", "dialog", "chatGm", "chatPublic", "automatic"
  ]);
});

test("release retains JSON transfer, independent route scrolling and draft-only sessions", async () => {
  const [builder, template, css, persistence] = await Promise.all([
    read("../scripts/app/chase-builder-app.js"),
    read("../templates/chase-builder.hbs"),
    read("../styles/chase-forge.css"),
    read("../scripts/persistence/persistence-service.js")
  ]);
  assert.match(builder, /exportBlueprintJson:\s*this\._actionExportBlueprintJson/);
  assert.match(builder, /importBlueprintJson:\s*this\._actionImportBlueprintJson/);
  assert.match(template, /class="chase-route-diagram" role="region" tabindex="0"/);
  assert.match(template, /class="chase-route-inspector" role="region" tabindex="0"/);
  assert.match(css, /\.chase-route-diagram\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.chase-route-inspector\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(persistence, /sessionId:\s*options\.sessionId\s*\?\?\s*createId\("session"\),\s*\.\.\.options,\s*status:\s*"draft"/s);
});
