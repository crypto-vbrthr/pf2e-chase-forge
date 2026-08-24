import { DEGREE_KEYS } from "../core/constants.js";
import { ChaseRulesError } from "../core/errors.js";

const DEGREE_INDEX = Object.freeze({
  criticalFailure: 0,
  failure: 1,
  success: 2,
  criticalSuccess: 3
});

const INDEX_DEGREE = Object.freeze(["criticalFailure", "failure", "success", "criticalSuccess"]);

function degreeError(code, message, details = null) {
  return new ChaseRulesError(message, { code, details });
}

export function stepDegree(degree, steps = 0) {
  if (!DEGREE_KEYS.includes(degree)) throw degreeError("INVALID_DEGREE", `Unsupported degree of success '${degree}'.`, { degree });
  const amount = Math.trunc(Number(steps));
  if (!Number.isFinite(amount)) throw degreeError("INVALID_DEGREE_STEP", "Degree step must be numeric.", { steps });
  const index = Math.max(0, Math.min(3, DEGREE_INDEX[degree] + amount));
  return INDEX_DEGREE[index];
}

export function degreeOfSuccess({ total, dc, natural = null } = {}) {
  const numericTotal = Number(total);
  const numericDc = Number(dc);
  if (!Number.isFinite(numericTotal) || !Number.isFinite(numericDc)) {
    throw degreeError("INVALID_CHECK_TOTAL", "Degree-of-success resolution requires finite total and DC values.", { total, dc });
  }

  let degree;
  if (numericTotal >= numericDc + 10) degree = "criticalSuccess";
  else if (numericTotal >= numericDc) degree = "success";
  else if (numericTotal <= numericDc - 10) degree = "criticalFailure";
  else degree = "failure";

  const die = natural === null || natural === undefined ? null : Number(natural);
  if (die !== null && (!Number.isInteger(die) || die < 1 || die > 20)) {
    throw degreeError("INVALID_NATURAL_ROLL", "Natural d20 result must be an integer from 1 through 20.", { natural });
  }
  if (die === 20) degree = stepDegree(degree, 1);
  else if (die === 1) degree = stepDegree(degree, -1);

  return degree;
}
