import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  API_VERSION,
  EXTENSION_CONTRACT_VERSION,
  MODULE_ID,
  MODULE_VERSION,
  SCHEMA_VERSIONS
} from "../scripts/core/constants.js";

const moduleJson = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("manifest identity matches constants", () => {
  assert.equal(moduleJson.id, MODULE_ID);
  assert.equal(moduleJson.version, MODULE_VERSION);
  assert.equal(packageJson.name, MODULE_ID);
  assert.equal(packageJson.version, MODULE_VERSION);
});

test("manifest targets Foundry 14 and PF2e", () => {
  assert.equal(moduleJson.compatibility.minimum, "14");
  assert.equal(moduleJson.compatibility.verified, "14");
  assert.equal(moduleJson.relationships.systems[0].id, "pf2e");
  assert.equal(moduleJson.socket, true);
  assert.ok(moduleJson.styles.includes("styles/chase-forge.css"));
});

test("dev.14 contract versions are explicit", () => {
  assert.equal(API_VERSION, 14);
  assert.equal(EXTENSION_CONTRACT_VERSION, 1);
  assert.deepEqual(SCHEMA_VERSIONS, {
    card: 1,
    template: 1,
    blueprint: 2,
    session: 4,
    result: 1,
    publicState: 1,
    consequence: 2,
    pack: 1,
    persistence: 1
  });
});


test("localization files keep the PF2E_CHASE_FORGE namespace flat and in parity", async () => {
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));

  assert.equal(Object.hasOwn(de, "PF2E_CHASE_FORGE"), false);
  assert.equal(Object.hasOwn(en, "PF2E_CHASE_FORGE"), false);
  assert.equal(de["PF2E_CHASE_FORGE.Runner.ChatStarted"], "Verfolgungsjagd gestartet: {name}");
  assert.equal(en["PF2E_CHASE_FORGE.Runner.ChatStarted"], "Chase started: {name}");
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  assert.ok(Object.values(de).every((value) => typeof value === "string"));
  assert.ok(Object.values(en).every((value) => typeof value === "string"));
});
