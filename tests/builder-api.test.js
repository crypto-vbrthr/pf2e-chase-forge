import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";

test("dev.12 public API exposes Basic and Branching Builder helpers", () => {
  const api = createPublicApi();
  assert.equal(api.version, 12);
  assert.equal(api.getCapabilities().basicBuilder, true);
  assert.equal(api.getCapabilities().builderUi, false);
  assert.equal(api.builder.contractVersion, 1);
  const draft = api.builder.createDraft({ name: "API Chase" });
  const withCard = api.builder.addManualCard(draft, { name: "Gate" }).blueprint;
  assert.equal(api.builder.listCards(withCard)[0].card.name, "Gate");
  assert.equal(api.builder.validate(withCard, { forStart: true }).valid, true);
  assert.equal(Object.isFrozen(api.builder), true);
  assert.equal(Object.isFrozen(api.ui), true);
});

test("UI capability is advertised when a Builder UI service is supplied", async () => {
  let opened = false;
  const ui = {
    async openBuilder() { opened = true; return "builder"; },
    closeBuilder() { return true; },
    getOpenBuilder() { return null; }
  };
  const api = createPublicApi({ ui });
  assert.equal(api.getCapabilities().builderUi, true);
  assert.equal(await api.ui.openBuilder(), "builder");
  assert.equal(opened, true);
});
