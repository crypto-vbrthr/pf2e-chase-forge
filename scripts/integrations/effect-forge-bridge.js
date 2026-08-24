import {
  CRITICAL_FORGE_MODULE_ID,
  EFFECT_FORGE_MIN_API_SURFACE,
  EFFECT_FORGE_SOURCES
} from "../core/constants.js";
import { ChaseIntegrationError } from "../core/errors.js";
import { cloneData, isPlainObject, uniqueStrings } from "../data/utils.js";

function integrationError(code, message, details = null) {
  return new ChaseIntegrationError(message, { code, details });
}

function getPath(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

function targetUuid(target) {
  return target?.uuid ?? target?.document?.uuid ?? target?.actor?.uuid ?? null;
}

function compactIssue(issue = {}) {
  return {
    severity: issue.severity ?? null,
    code: issue.code ?? null,
    messageKey: issue.messageKey ?? null,
    message: issue.message ?? null,
    data: isPlainObject(issue.data) ? cloneData(issue.data) : null,
    componentIndex: Number.isInteger(issue.componentIndex) ? issue.componentIndex : null
  };
}

export function inspectEffectForgeApi(api) {
  if (!api) {
    return Object.freeze({
      available: false,
      compatible: false,
      reason: "critical-forge-unavailable",
      apiVersion: null,
      moduleVersion: null,
      schemaVersion: null,
      missing: [...EFFECT_FORGE_MIN_API_SURFACE],
      capabilities: Object.freeze({ apply: false, execute: false, readItem: false, analyze: false, migrate: false, editor: false })
    });
  }

  const missing = EFFECT_FORGE_MIN_API_SURFACE.filter(path => typeof getPath(api, path) !== "function");
  const capabilities = Object.freeze({
    apply: typeof api.effects?.apply === "function",
    execute: typeof api.effects?.execute === "function",
    readItem: typeof api.effects?.readItem === "function",
    analyze: typeof api.effects?.analyze === "function",
    migrate: typeof api.effects?.migrate === "function",
    checkCompatibility: typeof api.effects?.checkCompatibility === "function",
    editor: typeof api.ui?.openEffectForgeDefinition === "function" || typeof api.ui?.openEffectForge === "function"
  });

  return Object.freeze({
    available: true,
    compatible: missing.length === 0,
    reason: missing.length === 0 ? null : "effect-forge-api-incomplete",
    apiVersion: api.version ?? null,
    moduleVersion: api.moduleVersion ?? null,
    schemaVersion: Number.isInteger(api.schemaVersion) ? api.schemaVersion : null,
    missing,
    capabilities
  });
}

export function createEffectForgeBridge({
  moduleId = CRITICAL_FORGE_MODULE_ID,
  apiResolver = null,
  uuidResolver = null
} = {}) {
  const resolveApi = apiResolver ?? (() => globalThis.game?.modules?.get?.(moduleId)?.api ?? null);
  const resolveUuid = uuidResolver ?? (async uuid => {
    if (typeof globalThis.fromUuid !== "function") return null;
    return globalThis.fromUuid(uuid);
  });

  function getApi() {
    return resolveApi?.() ?? null;
  }

  function inspect() {
    return inspectEffectForgeApi(getApi());
  }

  function assertAvailable() {
    const api = getApi();
    const report = inspectEffectForgeApi(api);
    if (!report.available) throw integrationError("EFFECT_FORGE_UNAVAILABLE", "PF2E Critical Forge / Effect Forge is not available.", report);
    if (!report.compatible) throw integrationError("EFFECT_FORGE_INCOMPATIBLE", "The installed Effect Forge API does not provide the required public surface.", report);
    return { api, report };
  }

  async function resolveDefinition(reference = {}) {
    const { api, report } = assertAvailable();
    const source = EFFECT_FORGE_SOURCES.includes(reference.source) ? reference.source : "embedded";
    let definition;
    let unmanagedRules = [];
    let item = null;

    if (source === "embedded") {
      if (!isPlainObject(reference.definition)) throw integrationError("EFFECT_DEFINITION_MISSING", "Embedded Effect Forge consequence has no definition object.");
      definition = cloneData(reference.definition);
    } else {
      const uuid = String(reference.uuid ?? "").trim();
      if (!uuid) throw integrationError("EFFECT_ITEM_UUID_MISSING", "Effect Forge Item consequence has no UUID.");
      item = await resolveUuid(uuid);
      if (!item) throw integrationError("EFFECT_ITEM_NOT_FOUND", `Effect Forge Item '${uuid}' could not be resolved.`, { uuid });
      const loaded = await api.effects.readItem(item);
      if (!loaded?.definition) throw integrationError("EFFECT_ITEM_DEFINITION_MISSING", `Effect Forge Item '${uuid}' did not yield an Effect Definition.`, { uuid });
      definition = cloneData(loaded.definition);
      unmanagedRules = Array.isArray(loaded.unmanagedRules) ? cloneData(loaded.unmanagedRules) : [];
    }

    let migration = null;
    if (typeof api.effects.migrate === "function") {
      migration = api.effects.migrate(definition);
      definition = cloneData(migration?.definition ?? definition);
    }

    if (Number.isInteger(report.schemaVersion) && Number(definition?.schemaVersion) > report.schemaVersion) {
      throw integrationError("EFFECT_SCHEMA_FUTURE", `Effect Definition schema ${definition.schemaVersion} is newer than Effect Forge schema ${report.schemaVersion}.`, {
        definitionSchemaVersion: definition.schemaVersion,
        effectForgeSchemaVersion: report.schemaVersion
      });
    }

    return Object.freeze({
      source,
      definition,
      unmanagedRules,
      item,
      itemUuid: item?.uuid ?? reference.uuid ?? null,
      migration: migration ? cloneData(migration) : null,
      effectForge: report
    });
  }

  async function analyze(reference, { target = null } = {}) {
    const { api } = assertAvailable();
    const resolved = await resolveDefinition(reference);
    const report = api.effects.analyze(resolved.definition, target ? { target } : {});
    return Object.freeze({
      resolved,
      report: {
        valid: report?.valid === true,
        issues: (report?.issues ?? []).map(compactIssue),
        errors: (report?.errors ?? []).map(compactIssue),
        warnings: (report?.warnings ?? []).map(compactIssue),
        hints: (report?.hints ?? []).map(compactIssue),
        information: (report?.information ?? []).map(compactIssue)
      }
    });
  }

  async function apply(reference, targets, options = {}) {
    const { api } = assertAvailable();
    const resolved = await resolveDefinition(reference);
    const targetList = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
    if (targetList.length === 0) throw integrationError("EFFECT_TARGETS_EMPTY", "Effect Forge consequence has no resolved targets.");

    const analysis = api.effects.analyze(resolved.definition, { target: targetList[0] });
    if (analysis?.valid !== true) {
      throw integrationError("EFFECT_DEFINITION_INVALID", `Effect Forge rejected '${resolved.definition?.name ?? resolved.definition?.id ?? "effect"}'.`, {
        issues: (analysis?.issues ?? []).map(compactIssue)
      });
    }

    const compatibility = [];
    if (typeof api.effects.checkCompatibility === "function") {
      for (const target of targetList) {
        const result = api.effects.checkCompatibility(resolved.definition, target, options);
        compatibility.push({
          compatible: result?.compatible === true,
          targetUuid: result?.targetUuid ?? targetUuid(target),
          warnings: Array.isArray(result?.warnings) ? [...result.warnings] : []
        });
      }
    }

    const created = await api.effects.apply(resolved.definition, targetList, {
      ...options,
      unmanagedRules: options.unmanagedRules ?? resolved.unmanagedRules
    });

    return Object.freeze({
      definitionId: resolved.definition?.id ?? null,
      definitionName: resolved.definition?.name ?? null,
      source: resolved.source,
      sourceItemUuid: resolved.itemUuid,
      targetUuids: uniqueStrings(targetList.map(targetUuid)),
      createdItemUuids: uniqueStrings((Array.isArray(created) ? created : []).map(item => item?.uuid)),
      compatibility,
      migrated: resolved.migration?.migrated === true,
      fromSchemaVersion: resolved.migration?.fromVersion ?? resolved.definition?.schemaVersion ?? null,
      toSchemaVersion: resolved.migration?.toVersion ?? resolved.definition?.schemaVersion ?? null
    });
  }

  async function openEditor(reference = {}) {
    const { api } = assertAvailable();
    const resolved = await resolveDefinition(reference);
    if (typeof api.ui?.openEffectForgeDefinition === "function") {
      return api.ui.openEffectForgeDefinition(resolved.definition, { unmanagedRules: resolved.unmanagedRules });
    }
    if (resolved.item && typeof api.ui?.openEffectForge === "function") return api.ui.openEffectForge(resolved.item);
    if (typeof api.ui?.openEffectForge === "function") return api.ui.openEffectForge();
    throw integrationError("EFFECT_FORGE_EDITOR_UNAVAILABLE", "Effect Forge is installed, but its public editor API is unavailable.");
  }

  return Object.freeze({
    moduleId,
    inspect,
    isAvailable: () => inspect().compatible,
    resolveDefinition,
    analyze,
    apply,
    openEditor
  });
}
