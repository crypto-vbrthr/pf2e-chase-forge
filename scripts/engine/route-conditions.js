import {
  ROUTE_CONDITION_OPERATORS,
  ROUTE_CONDITION_SOURCES
} from "../core/constants.js";
import { isPlainObject } from "../data/utils.js";

function getByPath(root, path) {
  if (!path) return root;
  const parts = String(path).split(".").filter(Boolean);
  let value = root;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function includesValue(actual, expected) {
  if (Array.isArray(actual) || typeof actual === "string") return actual.includes(expected);
  if (actual instanceof Set) return actual.has(expected);
  return false;
}

function compare(actual, operator, expected) {
  switch (operator) {
    case "equals": return actual === expected;
    case "notEquals": return actual !== expected;
    case "truthy": return Boolean(actual);
    case "falsy": return !actual;
    case "includes": return includesValue(actual, expected);
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    default: return false;
  }
}

function rootForSource(source, { session, group, context }) {
  switch (source) {
    case "context": return context;
    case "session": return session;
    case "group": return group;
    case "nodeState": return session?.nodeState ?? {};
    default: return undefined;
  }
}

export function evaluateRouteCondition(condition, runtime = {}) {
  if (!isPlainObject(condition)) {
    return { passed: false, code: "INVALID_CONDITION", actual: undefined };
  }
  const source = ROUTE_CONDITION_SOURCES.includes(condition.source) ? condition.source : null;
  const operator = ROUTE_CONDITION_OPERATORS.includes(condition.operator) ? condition.operator : null;
  if (!source || !operator || typeof condition.path !== "string" || !condition.path.trim()) {
    return { passed: false, code: "INVALID_CONDITION", actual: undefined };
  }
  const actual = getByPath(rootForSource(source, runtime), condition.path);
  const passed = compare(actual, operator, condition.value);
  return {
    passed,
    code: passed ? "CONDITION_PASSED" : "CONDITION_FAILED",
    actual
  };
}

export function evaluateRouteConditions(conditions = [], runtime = {}) {
  const results = (Array.isArray(conditions) ? conditions : []).map(condition => ({
    condition,
    ...evaluateRouteCondition(condition, runtime)
  }));
  return {
    passed: results.every(result => result.passed),
    results
  };
}
