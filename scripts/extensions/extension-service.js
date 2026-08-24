import { EXTENSION_CAPABILITIES, EXTENSION_CONTRACT_VERSION } from "../core/constants.js";
import { ChaseExtensionError } from "../core/errors.js";
import { isPlainObject } from "../data/utils.js";
import { normalizeOwnedResourceId } from "../registries/registry-utils.js";
import {
  assertExtensionCompatibility,
  checkExtensionCompatibility,
  currentExtensionEnvironment
} from "./compatibility.js";
import {
  chaseExtensionDiagnostics,
  recordExtensionFailure,
  recordExtensionSuccess
} from "./diagnostics.js";

function normalizeRequirements(requirements) {
  return isPlainObject(requirements) ? requirements : {};
}

function mergeRequirements(base, additional) {
  const a = normalizeRequirements(base);
  const b = normalizeRequirements(additional);
  return {
    ...a,
    ...b,
    schemas: { ...(a.schemas ?? {}), ...(b.schemas ?? {}) },
    capabilities: [...new Set([...(a.capabilities ?? []), ...(b.capabilities ?? [])])]
  };
}

function ids(packs) {
  return (Array.isArray(packs) ? packs : []).map(pack => pack?.id).filter(Boolean).map(String);
}

function operation(owner, resourceType, action, resourceIds, callback) {
  try {
    const result = callback();
    recordExtensionSuccess({
      sourceModule: owner,
      resourceType,
      action,
      code: "CHASE_EXTENSION_OPERATION_SUCCEEDED",
      message: `Chase Forge extension ${action} succeeded.`,
      resourceIds
    });
    return result;
  } catch (error) {
    if (!error?.extensionDiagnostic) {
      recordExtensionFailure(error, { sourceModule: owner, resourceType, action, resourceIds });
    }
    throw error;
  }
}

async function asyncOperation(owner, resourceType, action, resourceIds, callback) {
  try {
    const result = await callback();
    recordExtensionSuccess({
      sourceModule: owner,
      resourceType,
      action,
      code: "CHASE_EXTENSION_OPERATION_SUCCEEDED",
      message: `Chase Forge extension ${action} succeeded.`,
      resourceIds
    });
    return result;
  } catch (error) {
    if (!error?.extensionDiagnostic) {
      recordExtensionFailure(error, { sourceModule: owner, resourceType, action, resourceIds });
    }
    throw error;
  }
}

export function createChaseForgeExtensionApi(registries, sourceModule, {
  version = null,
  requirements = {}
} = {}) {
  const owner = String(sourceModule ?? "").trim();
  if (!owner) {
    throw new ChaseExtensionError("A Foundry module id is required to create a Chase Forge extension controller.", {
      code: "CHASE_EXTENSION_MODULE_REQUIRED"
    });
  }

  const configuredRequirements = normalizeRequirements(requirements);
  const checkCompatible = (additional = {}) => checkExtensionCompatibility(mergeRequirements(configuredRequirements, additional));
  const assertCompatible = (additional = {}) => {
    try {
      const report = assertExtensionCompatibility(mergeRequirements(configuredRequirements, additional));
      recordExtensionSuccess({
        sourceModule: owner,
        resourceType: "extension",
        action: "compatibility",
        code: "CHASE_EXTENSION_COMPATIBLE",
        message: "Chase Forge extension requirements are satisfied."
      });
      return report;
    } catch (error) {
      recordExtensionFailure(error, {
        sourceModule: owner,
        resourceType: "extension",
        action: "compatibility",
        code: "CHASE_EXTENSION_INCOMPATIBLE"
      });
      throw error;
    }
  };

  const requireCompatibility = () => assertExtensionCompatibility(configuredRequirements);

  return Object.freeze({
    sourceModule: owner,
    extensionVersion: version ? String(version) : null,
    contractVersion: EXTENSION_CONTRACT_VERSION,
    capabilities: Object.freeze([...EXTENSION_CAPABILITIES]),
    checkCompatibility: checkCompatible,
    assertCompatible,
    registerPack: (pack, options = {}) => operation(owner, "pack", "register", [pack?.id].filter(Boolean), () => {
      requireCompatibility();
      const preparedPack = version && pack?.version == null ? { ...pack, version: String(version) } : pack;
      return registries.registerPack(owner, preparedPack, options);
    }),
    registerPacks: (packs, options = {}) => operation(owner, "pack", "register-batch", ids(packs), () => {
      requireCompatibility();
      const preparedPacks = version
        ? packs.map(pack => pack?.version == null ? { ...pack, version: String(version) } : pack)
        : packs;
      return registries.registerPacks(owner, preparedPacks, options);
    }),
    unregisterPack: packId => operation(owner, "pack", "unregister", [packId], () => {
      const ownedId = normalizeOwnedResourceId(owner, packId, { allowCoreAlias: true });
      return registries.unregisterPack(owner, ownedId);
    }),
    getPack: packId => {
      const ownedId = normalizeOwnedResourceId(owner, packId, { allowCoreAlias: true });
      const pack = registries.getPack(ownedId);
      return pack?.sourceModule === owner ? pack : null;
    },
    listPacks: (options = {}) => registries.listPacks({ ...options, owner }),
    listCards: (options = {}) => registries.listCards({ ...options, owner }),
    listTemplates: (options = {}) => registries.listTemplates({ ...options, owner }),
    listImageProviders: (options = {}) => registries.listImageProviders({ ...options, owner }),
    setPackEnabled: (packId, enabled) => asyncOperation(owner, "pack", enabled ? "enable" : "disable", [packId], async () => {
      const ownedId = normalizeOwnedResourceId(owner, packId, { allowCoreAlias: true });
      const pack = registries.getPack(ownedId);
      if (!pack || pack.sourceModule !== owner) {
        throw new ChaseExtensionError(`Pack '${ownedId}' is not owned by '${owner}'.`, {
          code: "CHASE_PACK_OWNERSHIP",
          details: { packId: ownedId, sourceModule: owner }
        });
      }
      return registries.setPackEnabled(ownedId, enabled);
    }),
    listRegistrations: () => registries.listRegistrations(owner),
    unregisterAll: () => operation(owner, "extension", "unregister-all", [], () => registries.unregisterAll(owner)),
    diagnostics: Object.freeze({
      list: (options = {}) => chaseExtensionDiagnostics.list({ ...options, sourceModule: owner }),
      clear: () => chaseExtensionDiagnostics.clear({ sourceModule: owner })
    })
  });
}

export function createExtensionPublicApi(registries) {
  return Object.freeze({
    contractVersion: EXTENSION_CONTRACT_VERSION,
    capabilities: Object.freeze([...EXTENSION_CAPABILITIES]),
    environment: currentExtensionEnvironment(),
    checkCompatibility: (requirements = {}) => checkExtensionCompatibility(requirements),
    assertCompatible: (requirements = {}) => assertExtensionCompatibility(requirements),
    forModule: (sourceModule, options = {}) => createChaseForgeExtensionApi(registries, sourceModule, options),
    diagnostics: Object.freeze({
      list: (options = {}) => chaseExtensionDiagnostics.list(options),
      clear: (options = {}) => chaseExtensionDiagnostics.clear(options)
    })
  });
}
