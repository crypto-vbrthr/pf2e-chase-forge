import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveObstaclePoints,
  obstaclePointScalingModeForIndex,
  obstaclePointsForScalingMode,
  rollingGroupSizeForBlueprint,
  stampRecommendedPointScaling
} from "../scripts/rules/chase-guidelines.js";
import { createChaseCard } from "../scripts/data/factories.js";

test("GM Core Chase Point recommendations alternate group minus one and group minus two", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(obstaclePointScalingModeForIndex), [
    "groupMinus1", "groupMinus2", "groupMinus1", "groupMinus2", "groupMinus1", "groupMinus2"
  ]);
  assert.equal(obstaclePointsForScalingMode(4, "groupMinus1"), 3);
  assert.equal(obstaclePointsForScalingMode(4, "groupMinus2"), 2);
  assert.equal(obstaclePointsForScalingMode(1, "groupMinus2"), 1);
});

test("automatic Chase Point reference size prefers groups that actually roll", () => {
  const blueprint = {
    groups: [
      { participants: [{}, {}, {}, {}, {}, {}], metadata: { paceMode: "steady" } },
      { participants: [{}, {}, {}, {}], metadata: { paceMode: "roll" } },
      { participants: [{}, {}], metadata: { paceMode: "roll" } }
    ]
  };
  assert.equal(rollingGroupSizeForBlueprint(blueprint), 4);
});

test("scalable obstacles resolve Chase Points independently for differently sized rolling groups", () => {
  const card = stampRecommendedPointScaling(createChaseCard({
    id: "world:scaled",
    name: "Scaled",
    obstacle: { requiredPoints: 99, scalable: true }
  }), { groupSize: 4, mode: "groupMinus1" });

  assert.equal(card.obstacle.requiredPoints, 3, "stored value is a builder/reference value");
  assert.equal(effectiveObstaclePoints(card, { participantIds: ["a", "b", "c", "d"] }), 3);
  assert.equal(effectiveObstaclePoints(card, { participantIds: ["x", "y"] }), 1);
});

test("custom or explicitly non-scalable obstacles retain their fixed Chase Point value", () => {
  const fixed = createChaseCard({ id: "world:fixed", name: "Fixed", obstacle: { requiredPoints: 5, scalable: false } });
  const customScalable = createChaseCard({ id: "world:custom", name: "Custom", obstacle: { requiredPoints: 4, scalable: true } });
  assert.equal(effectiveObstaclePoints(fixed, { participantIds: ["a", "b"] }), 5);
  assert.equal(effectiveObstaclePoints(customScalable, { participantIds: ["a", "b"] }), 4);
});
