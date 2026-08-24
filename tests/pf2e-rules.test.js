import test from "node:test";
import assert from "node:assert/strict";
import { createChaseCard } from "../scripts/data/factories.js";
import {
  PF2E_DIFFICULTY_ADJUSTMENTS,
  PF2E_LEVEL_DCS,
  PF2E_SIMPLE_DCS
} from "../scripts/core/constants.js";
import { ChaseRulesError } from "../scripts/core/errors.js";
import { degreeOfSuccess, stepDegree } from "../scripts/rules/degree-of-success.js";
import {
  applyDifficultyAdjustment,
  getDifficultyAdjustment,
  getLevelDc,
  getPf2eDcTables,
  getSimpleDc,
  resolveApproachDc
} from "../scripts/rules/pf2e-dc.js";

for (const [rank, dc] of Object.entries(PF2E_SIMPLE_DCS)) {
  test(`simple PF2e DC for ${rank} is ${dc}`, () => assert.equal(getSimpleDc(rank), dc));
}

for (const [level, dc] of Object.entries(PF2E_LEVEL_DCS)) {
  test(`level PF2e DC for level ${level} is ${dc}`, () => assert.equal(getLevelDc(Number(level)), dc));
}

test("level DC rejects values outside the GM Core table", () => {
  assert.throws(() => getLevelDc(-1), error => error instanceof ChaseRulesError && error.code === "LEVEL_DC_OUT_OF_RANGE");
  assert.throws(() => getLevelDc(26), error => error instanceof ChaseRulesError && error.code === "LEVEL_DC_OUT_OF_RANGE");
});

test("named difficulty adjustments reproduce the GM Core values", () => {
  for (const [name, adjustment] of Object.entries(PF2E_DIFFICULTY_ADJUSTMENTS)) {
    assert.equal(getDifficultyAdjustment(name), adjustment);
  }
  assert.equal(applyDifficultyAdjustment(24, "hard"), 26);
  assert.equal(applyDifficultyAdjustment(24, "veryEasy"), 19);
});

test("DC table snapshot is detached from constants", () => {
  const tables = getPf2eDcTables();
  assert.equal(tables.level[20], 40);
  assert.equal(tables.simple.master, 30);
  assert.equal(tables.adjustments.incrediblyHard, 10);
});

test("fixed chase approach resolves its DC", () => {
  const card = createChaseCard({ id: "fixed", name: "Fixed", approaches: [{ id: "a", dc: { mode: "fixed", value: 22, hidden: false } }] });
  const result = resolveApproachDc(card.approaches[0]);
  assert.deepEqual(result, { mode: "fixed", value: 22, base: 22, adjustment: 0, source: "fixed", hidden: false });
});

test("simple chase approach combines proficiency DC and adjustment", () => {
  const card = createChaseCard({ id: "simple", name: "Simple", approaches: [{ id: "a", dc: { mode: "simple", proficiency: "expert", difficultyAdjustment: "easy" } }] });
  assert.equal(card.approaches[0].dc.difficultyAdjustment, -2);
  assert.equal(resolveApproachDc(card.approaches[0]).value, 18);
});

test("level chase approach combines party level, offset and difficulty", () => {
  const card = createChaseCard({ id: "level", name: "Level", approaches: [{ id: "a", dc: { mode: "level", levelOffset: 1, difficultyAdjustment: 2 } }] });
  const result = resolveApproachDc(card.approaches[0], { partyLevel: 9 });
  assert.equal(result.base, 27);
  assert.equal(result.value, 29);
  assert.equal(result.source, "level:10");
});

test("GM DC mode requires an authoritative provided value", () => {
  const card = createChaseCard({ id: "gm", name: "GM", approaches: [{ id: "a", dc: { mode: "gm" } }] });
  assert.throws(() => resolveApproachDc(card.approaches[0]), error => error instanceof ChaseRulesError && error.code === "GM_DC_REQUIRED");
  assert.equal(resolveApproachDc(card.approaches[0], { gmDc: 31 }).value, 31);
});

test("no-DC approach resolves without inventing a number", () => {
  const card = createChaseCard({ id: "none", name: "None", approaches: [{ id: "a", dc: { mode: "none" } }] });
  assert.equal(resolveApproachDc(card.approaches[0]).value, null);
});

test("degree of success uses PF2e +/-10 thresholds", () => {
  assert.equal(degreeOfSuccess({ total: 30, dc: 20 }), "criticalSuccess");
  assert.equal(degreeOfSuccess({ total: 20, dc: 20 }), "success");
  assert.equal(degreeOfSuccess({ total: 19, dc: 20 }), "failure");
  assert.equal(degreeOfSuccess({ total: 10, dc: 20 }), "criticalFailure");
});

test("natural 20 improves and natural 1 worsens by one degree", () => {
  assert.equal(degreeOfSuccess({ total: 18, dc: 20, natural: 20 }), "success");
  assert.equal(degreeOfSuccess({ total: 30, dc: 20, natural: 1 }), "success");
  assert.equal(degreeOfSuccess({ total: 10, dc: 20, natural: 20 }), "failure");
  assert.equal(degreeOfSuccess({ total: 20, dc: 20, natural: 1 }), "failure");
});

test("degree stepping clamps at critical endpoints", () => {
  assert.equal(stepDegree("criticalSuccess", 1), "criticalSuccess");
  assert.equal(stepDegree("criticalFailure", -1), "criticalFailure");
});
