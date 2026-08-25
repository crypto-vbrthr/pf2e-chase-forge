import { MODULE_ID } from "../core/constants.js";
import { cloneData, nowIso } from "../data/utils.js";
import { createChaseReference } from "../persistence/references.js";

export const CAMPAIGN_FORGE_MODULE_ID = "campaign-forge";
export const CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION = 1;
export const CHASE_CAMPAIGN_PROVIDER_ID = "chaseForge";

function i18n(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function format(key, data, fallback) {
  const value = globalThis.game?.i18n?.format?.(key, data);
  return value && value !== key ? value : fallback;
}

function notify(level, message) {
  globalThis.ui?.notifications?.[level]?.(message);
}

function requireGm() {
  if (globalThis.game?.user && globalThis.game.user.isGM !== true) {
    const error = new Error("Only a GM can use the Chase Forge Campaign integration.");
    error.code = "CHASE_GM_REQUIRED";
    throw error;
  }
}

function normalizeKind(kind) {
  const value = String(kind ?? "blueprint");
  if (!new Set(["blueprint", "library"]).has(value)) throw new TypeError(`Unsupported Campaign Chase target kind '${value}'.`);
  return value;
}

function frozen(value) {
  const copy = cloneData(value);
  const deepFreeze = object => {
    if (!object || typeof object !== "object" || Object.isFrozen(object)) return object;
    for (const item of Object.values(object)) deepFreeze(item);
    return Object.freeze(object);
  };
  return deepFreeze(copy);
}

function graphSummary(blueprint) {
  const nodes = Array.isArray(blueprint?.graph?.nodes) ? blueprint.graph.nodes : [];
  const edges = Array.isArray(blueprint?.graph?.edges) ? blueprint.graph.edges : [];
  return {
    cards: nodes.filter(node => node?.type === "card").length,
    choices: nodes.filter(node => node?.type === "choice").length,
    merges: nodes.filter(node => node?.type === "merge").length,
    endings: Array.isArray(blueprint?.graph?.endNodeIds) ? blueprint.graph.endNodeIds.length : 0,
    edges: edges.length
  };
}

function descriptor(kind, blueprint) {
  const targetKind = normalizeKind(kind);
  const id = String(blueprint?.id ?? "");
  return frozen({
    provider: CHASE_CAMPAIGN_PROVIDER_ID,
    kind: targetKind,
    id,
    targetId: id,
    reference: targetKind === "blueprint" ? createChaseReference("blueprint", id) : `ChaseLibrary.${id}`,
    label: String(blueprint?.name ?? id),
    description: String(blueprint?.description ?? ""),
    readOnly: targetKind === "library",
    chaseType: blueprint?.settings?.chaseType ?? "pursuit",
    difficulty: blueprint?.settings?.difficulty ?? "moderate",
    length: blueprint?.settings?.length ?? "custom",
    graph: graphSummary(blueprint),
    source: cloneData(blueprint?.source ?? null),
    library: cloneData(blueprint?.metadata?.library ?? null)
  });
}

export function inspectCampaignForgeApi(api) {
  const version = api?.apiVersion ?? null;
  return Object.freeze({
    present: Boolean(api),
    apiVersion: version,
    stable: api?.stability === "stable",
    compatible: Boolean(api && Number(version) >= 1),
    externalLinks: Boolean(api?.addExternalLink && api?.removeExternalLink),
    integrationRegistry: Boolean(api?.integrations?.getStatus)
  });
}

export function createCampaignForgeBridge({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  function campaignModule() {
    return globalThis.game?.modules?.get?.(CAMPAIGN_FORGE_MODULE_ID) ?? null;
  }

  function inspect() {
    const module = campaignModule();
    const api = module?.active ? module.api ?? null : null;
    return Object.freeze({
      moduleId: CAMPAIGN_FORGE_MODULE_ID,
      providerId: CHASE_CAMPAIGN_PROVIDER_ID,
      installed: Boolean(module),
      active: Boolean(module?.active),
      version: module?.version ?? "",
      ...inspectCampaignForgeApi(api)
    });
  }

  function isAvailable() {
    return inspect().compatible;
  }

  async function listPrepared({ includeWorld = true, includeLibrary = true } = {}) {
    requireGm();
    const api = getApi();
    const values = [];
    if (includeWorld) {
      const blueprints = await api?.persistence?.blueprints?.list?.() ?? [];
      values.push(...blueprints.map(blueprint => descriptor("blueprint", blueprint)));
    }
    if (includeLibrary) {
      const blueprints = api?.library?.list?.({ includeDisabled: false }) ?? [];
      values.push(...blueprints.map(blueprint => descriptor("library", blueprint)));
    }
    return frozen(values.sort((a, b) => a.label.localeCompare(b.label)));
  }

  async function resolve(kind, targetId) {
    requireGm();
    const targetKind = normalizeKind(kind);
    const id = String(targetId ?? "").trim();
    if (!id) return null;
    const api = getApi();
    const blueprint = targetKind === "library"
      ? api?.library?.get?.(id, { includeDisabled: false }) ?? null
      : await api?.persistence?.blueprints?.get?.(id) ?? null;
    return blueprint ? cloneData(blueprint) : null;
  }

  async function getContext(kind, targetId) {
    const blueprint = await resolve(kind, targetId);
    return blueprint ? descriptor(kind, blueprint) : null;
  }

  async function open(kind, targetId) {
    requireGm();
    const targetKind = normalizeKind(kind);
    const blueprint = await resolve(targetKind, targetId);
    if (!blueprint) return null;
    const api = getApi();
    return targetKind === "library"
      ? api?.ui?.openBuilder?.({ libraryBlueprintId: blueprint.id }) ?? null
      : api?.ui?.openBuilder?.({ blueprintId: blueprint.id }) ?? null;
  }

  async function openNew(options = {}) {
    requireGm();
    return getApi()?.ui?.openBuilder?.({ newChase: true, ...cloneData(options) }) ?? null;
  }

  function campaignMetadata(kind, targetId, campaign = {}) {
    return {
      moduleId: CAMPAIGN_FORGE_MODULE_ID,
      provider: CHASE_CAMPAIGN_PROVIDER_ID,
      entryId: campaign.entryId ? String(campaign.entryId) : null,
      entryTitle: campaign.entryTitle ? String(campaign.entryTitle) : null,
      linkId: campaign.linkId ? String(campaign.linkId) : null,
      targetKind: normalizeKind(kind),
      targetId: String(targetId),
      startedAt: nowIso()
    };
  }

  async function start(kind, targetId, { campaign = {}, openRunner = true, openPlayerView = true } = {}) {
    requireGm();
    const targetKind = normalizeKind(kind);
    const blueprint = await resolve(targetKind, targetId);
    const api = getApi();
    const validation = blueprint ? api?.validation?.blueprint?.(blueprint) : { valid: false };
    if (!blueprint || !validation?.valid) {
      const error = new Error(`Campaign Chase target '${targetKind}:${targetId}' is unavailable or invalid.`);
      error.code = "CHASE_CAMPAIGN_TARGET_INVALID";
      throw error;
    }

    const campaignInfo = campaignMetadata(targetKind, blueprint.id, campaign);
    const metadata = {
      campaign: campaignInfo,
      startedFromCampaignForge: true
    };
    if (targetKind === "library") {
      metadata.libraryOrigin = {
        blueprintId: blueprint.id,
        source: cloneData(blueprint.source ?? null),
        startedDirectly: true,
        startedFromCampaignForge: true
      };
    }

    const draft = targetKind === "library"
      ? await api.sessionManager.createSession(blueprint, { metadata })
      : await api.sessionManager.createSession(blueprint.id, { metadata });
    const session = await api.sessionManager.startSession(draft.id);

    await api.presentation?.chat?.postEvent?.({
      title: format("PF2E_CHASE_FORGE.Campaign.ChatStarted", { name: blueprint.name }, `Verfolgungsjagd aus Campaign Forge gestartet: ${blueprint.name}`)
    }, { flags: { sessionId: session.id, startedFromCampaignForge: true, campaign: campaignInfo } }).catch(() => null);

    if (openPlayerView) {
      try { await api.sync?.publishSession?.(session, { open: true }); }
      catch { /* Campaign-started Chases remain valid without a connected player socket. */ }
    }
    if (openRunner) await api.ui?.openRunner?.({ sessionId: session.id });

    notify("info", format("PF2E_CHASE_FORGE.Campaign.Started", { name: blueprint.name }, `${blueprint.name} gestartet.`));
    return frozen({
      session: cloneData(session),
      sessionId: session.id,
      sessionReference: createChaseReference("session", session.id),
      target: descriptor(targetKind, blueprint),
      campaign: campaignInfo
    });
  }

  async function getResult(sessionId) {
    requireGm();
    const values = await getApi()?.persistence?.results?.list?.({ sessionId: String(sessionId ?? "") }) ?? [];
    const result = values[0] ?? null;
    return result ? frozen({ ...result, reference: createChaseReference("result", result.id) }) : null;
  }

  async function getLatestResult(kind, targetId, { entryId = null } = {}) {
    requireGm();
    const targetKind = normalizeKind(kind);
    const id = String(targetId ?? "");
    const results = await getApi()?.persistence?.results?.list?.({ blueprintId: id }) ?? [];
    const filtered = results.filter(result => {
      const campaign = result?.metadata?.campaign;
      if (campaign?.targetKind && campaign.targetKind !== targetKind) return false;
      if (entryId && campaign?.entryId !== entryId) return false;
      return true;
    });
    filtered.sort((a, b) => String(b.endedAt ?? "").localeCompare(String(a.endedAt ?? "")));
    const result = filtered[0] ?? null;
    return result ? frozen({ ...result, reference: createChaseReference("result", result.id) }) : null;
  }

  async function linkToCampaignEntry(entryId, kind, targetId, { label = null, meta = {} } = {}) {
    requireGm();
    const campaignApi = campaignModule()?.active ? campaignModule().api ?? null : null;
    if (typeof campaignApi?.addExternalLink !== "function") {
      const error = new Error("Campaign Forge external-link API is unavailable.");
      error.code = "CAMPAIGN_FORGE_UNAVAILABLE";
      throw error;
    }
    const context = await getContext(kind, targetId);
    if (!context) {
      const error = new Error(`Unknown Chase target '${kind}:${targetId}'.`);
      error.code = "CHASE_CAMPAIGN_TARGET_MISSING";
      throw error;
    }
    return campaignApi.addExternalLink(String(entryId), {
      provider: CHASE_CAMPAIGN_PROVIDER_ID,
      kind: context.kind,
      targetId: context.id,
      label: label ?? context.label,
      meta: { ...cloneData(meta), chaseType: context.chaseType, source: cloneData(context.source) }
    });
  }

  return Object.freeze({
    moduleId: CAMPAIGN_FORGE_MODULE_ID,
    providerId: CHASE_CAMPAIGN_PROVIDER_ID,
    contractVersion: CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION,
    inspect,
    isAvailable,
    listPrepared,
    resolve,
    getContext,
    open,
    openNew,
    start,
    getResult,
    getLatestResult,
    linkToCampaignEntry
  });
}
