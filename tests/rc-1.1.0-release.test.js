import test from "node:test";
import assert from "node:assert/strict";
import { API_VERSION, EXTENSION_CONTRACT_VERSION, MODULE_VERSION, SCHEMA_VERSIONS } from "../scripts/core/constants.js";
import { EFFECT_CONSEQUENCE_PRESENTATION_MODES } from "../scripts/settings.js";

test("1.1.0-rc.2 freezes the public contract while exposing all consequence presentation modes", () => {
  assert.equal(MODULE_VERSION, "1.1.0-rc.2");
  assert.equal(API_VERSION, 18);
  assert.equal(EXTENSION_CONTRACT_VERSION, 1);
  assert.equal(SCHEMA_VERSIONS.session, 4);
  assert.equal(SCHEMA_VERSIONS.consequence, 2);
  assert.deepEqual(EFFECT_CONSEQUENCE_PRESENTATION_MODES, ["runner", "dialog", "chatGm", "chatPublic", "automatic"]);
});
