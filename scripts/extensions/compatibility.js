import {
  API_VERSION,
  EXTENSION_CAPABILITIES,
  EXTENSION_CONTRACT_VERSION,
  MODULE_VERSION,
  SCHEMA_VERSIONS
} from "../core/constants.js";
import { ChaseExtensionError } from "../core/errors.js";
import { cloneData, isPlainObject } from "../data/utils.js";

function parseVersion(value) {
  const text = String(value ?? "0").trim().replace(/^v/i, "");
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return { major: 0, minor: 0, patch: 0, pre: [] };
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    pre: match[4] ? match[4].split(".") : []
  };
}

function compareIdentifiers(a, b) {
  const aNum = /^\d+$/.test(a) ? Number(a) : null;
  const bNum = /^\d+$/.test(b) ? Number(b) : null;
  if (aNum !== null && bNum !== null) return Math.sign(aNum - bNum);
  if (aNum !== null) return -1;
  if (bNum !== null) return 1;
  return a.localeCompare(b);
}

export function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (const key of ["major", "minor", "patch"]) {
    if (av[key] !== bv[key]) return Math.sign(av[key] - bv[key]);
  }
  if (av.pre.length === 0 && bv.pre.length === 0) return 0;
  if (av.pre.length === 0) return 1;
  if (bv.pre.length === 0) return -1;
  const length = Math.max(av.pre.length, bv.pre.length);
  for (let index = 0; index < length; index += 1) {
    if (av.pre[index] === undefined) return -1;
    if (bv.pre[index] === undefined) return 1;
    const comparison = compareIdentifiers(av.pre[index], bv.pre[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function satisfiesCaret(actual, expected) {
  const base = parseVersion(expected);
  if (compareVersions(actual, expected) < 0) return false;
  if (base.major > 0) return compareVersions(actual, `${base.major + 1}.0.0`) < 0;
  if (base.minor > 0) return compareVersions(actual, `0.${base.minor + 1}.0`) < 0;
  return compareVersions(actual, `0.0.${base.patch + 1}`) < 0;
}

function satisfiesTilde(actual, expected) {
  const base = parseVersion(expected);
  if (compareVersions(actual, expected) < 0) return false;
  return compareVersions(actual, `${base.major}.${base.minor + 1}.0`) < 0;
}

export function satisfiesVersion(actual, expression) {
  if (expression === null || expression === undefined || expression === "") return true;
  if (typeof expression === "number") return Number(actual) === expression;
  const requirement = String(expression).trim();
  const match = requirement.match(/^(>=|<=|>|<|\^|~)?\s*(.+)$/);
  const operator = match?.[1] ?? "=";
  const expected = match?.[2] ?? requirement;
  if (operator === "^") return satisfiesCaret(actual, expected);
  if (operator === "~") return satisfiesTilde(actual, expected);
  const comparison = compareVersions(actual, expected);
  if (operator === ">=") return comparison >= 0;
  if (operator === "<=") return comparison <= 0;
  if (operator === ">") return comparison > 0;
  if (operator === "<") return comparison < 0;
  return comparison === 0;
}

export function currentExtensionEnvironment() {
  return Object.freeze({
    moduleVersion: MODULE_VERSION,
    apiVersion: API_VERSION,
    extensionContractVersion: EXTENSION_CONTRACT_VERSION,
    schemas: Object.freeze({ ...SCHEMA_VERSIONS }),
    capabilities: Object.freeze([...EXTENSION_CAPABILITIES])
  });
}

export function checkExtensionCompatibility(requirements = {}) {
  const requested = isPlainObject(requirements) ? cloneData(requirements) : {};
  const available = currentExtensionEnvironment();
  const issues = [];

  const check = (field, actual, code) => {
    const expression = requested[field];
    if (expression !== undefined && !satisfiesVersion(actual, expression)) {
      issues.push({ code, field, required: expression, actual });
    }
  };

  check("moduleVersion", available.moduleVersion, "CHASE_EXTENSION_MODULE_VERSION");
  check("apiVersion", available.apiVersion, "CHASE_EXTENSION_API_VERSION");
  check("extensionContractVersion", available.extensionContractVersion, "CHASE_EXTENSION_CONTRACT_VERSION");

  const schemaRequirements = isPlainObject(requested.schemas) ? requested.schemas : {};
  for (const [schema, expression] of Object.entries(schemaRequirements)) {
    if (!(schema in available.schemas)) {
      issues.push({ code: "CHASE_EXTENSION_SCHEMA_UNKNOWN", field: `schemas.${schema}`, required: expression, actual: null });
      continue;
    }
    if (!satisfiesVersion(available.schemas[schema], expression)) {
      issues.push({
        code: "CHASE_EXTENSION_SCHEMA_VERSION",
        field: `schemas.${schema}`,
        required: expression,
        actual: available.schemas[schema]
      });
    }
  }

  const requiredCapabilities = Array.isArray(requested.capabilities) ? requested.capabilities.map(String) : [];
  for (const capability of requiredCapabilities) {
    if (!available.capabilities.includes(capability)) {
      issues.push({ code: "CHASE_EXTENSION_CAPABILITY", field: "capabilities", required: capability, actual: false });
    }
  }

  return Object.freeze({
    compatible: issues.length === 0,
    requirements: Object.freeze(requested),
    available,
    issues: Object.freeze(issues),
    errors: Object.freeze(issues),
    warnings: Object.freeze([])
  });
}

export function assertExtensionCompatibility(requirements = {}) {
  const report = checkExtensionCompatibility(requirements);
  if (report.compatible) return report;
  const error = new ChaseExtensionError("Chase Forge extension requirements are not satisfied.", {
    code: "CHASE_EXTENSION_INCOMPATIBLE",
    details: { issues: report.issues }
  });
  error.compatibility = report;
  throw error;
}
