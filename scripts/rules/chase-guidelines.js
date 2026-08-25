import { cloneData } from "../data/utils.js";

export const CHASE_POINT_SCALING_MODES = Object.freeze([
  "groupMinus1",
  "groupMinus2"
]);

export function recommendObstaclePoints(groupSize) {
  const size = Math.max(1, Math.trunc(Number(groupSize) || 1));
  return Object.freeze({
    groupSize: size,
    oneLess: Math.max(1, size - 1),
    twoLess: Math.max(1, size - 2)
  });
}

export function obstaclePointScalingModeForIndex(index = 0) {
  return Math.abs(Math.trunc(Number(index) || 0)) % 2 === 0 ? "groupMinus1" : "groupMinus2";
}

export function obstaclePointsForScalingMode(groupSize, mode) {
  const recommendation = recommendObstaclePoints(groupSize);
  if (mode === "groupMinus2") return recommendation.twoLess;
  return recommendation.oneLess;
}

export function rollingGroupSizeForBlueprint(blueprint) {
  const groups = Array.isArray(blueprint?.groups) ? blueprint.groups : [];
  const rolling = groups.filter(group => (group?.metadata?.paceMode ?? "roll") !== "steady");
  const source = rolling.length > 0 ? rolling : groups;
  return Math.max(1, ...source.map(group => group?.participants?.length ?? 0));
}

export function stampRecommendedPointScaling(cardInput, {
  groupSize = 1,
  index = 0,
  mode = obstaclePointScalingModeForIndex(index)
} = {}) {
  const card = cloneData(cardInput ?? {});
  if (card?.obstacle?.scalable === false) return card;
  card.obstacle ??= {};
  card.obstacle.requiredPoints = obstaclePointsForScalingMode(groupSize, mode);
  card.metadata ??= {};
  card.metadata.chasePointScaling = { mode };
  return card;
}

export function clearRecommendedPointScaling(cardInput) {
  const card = cloneData(cardInput ?? {});
  if (card.metadata?.chasePointScaling) {
    delete card.metadata.chasePointScaling;
    if (Object.keys(card.metadata).length === 0) delete card.metadata;
  }
  return card;
}

export function effectiveObstaclePoints(card, runtimeGroup) {
  const fallback = Math.max(1, Math.trunc(Number(card?.obstacle?.requiredPoints) || 1));
  if (card?.obstacle?.scalable === false) return fallback;
  const mode = card?.metadata?.chasePointScaling?.mode ?? null;
  if (!CHASE_POINT_SCALING_MODES.includes(mode)) return fallback;
  const groupSize = Math.max(1, runtimeGroup?.participantIds?.length ?? 0);
  return obstaclePointsForScalingMode(groupSize, mode);
}
