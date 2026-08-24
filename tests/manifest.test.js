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
});

test("dev.2 contract versions are explicit", () => {
  assert.equal(API_VERSION, 2);
  assert.equal(EXTENSION_CONTRACT_VERSION, 1);
  assert.deepEqual(SCHEMA_VERSIONS, {
    card: 1,
    template: 1,
    blueprint: 1,
    session: 1,
    result: 1,
    publicState: 1,
    consequence: 1,
    pack: 1
  });
});
