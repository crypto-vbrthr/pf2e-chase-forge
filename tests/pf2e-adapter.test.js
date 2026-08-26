import test from "node:test";
import assert from "node:assert/strict";
import { ChasePf2eError } from "../scripts/core/errors.js";
import { createPf2eChaseAdapter } from "../scripts/pf2e/pf2e-adapter.js";

test("PF2e adapter resolves Actor documents and Token actor wrappers", async () => {
  const actor = { documentName: "Actor", getStatistic: () => null };
  const token = { actor };
  const adapter = createPf2eChaseAdapter({ fromUuid: async uuid => uuid === "Actor.a" ? actor : token });
  assert.equal(await adapter.resolveActor("Actor.a"), actor);
  assert.equal(await adapter.resolveActor("Scene.s.Token.t"), actor);
});

test("PF2e adapter uses actor.getStatistic first", () => {
  const statistic = { check: { roll() {} } };
  const actor = { getStatistic: slug => slug === "athletics" ? statistic : null };
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => actor });
  assert.equal(adapter.getStatistic(actor, "athletics"), statistic);
});

test("PF2e adapter delegates a check roll without recreating PF2e math", async () => {
  let captured = null;
  const statistic = {
    check: {
      async roll(options) {
        captured = options;
        return { total: 27 };
      }
    }
  };
  const actor = { getStatistic: () => statistic };
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => actor });
  const result = await adapter.rollStatistic({ actor, statistic: "athletics", dc: 24, label: "Chase", extraRollOptions: ["chase"] });
  assert.equal(result.total, 27);
  assert.deepEqual(captured.dc, { value: 24 });
  assert.deepEqual(captured.extraRollOptions, ["chase"]);
  assert.equal(captured.label, "Chase");
});

test("PF2e adapter fails explicitly when no statistic exists", () => {
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => null });
  assert.throws(() => adapter.getStatistic({ getStatistic: () => null }, "athletics"), error => error instanceof ChasePf2eError && error.code === "STATISTIC_NOT_FOUND");
});


test("PF2e adapter exposes the numeric statistic modifier for Chase approach previews", () => {
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => null });
  assert.equal(adapter.getStatisticModifier({ getStatistic: () => ({ mod: 12 }) }, "athletics"), 12);
  assert.equal(adapter.getStatisticModifier({ getStatistic: () => ({ check: { modifier: -2 } }) }, "stealth"), -2);
  assert.equal(adapter.getStatisticModifier({ getStatistic: () => ({ check: { roll() {} } }) }, "acrobatics"), null);
});

test("PF2e adapter reads proficiency ranks and enforces optional Chase minimum proficiency", () => {
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => null });
  const actor = { getStatistic: () => ({ rank: 2, check: { roll() {} } }) };
  assert.equal(adapter.getStatisticRank(actor, "athletics"), 2);
  assert.equal(adapter.meetsMinimumProficiency(actor, "athletics", "trained"), true);
  assert.equal(adapter.meetsMinimumProficiency(actor, "athletics", "expert"), true);
  assert.equal(adapter.meetsMinimumProficiency(actor, "athletics", "master"), false);
});

test("PF2e adapter forwards typed modifiers into the PF2e statistic roll", async () => {
  let captured = null;
  const statistic = { check: { async roll(options) { captured = options; return { total: 22 }; } } };
  const actor = { getStatistic: () => statistic };
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => actor });
  const modifier = { slug: "test-circumstance", modifier: 2, type: "circumstance" };
  await adapter.rollStatistic({ actor, statistic: "athletics", modifiers: [modifier] });
  assert.deepEqual(captured.modifiers, [modifier]);
});

test("PF2e adapter supports saves and a strike-backed attack statistic", async () => {
  let attackCalled = false;
  const fortitude = { rank: 2, mod: 11, check: { async roll() { return { total: 21 }; } } };
  const actor = {
    getStatistic: slug => slug === "fortitude" ? fortitude : null,
    system: { actions: [{ type: "strike", label: "Sword", totalModifier: 14, variants: [{ async roll() { attackCalled = true; return { total: 24 }; } }] }] }
  };
  const adapter = createPf2eChaseAdapter({ fromUuid: async () => actor });
  assert.equal(adapter.getStatistic(actor, "fortitude"), fortitude);
  assert.equal(adapter.getStatisticModifier(actor, "attack"), 14);
  const roll = await adapter.rollStatistic({ actor, statistic: "attack" });
  assert.equal(roll.total, 24);
  assert.equal(attackCalled, true);
});
