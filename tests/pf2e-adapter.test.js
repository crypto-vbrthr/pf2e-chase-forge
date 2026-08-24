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
