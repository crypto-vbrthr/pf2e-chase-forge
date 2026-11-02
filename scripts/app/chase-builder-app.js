import { MODULE_ID } from "../core/constants.js";
import {
  addApproachToBasicCard,
  addCardToBasicBlueprint,
  addManualCardToBasicBlueprint,
  addParticipantToBasicBlueprint,
  basicBuilderSummary,
  createBasicBuilderDraft,
  isBasicLinearBlueprint,
  listBasicCards,
  moveCardInBasicBlueprint,
  participantFromDocument,
  rebuildBasicLinearGraph,
  removeApproachFromBasicCard,
  removeCardFromBasicBlueprint,
  removeParticipantFromBasicBlueprint,
  replaceBasicGroupsForChaseType,
  validateBasicBuilderBlueprint
} from "../builder/basic-builder-model.js";
import {
  addApproachToBuilderCard,
  addBranchAfterCard,
  appendCardToBranchRoute,
  appendMainlineCard,
  appendMainlineManualCard,
  adoptCompatibleExtendedGraph,
  convertToBranchingBuilder,
  isBranchingBuilderBlueprint,
  isBuilderEditableBlueprint,
  insertCardRelativeToBuilderCard,
  insertManualCardRelativeToBuilderCard,
  listBranchGroups,
  listEditableCards,
  removeApproachFromBuilderCard,
  removeBuilderCardByRef,
  removeBranchGroup,
  updateBuilderCardByRef,
  validateBranchingBuilderBlueprint
} from "../builder/branching-builder-model.js";
import { cloneData, createId, nowIso } from "../data/utils.js";
import { listBlueprintMedia, safeChaseFilename } from "../persistence/blueprint-transfer.js";
import { buildGraphIndex, topologicalSort } from "../data/graph.js";
import { localizeApproachLabel, localizeChaseCard, localizeSkillLabel } from "../content/content-localization.js";
import { openFoundryImagePicker } from "../images/foundry-image-picker.js";
import { obstaclePointScalingModeForIndex, obstaclePointsForScalingMode, rollingGroupSizeForBlueprint, stampRecommendedPointScaling } from "../rules/chase-guidelines.js";

let builderAppClass = null;
let openBuilderApp = null;

function i18n(key, fallback = null) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  if (translated && translated !== key) return translated;
  return fallback ?? key;
}

function format(key, data = {}, fallback = null) {
  const translated = globalThis.game?.i18n?.format?.(key, data);
  if (translated && translated !== key) return translated;
  return fallback ?? key;
}

function notify(kind, message) {
  const fn = globalThis.ui?.notifications?.[kind] ?? globalThis.ui?.notifications?.info;
  fn?.call(globalThis.ui?.notifications, message);
}

function escapeHtml(value) {
  const text = String(value ?? "");
  return text.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function csv(value) {
  return String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionList(values, selected, prefix) {
  return values.map(value => ({ value, selected: value === selected, label: i18n(`${prefix}.${value}`, value) }));
}

const CHASE_TYPE_VALUES = ["pursuit", "escape", "againstClock", "race"];
const LENGTH_VALUES = ["short", "medium", "long", "custom"];
const DIFFICULTY_VALUES = ["easy", "moderate", "hard", "extreme", "custom"];
const IMAGE_MODE_VALUES = ["none", "manual", "predefined", "provider", "automatic"];
const GROUP_ROLE_VALUES = ["quarry", "pursuer", "competitor", "participant"];
const GROUP_PACE_VALUES = ["roll", "steady"];
const CARD_TYPE_VALUES = ["obstacle", "complication", "opportunity", "finale"];

const DEGREE_VALUES = ["criticalSuccess", "success", "failure", "criticalFailure"];

function degreeLabel(value) {
  const fallback = { criticalSuccess: "Kritischer Erfolg", success: "Erfolg", failure: "Fehlschlag", criticalFailure: "Kritischer Fehlschlag" }[value] ?? value;
  return i18n(`PF2E_CHASE_FORGE.Runner.Label.${value}`, fallback);
}

function consequenceKindLabel(value) {
  const fallback = { effectForge: "Effect Forge", routeUnlock: "Route freischalten", routeLock: "Route sperren", routeSelect: "Route wählen", narrative: "Erzählung", custom: "Benutzerdefiniert" }[value] ?? value;
  return i18n(`PF2E_CHASE_FORGE.Builder.ConsequenceKind.${value}`, fallback);
}

function cardConsequenceViews(card) {
  const rows = [];
  for (const degree of DEGREE_VALUES) {
    for (const [index, consequence] of (card?.outcomes?.[degree] ?? []).entries()) {
      if (consequence?.kind === "chasePoints") continue;
      rows.push({ degree, degreeLabel: degreeLabel(degree), scope: "card", scopeLabel: i18n("PF2E_CHASE_FORGE.Builder.ConsequenceScopeCard", "Karte"), approachIndex: null, consequenceIndex: index, id: consequence.id, kind: consequence.kind, kindLabel: consequenceKindLabel(consequence.kind), label: consequence.label || consequence.payload?.definition?.name || consequence.id, description: consequence.payload?.definition?.description ?? consequence.payload?.text ?? "", isEffectForge: consequence.kind === "effectForge" });
    }
    for (const [approachIndex, approach] of (card?.approaches ?? []).entries()) {
      for (const [index, consequence] of (approach?.outcomes?.[degree] ?? []).entries()) {
        if (consequence?.kind === "chasePoints") continue;
        rows.push({ degree, degreeLabel: degreeLabel(degree), scope: "approach", scopeLabel: localizeApproachLabel(approach), approachIndex, consequenceIndex: index, id: consequence.id, kind: consequence.kind, kindLabel: consequenceKindLabel(consequence.kind), label: consequence.label || consequence.payload?.definition?.name || consequence.id, description: consequence.payload?.definition?.description ?? consequence.payload?.text ?? "", isEffectForge: consequence.kind === "effectForge" });
      }
    }
  }
  return rows;
}

function blankEffectConsequence(schemaVersion = 2) {
  const id = createId("builder-effect");
  return {
    id: `chase-${id}`,
    kind: "effectForge",
    label: i18n("PF2E_CHASE_FORGE.Builder.NewEffectConsequence", "Neue Effekt-Konsequenz"),
    severity: "significant",
    optional: false,
    gmConfirmation: true,
    payload: {
      source: "embedded",
      required: false,
      targetMode: "participant",
      targetParticipantIds: [],
      targetUuids: [],
      definition: {
        schemaVersion: Number.isInteger(schemaVersion) ? schemaVersion : 2,
        id: `pf2e-chase-forge.${id}`,
        name: i18n("PF2E_CHASE_FORGE.Builder.NewEffectConsequence", "Neue Effekt-Konsequenz"),
        description: "",
        duration: { value: 1, unit: "minutes", expiry: null },
        components: [],
        application: {},
        metadata: { sourceModule: MODULE_ID, chaseBuilderConsequence: true }
      }
    }
  };
}
const DC_MODE_VALUES = ["level", "fixed", "simple", "gm", "none"];
const PROFICIENCY_VALUES = ["untrained", "trained", "expert", "master", "legendary"];
const DIFFICULTY_ADJUSTMENTS = [-10, -5, -2, 0, 2, 5, 10];
const TONE_LEVEL_VALUES = ["none", "low", "medium", "high"];
const TIME_VALUES = ["", "morning", "noon", "afternoon", "evening", "night", "dawn", "day", "dusk"];
const ROUND_UNIT_VALUES = ["rounds", "seconds", "minutes", "hours", "days"];
const SKILLS = [
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation",
  "medicine", "nature", "occultism", "performance", "perception", "religion", "society",
  "stealth", "survival", "thievery"
];
const SPECIAL_STATISTICS = ["fortitude", "reflex", "will", "attack"];
const ROLL_STATISTICS = [...SKILLS, ...SPECIAL_STATISTICS];
const MINIMUM_PROFICIENCY_VALUES = ["", "trained", "expert", "master", "legendary"];

export function skillLabel(slug) {
  return localizeSkillLabel(slug);
}

function statisticLabel(slug) {
  if (SPECIAL_STATISTICS.includes(slug)) return i18n(`PF2E_CHASE_FORGE.Statistic.${slug}`, slug);
  return skillLabel(slug);
}

function packLabel(pack, fallback = "") {
  if (!pack) return fallback;
  const key = pack.metadata?.i18n?.label ?? null;
  return key ? i18n(key, pack.label ?? fallback) : (pack.label ?? fallback);
}

function resolveOwnerUserIds(actor) {
  if (!actor) return [];
  const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return Object.entries(actor.ownership ?? {})
    .filter(([userId, level]) => userId !== "default" && Number(level) >= ownerLevel)
    .map(([userId]) => userId);
}

function isGm() {
  return globalThis.game?.user?.isGM === true;
}

export function resolveParticipantDropUuid(data = null) {
  if (!data || typeof data !== "object") return null;
  const direct = data.uuid ?? data.documentUuid ?? data.actorUuid ?? null;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const type = String(data.type ?? data.documentName ?? "").toLowerCase();
  const id = data.id ?? data._id ?? data.actorId ?? null;
  if (type === "actor" && id) return `Actor.${id}`;

  const sceneId = data.sceneId ?? data.scene ?? null;
  const tokenId = data.tokenId ?? (type.includes("token") ? id : null);
  if (tokenId && sceneId) return `Scene.${sceneId}.Token.${tokenId}`;
  return null;
}

export function readParticipantDragData(event) {
  try {
    const foundryData = globalThis.TextEditor?.getDragEventData?.(event);
    if (foundryData && typeof foundryData === "object" && Object.keys(foundryData).length) return foundryData;
  } catch { /* Fall through to raw DataTransfer formats. */ }

  const transfer = event?.dataTransfer ?? null;
  if (!transfer?.getData) return null;
  for (const mime of ["application/json", "text/plain", "text"]) {
    try {
      const raw = transfer.getData(mime);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* Try the next data-transfer format. */ }
  }
  return null;
}


function compactRouteCard(item, { selected = null, editable = false } = {}) {
  if (!item) return null;
  const card = item.card ?? {};
  const nodeId = item.node?.id ?? item.nodeId ?? null;
  const resolvedPreview = typeof card.imagePreviewPath === "string" && card.imagePreviewPath.trim() ? card.imagePreviewPath.trim() : null;
  const imagePath = resolvedPreview ?? (typeof card.image?.path === "string" && card.image.path.trim() ? card.image.path.trim() : null);
  return {
    index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0,
    displayIndex: item.displayIndex ?? (Number(item.index ?? 0) + 1),
    ref: item.ref ?? item.node?.cardRef ?? null,
    nodeId,
    name: card.name ?? item.node?.label ?? item.name ?? nodeId ?? "Card",
    type: card.type ?? "obstacle",
    typeLabel: item.typeLabel ?? card.type ?? "obstacle",
    requiredPoints: card.obstacle?.requiredPoints ?? null,
    imagePath,
    imageAlt: card.imagePreviewAlt || card.image?.alt || card.name || item.node?.label || "",
    selected: selected?.type === "card" && selected?.id === (item.ref ?? item.node?.cardRef),
    editable,
    canAddBranch: editable && item.canAddBranch === true
  };
}

/**
 * Build the compact Builder route view used by the activity-diagram UI.
 * Branch blocks are inserted immediately after the card that owns their
 * branch-entry edges, while branch-lane cards are removed from the mainline.
 */


function resolvePreviewCard(blueprint, cardRef, chaseApi) {
  if (!cardRef) return null;
  const snapshot = (blueprint?.contentSnapshots?.cards ?? []).find(record => record?.ref === cardRef && record?.data);
  const raw = snapshot?.data ?? chaseApi?.cards?.get?.(cardRef, { includeDisabled: true }) ?? null;
  return raw ? localizeChaseCard(raw) : null;
}

function freezeLocalizedCard(cardInput) {
  const localized = cloneData(localizeChaseCard(cardInput));
  if (localized?.metadata && typeof localized.metadata === "object") delete localized.metadata.i18n;
  return localized;
}

/**
 * Turn add-on card snapshots inside an owned Library copy into editable text in
 * the user's current Foundry language. The i18n binding is deliberately
 * removed afterwards: once a Library Chase is copied into My Chases, its text
 * becomes owned world content and subsequent user edits must not be replaced
 * by the source add-on's translations at runtime.
 *
 * Existing 1.0.4/1.0.5 copies are repaired conservatively. A field is only
 * replaced when it still matches the live add-on fallback text; customized
 * fields are preserved.
 */
export function materializeLibraryCopyLocalization(input, chaseApi) {
  const blueprint = chaseApi?.factories?.blueprint ? chaseApi.factories.blueprint(input) : cloneData(input);
  if (!blueprint?.metadata?.libraryOrigin || blueprint?.contentSnapshots?.mode !== "snapshot") return blueprint;
  const next = cloneData(blueprint);
  let changed = false;
  const localizedByRef = new Map();

  for (const record of next.contentSnapshots?.cards ?? []) {
    if (!record?.ref || !record?.data) continue;
    const liveRaw = chaseApi?.cards?.get?.(record.ref, { includeDisabled: true }) ?? null;
    const sourceCard = liveRaw ?? record.data;
    if (!sourceCard?.metadata?.i18n && !record.data?.metadata?.i18n) continue;

    const localized = freezeLocalizedCard(sourceCard);
    const current = cloneData(record.data);

    // Preserve edits made to older copied Chases. Only source-equivalent text
    // is safe to replace automatically. New copies always satisfy this test.
    if (!liveRaw || current.name === liveRaw.name) current.name = localized.name;
    if (!liveRaw || current.description === liveRaw.description) current.description = localized.description;
    if (!liveRaw || current.gmNotes === liveRaw.gmNotes) current.gmNotes = localized.gmNotes;
    if (current.image && localized.image) {
      if (!liveRaw || current.image.alt === liveRaw.image?.alt) current.image.alt = localized.image.alt;
    }

    const liveApproaches = new Map((liveRaw?.approaches ?? []).map(item => [item.id, item]));
    const localizedApproaches = new Map((localized.approaches ?? []).map(item => [item.id, item]));
    current.approaches = (current.approaches ?? []).map(approach => {
      const rawApproach = liveApproaches.get(approach.id) ?? null;
      const translated = localizedApproaches.get(approach.id) ?? null;
      if (!translated) return approach;
      const updated = cloneData(approach);
      if (!rawApproach || updated.label === rawApproach.label) updated.label = translated.label;
      if (!rawApproach || updated.description === rawApproach.description) updated.description = translated.description;
      return updated;
    });

    current.metadata ??= {};
    if (Object.hasOwn(current.metadata, "i18n")) {
      delete current.metadata.i18n;
      changed = true;
    }

    const normalizedCurrent = chaseApi?.factories?.card ? chaseApi.factories.card(current) : current;
    if (JSON.stringify(normalizedCurrent) !== JSON.stringify(record.data)) changed = true;
    record.data = normalizedCurrent;
    localizedByRef.set(record.ref, normalizedCurrent);
  }

  // The visual route title should follow the frozen local card title rather
  // than retaining the add-on's fallback label.
  for (const node of next.graph?.nodes ?? []) {
    if (node?.type !== "card" || !node.cardRef) continue;
    const card = localizedByRef.get(node.cardRef);
    if (card?.name && node.label !== card.name) {
      node.label = card.name;
      changed = true;
    }
  }

  if (next.metadata?.i18nBase) {
    delete next.metadata.i18nBase;
    changed = true;
  }
  if (changed) next.updatedAt = nowIso();
  return chaseApi?.factories?.blueprint ? chaseApi.factories.blueprint(next) : next;
}

function nearestCommonMerge(graph, branchStarts = []) {
  if (!graph || branchStarts.length < 2) return null;
  const { nodeById, outgoing } = buildGraphIndex(graph);
  const distancesFrom = startId => {
    const distances = new Map();
    const queue = [[startId, 0]];
    while (queue.length) {
      const [nodeId, distance] = queue.shift();
      if (!nodeId || distances.has(nodeId)) continue;
      distances.set(nodeId, distance);
      for (const edge of outgoing.get(nodeId) ?? []) queue.push([edge.to, distance + 1]);
    }
    return distances;
  };
  const distanceMaps = branchStarts.map(distancesFrom);
  const candidates = [...nodeById.values()].filter(node => node.type === "merge" && distanceMaps.every(map => map.has(node.id)));
  candidates.sort((a, b) => {
    const aMax = Math.max(...distanceMaps.map(map => map.get(a.id)));
    const bMax = Math.max(...distanceMaps.map(map => map.get(b.id)));
    if (aMax !== bMax) return aMax - bMax;
    const aSum = distanceMaps.reduce((sum, map) => sum + map.get(a.id), 0);
    const bSum = distanceMaps.reduce((sum, map) => sum + map.get(b.id), 0);
    return aSum - bSum || String(a.id).localeCompare(String(b.id));
  });
  return candidates[0] ?? null;
}

/**
 * Build a read-only route/card view for Library Blueprints. Library entries are
 * allowed to keep their content in reference mode and do not carry Builder
 * metadata, so the editable Builder model cannot be used for inspection.
 */
export function buildLibraryBlueprintPreview(blueprint, chaseApi) {
  const graph = blueprint?.graph ?? { nodes: [], edges: [] };
  const { nodeById, incoming, outgoing } = buildGraphIndex(graph);
  const order = topologicalSort(graph) ?? (graph.nodes ?? []).map(node => node.id);
  const cardItems = [];
  const cardByNode = new Map();

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node || node.type !== "card" || !node.cardRef) continue;
    const card = resolvePreviewCard(blueprint, node.cardRef, chaseApi);
    if (!card) continue;
    const record = (blueprint?.contentSnapshots?.cards ?? []).find(candidate => candidate?.ref === node.cardRef) ?? {
      ref: node.cardRef,
      source: cloneData(card.source ?? null),
      data: cloneData(card),
      metadata: { originCardRef: node.cardRef }
    };
    const item = {
      index: cardItems.length,
      node: cloneData(node),
      nodeId: node.id,
      ref: node.cardRef,
      record: cloneData(record),
      card: cloneData(card),
      incomingEdges: cloneData(incoming.get(node.id) ?? []),
      outgoingEdges: cloneData(outgoing.get(node.id) ?? []),
      branchGroupId: null,
      canAddBranch: false
    };
    cardItems.push(item);
    cardByNode.set(node.id, item);
  }

  const branchGroups = [];
  for (const choice of graph.nodes ?? []) {
    if (choice?.type !== "choice") continue;
    const entries = outgoing.get(choice.id) ?? [];
    if (entries.length < 2) continue;
    const merge = nearestCommonMerge(graph, entries.map(edge => edge.to));
    if (!merge) continue;

    const predecessor = (incoming.get(choice.id) ?? [])
      .map(edge => nodeById.get(edge.from))
      .find(node => node?.type === "card") ?? null;
    if (!predecessor) continue;

    const routes = entries.map((entry, routeIndex) => {
      const nodes = [];
      const seen = new Set();
      let currentId = entry.to;
      while (currentId && currentId !== merge.id && !seen.has(currentId)) {
        seen.add(currentId);
        const current = nodeById.get(currentId);
        if (!current) break;
        if (current.type === "card") {
          const item = cardByNode.get(current.id);
          nodes.push({ nodeId: current.id, ref: current.cardRef, name: item?.card?.name ?? current.label ?? current.id });
        }
        const nextEdges = outgoing.get(currentId) ?? [];
        if (nextEdges.length !== 1) break;
        currentId = nextEdges[0].to;
      }
      return {
        edgeId: entry.id,
        label: entry.label || i18n("PF2E_CHASE_FORGE.Builder.RouteLabelFallback", `Route ${routeIndex + 1}`),
        description: entry.description || "",
        visibility: entry.visibility ?? "public",
        type: entry.type ?? "branch",
        nodes
      };
    });

    const continuationEdge = (outgoing.get(merge.id) ?? [])[0] ?? null;
    const continuation = continuationEdge ? nodeById.get(continuationEdge.to) : null;
    branchGroups.push({
      branchGroupId: `library:${choice.id}`,
      sourceNodeId: predecessor.id,
      sourceLabel: cardByNode.get(predecessor.id)?.card?.name ?? predecessor.label ?? predecessor.id,
      mergeNodeId: merge.id,
      continuationNodeId: continuation?.id ?? null,
      continuationLabel: continuation?.type === "card"
        ? (cardByNode.get(continuation.id)?.card?.name ?? continuation.label ?? continuation.id)
        : (continuation?.label ?? continuation?.id ?? ""),
      routes
    });
  }

  return { cards: cardItems, branchGroups };
}

/**
 * Validate a read-only Library Blueprint without requiring Builder-local card
 * snapshots. Reference-mode library content is valid as long as the Blueprint
 * itself is structurally valid and every referenced card can be resolved from
 * either an embedded snapshot or the active card registry.
 */
export function validateLibraryBlueprintPreview(blueprint, chaseApi, preview = null) {
  const base = chaseApi?.validation?.blueprint?.(blueprint) ?? { valid: true, errors: [], warnings: [] };
  const errors = [...(base.errors ?? [])];
  const warnings = [...(base.warnings ?? [])];
  const resolvedPreview = preview ?? buildLibraryBlueprintPreview(blueprint, chaseApi);
  const expectedRefs = [...new Set((blueprint?.graph?.nodes ?? [])
    .filter(node => node?.type === "card" && node.cardRef)
    .map(node => node.cardRef))];
  const resolvedRefs = new Set((resolvedPreview?.cards ?? []).map(item => item?.ref).filter(Boolean));
  const missingRefs = expectedRefs.filter(ref => !resolvedRefs.has(ref));
  if (missingRefs.length > 0) {
    errors.push({
      code: "LIBRARY_CARD_UNRESOLVED",
      path: "graph.nodes",
      message: "One or more Library Blueprint cards could not be resolved from the active Chase Card registry.",
      details: { refs: missingRefs }
    });
  }
  return Object.freeze({ valid: errors.length === 0, errors, warnings, blueprint });
}

/**
 * Select the route/card model used by the Builder. Library Blueprints always
 * use the reference-aware read-only preview, even when their graph happens to
 * match the editable Basic/Branching Builder shape.
 */
export function resolveBuilderRouteData(blueprint, chaseApi, { librarySelected = false } = {}) {
  const linearEditable = isBasicLinearBlueprint(blueprint);
  const branchingEditable = isBranchingBuilderBlueprint(blueprint);
  const builderSupported = isBuilderEditableBlueprint(blueprint);
  const libraryPreview = librarySelected ? buildLibraryBlueprintPreview(blueprint, chaseApi) : null;
  const protectedPreview = !librarySelected && !builderSupported
    ? buildLibraryBlueprintPreview(blueprint, chaseApi)
    : null;
  const cards = librarySelected
    ? (libraryPreview?.cards ?? [])
    : (builderSupported ? listEditableCards(blueprint) : (protectedPreview?.cards ?? []));
  const branchGroups = librarySelected
    ? (libraryPreview?.branchGroups ?? [])
    : (branchingEditable ? listBranchGroups(blueprint) : (protectedPreview?.branchGroups ?? []));
  const routeWorkspaceSupported = cards.length > 0 || builderSupported;
  return { linearEditable, branchingEditable, builderSupported, libraryPreview, protectedPreview, cards, branchGroups, routeWorkspaceSupported };
}

export function buildRouteDiagramModel(cards = [], branchGroups = [], { selected = null, editable = false } = {}) {
  const cardByNodeId = new Map();
  const cardByRef = new Map();
  for (const item of cards ?? []) {
    const nodeId = item?.node?.id ?? item?.nodeId ?? null;
    if (nodeId) cardByNodeId.set(nodeId, item);
    if (item?.ref) cardByRef.set(item.ref, item);
  }

  const branchCardNodeIds = new Set();
  for (const group of branchGroups ?? []) {
    for (const route of group.routes ?? []) {
      for (const node of route.nodes ?? []) if (node?.nodeId) branchCardNodeIds.add(node.nodeId);
    }
  }
  const branchBySource = new Map((branchGroups ?? []).map(group => [group.sourceNodeId, group]));
  const mainlineCards = (cards ?? []).filter(item => {
    const nodeId = item?.node?.id ?? item?.nodeId ?? null;
    return !item?.branchGroupId && !branchCardNodeIds.has(nodeId);
  });

  const items = [];
  for (const item of mainlineCards) {
    const card = compactRouteCard(item, { selected, editable });
    items.push({ kind: "card", isCard: true, isBranch: false, card });
    const group = branchBySource.get(card?.nodeId);
    if (!group) continue;
    const routes = (group.routes ?? []).map((route, routeIndex) => ({
      ...route,
      routeIndex,
      selected: selected?.type === "branch" && selected?.id === group.branchGroupId,
      cards: (route.nodes ?? []).map(node => compactRouteCard(cardByNodeId.get(node.nodeId) ?? cardByRef.get(node.ref), { selected, editable })).filter(Boolean)
    }));
    items.push({
      kind: "branch",
      isCard: false,
      isBranch: true,
      branch: {
        ...group,
        selected: selected?.type === "branch" && selected?.id === group.branchGroupId,
        editable,
        routes
      }
    });
  }

  return Object.freeze({
    items,
    cardCount: (cards ?? []).length,
    branchCount: (branchGroups ?? []).length,
    empty: (cards ?? []).length === 0
  });
}

function layoutMetric(element, label) {
  if (!element) return { label, exists: false };
  const computed = globalThis.getComputedStyle?.(element) ?? null;
  const rect = element.getBoundingClientRect?.() ?? { x: null, y: null, width: null, height: null };
  return {
    label,
    exists: true,
    tag: element.tagName ?? null,
    id: element.id ?? "",
    classes: typeof element.className === "string" ? element.className : "",
    rectWidth: Math.round(Number(rect.width) || 0),
    rectHeight: Math.round(Number(rect.height) || 0),
    clientWidth: Number(element.clientWidth ?? 0),
    clientHeight: Number(element.clientHeight ?? 0),
    scrollWidth: Number(element.scrollWidth ?? 0),
    scrollHeight: Number(element.scrollHeight ?? 0),
    offsetWidth: Number(element.offsetWidth ?? 0),
    offsetHeight: Number(element.offsetHeight ?? 0),
    scrollTop: Number(element.scrollTop ?? 0),
    display: computed?.display ?? null,
    position: computed?.position ?? null,
    width: computed?.width ?? null,
    height: computed?.height ?? null,
    minHeight: computed?.minHeight ?? null,
    maxHeight: computed?.maxHeight ?? null,
    flex: computed?.flex ?? null,
    flexGrow: computed?.flexGrow ?? null,
    flexShrink: computed?.flexShrink ?? null,
    flexBasis: computed?.flexBasis ?? null,
    overflow: computed?.overflow ?? null,
    overflowX: computed?.overflowX ?? null,
    overflowY: computed?.overflowY ?? null,
    gridTemplateRows: computed?.gridTemplateRows ?? null,
    gridTemplateColumns: computed?.gridTemplateColumns ?? null
  };
}

function snapshotApplicationPosition(position) {
  const result = {};
  const keys = ["top", "left", "right", "bottom", "width", "height", "scale", "zIndex"];
  for (const key of keys) {
    try {
      const value = position?.[key];
      if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) result[key] = value ?? null;
      else result[key] = `[${value?.constructor?.name ?? typeof value}]`;
    } catch (error) {
      result[key] = `[unavailable: ${error?.name ?? "Error"}]`;
    }
  }
  return result;
}

function collectBuilderLayoutDiagnostics(app, reason = "manual") {
  const root = app?.element ?? null;
  const windowContent = root?.querySelector?.(":scope > .window-content") ?? root?.querySelector?.(".window-content") ?? null;
  const applicationPart = windowContent?.querySelector?.(":scope > [data-application-part]") ?? null;
  const shell = root?.querySelector?.(".chase-builder-shell") ?? null;
  const main = root?.querySelector?.(".chase-builder-main") ?? null;
  const toolbar = root?.querySelector?.(".chase-builder-toolbar") ?? null;
  const editor = root?.querySelector?.(".chase-builder-editor-scroll") ?? null;
  const sidebar = root?.querySelector?.(".chase-builder-sidebar") ?? null;
  const parentChain = [];
  let current = editor;
  for (let i = 0; current && i < 10; i += 1, current = current.parentElement) {
    parentChain.push(layoutMetric(current, `editor-parent-${i}`));
    if (current === root) break;
  }
  return {
    reason,
    timestamp: new Date().toISOString(),
    module: MODULE_ID,
    viewport: {
      innerWidth: Number(globalThis.innerWidth ?? 0),
      innerHeight: Number(globalThis.innerHeight ?? 0),
      documentClientWidth: Number(globalThis.document?.documentElement?.clientWidth ?? 0),
      documentClientHeight: Number(globalThis.document?.documentElement?.clientHeight ?? 0)
    },
    applicationPosition: snapshotApplicationPosition(app?.position),
    metrics: [
      layoutMetric(root, "app-root"),
      layoutMetric(windowContent, "window-content"),
      layoutMetric(applicationPart, "application-part"),
      layoutMetric(shell, "builder-shell"),
      layoutMetric(main, "builder-main"),
      layoutMetric(toolbar, "builder-toolbar"),
      layoutMetric(editor, "editor-scroll"),
      layoutMetric(sidebar, "builder-sidebar")
    ],
    parentChain
  };
}

function logBuilderLayoutDiagnostics(app, reason = "manual") {
  const prefix = `${MODULE_ID} | Builder layout diagnostics [${reason}]`;
  try {
    const report = collectBuilderLayoutDiagnostics(app, reason);
    console.groupCollapsed(prefix);
    console.log("Viewport / application", report.viewport, report.applicationPosition);
    console.table(report.metrics);
    console.log("Editor parent chain", report.parentChain);
    console.log("Raw diagnostic report", report);
    console.groupEnd();
    return report;
  } catch (error) {
    console.error(`${prefix} failed`, error);
    return { reason, error: { name: error?.name ?? "Error", message: error?.message ?? String(error) } };
  }
}

function setImportantStyle(element, property, value) {
  if (!element?.style?.setProperty) return;
  element.style.setProperty(property, value, "important");
}

/**
 * ApplicationV2/core styles in some Foundry builds can retain overflow/display
 * values after module CSS has been loaded. Apply the small set of structural
 * Builder layout rules directly to the live elements after each render.
 *
 * This is intentionally limited to layout-critical properties. Visual styling
 * remains in chase-forge.css.
 */
function applyBuilderRuntimeLayout(app, reason = "runtime") {
  const root = app?.element ?? null;
  if (!root) return null;

  const windowContent = root.querySelector?.(":scope > .window-content") ?? root.querySelector?.(".window-content") ?? null;
  const shell = root.querySelector?.(".chase-builder-shell") ?? null;
  const main = root.querySelector?.(".chase-builder-main") ?? null;
  const toolbar = root.querySelector?.(".chase-builder-toolbar") ?? null;
  const editor = root.querySelector?.(".chase-builder-editor-scroll") ?? null;
  const sidebar = root.querySelector?.(".chase-builder-sidebar") ?? null;
  const routeWorkspace = root.querySelector?.(".chase-route-workspace") ?? null;

  // .window-content is the bounded outer viewport. Keep it fixed and give the
  // sidebar and editor pane independent scroll positions.
  setImportantStyle(windowContent, "overflow", "hidden");
  setImportantStyle(windowContent, "min-height", "0");

  // Foundry can retain old display/overflow values after ApplicationV2 renders.
  // Reassert the two-pane layout directly on the live elements.
  setImportantStyle(shell, "display", "grid");
  setImportantStyle(shell, "grid-template-columns", "280px minmax(0, 1fr)");
  setImportantStyle(shell, "width", "100%");
  setImportantStyle(shell, "height", "100%");
  setImportantStyle(shell, "min-height", "0");
  setImportantStyle(shell, "overflow", "hidden");

  setImportantStyle(main, "display", "flex");
  setImportantStyle(main, "flex-direction", "column");
  setImportantStyle(main, "min-width", "0");
  setImportantStyle(main, "height", "100%");
  setImportantStyle(main, "min-height", "0");
  setImportantStyle(main, "overflow-y", "auto");
  setImportantStyle(main, "overflow-x", "hidden");
  main?.style?.setProperty?.("scrollbar-gutter", "stable");

  // Keep the Builder command bar visible while only the right-hand pane scrolls.
  setImportantStyle(toolbar, "position", "sticky");
  setImportantStyle(toolbar, "top", "0");
  setImportantStyle(toolbar, "z-index", "20");

  setImportantStyle(editor, "height", "auto");
  setImportantStyle(editor, "overflow", "visible");

  setImportantStyle(sidebar, "height", "100%");
  setImportantStyle(sidebar, "min-height", "0");
  setImportantStyle(sidebar, "overflow-y", "auto");
  setImportantStyle(sidebar, "overflow-x", "hidden");
  sidebar?.style?.setProperty?.("scrollbar-gutter", "stable");

  // Use the actual Foundry Builder height, not only the browser viewport: a
  // resized window must still leave room for both independently scrolled panes.
  const mainHeight = Number(main?.clientHeight ?? 0);
  if (routeWorkspace && mainHeight > 0) {
    const toolbarHeight = Number(toolbar?.offsetHeight ?? 0);
    const paneHeight = Math.max(180, Math.min(680, Math.floor(mainHeight - toolbarHeight - 38)));
    routeWorkspace.style?.setProperty?.("--chase-route-pane-max-height", `${paneHeight}px`);
  }

  root.dataset.chaseRuntimeLayout = reason;
  return { root, windowContent, shell, main, toolbar, editor, sidebar };
}

function imageCandidateLabel(candidate, index = 0) {
  return candidate?.alt || candidate?.metadata?.label || candidate?.id || `Bild ${index + 1}`;
}

function getAppClass() {
  if (builderAppClass) return builderAppClass;
  const api = globalThis.foundry?.applications?.api;
  if (!api?.ApplicationV2 || !api?.HandlebarsApplicationMixin) throw new Error("Foundry ApplicationV2 API is unavailable.");
  const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = api;

  builderAppClass = class ChaseForgeBuilderApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "pf2e-chase-forge-builder",
      classes: ["pf2e-chase-forge", "chase-forge-builder"],
      tag: "section",
      position: { width: 1220, height: 820 },
      window: {
        icon: "fa-solid fa-person-running",
        resizable: true,
        title: "PF2E_CHASE_FORGE.Builder.Title"
      },
      actions: {
        newBlueprint: this._actionNewBlueprint,
        loadBlueprint: this._actionLoadBlueprint,
        loadLibraryBlueprint: this._actionLoadLibraryBlueprint,
        toggleLibraryGroup: this._actionToggleLibraryGroup,
        copyLibraryBlueprint: this._actionCopyLibraryBlueprint,
        saveBlueprint: this._actionSaveBlueprint,
        exportBlueprintJson: this._actionExportBlueprintJson,
        importBlueprintJson: this._actionImportBlueprintJson,
        copyJournalLink: this._actionCopyJournalLink,
        createJournalEntry: this._actionCreateJournalEntry,
        duplicateBlueprint: this._actionDuplicateBlueprint,
        deleteBlueprint: this._actionDeleteBlueprint,
        startBlueprint: this._actionStartBlueprint,
        refreshBuilder: this._actionRefreshBuilder,
        addManualCard: this._actionAddManualCard,
        addRegisteredCard: this._actionAddRegisteredCard,
        insertManualCardBefore: this._actionInsertManualCardBefore,
        insertManualCardAfter: this._actionInsertManualCardAfter,
        insertRegisteredCardBefore: this._actionInsertRegisteredCardBefore,
        insertRegisteredCardAfter: this._actionInsertRegisteredCardAfter,
        moveCardUp: this._actionMoveCardUp,
        moveCardDown: this._actionMoveCardDown,
        removeCard: this._actionRemoveCard,
        addApproach: this._actionAddApproach,
        removeApproach: this._actionRemoveApproach,
        addEffectConsequence: this._actionAddEffectConsequence,
        editEffectConsequence: this._actionEditEffectConsequence,
        removeEffectConsequence: this._actionRemoveEffectConsequence,
        addSelectedTokens: this._actionAddSelectedTokens,
        removeParticipant: this._actionRemoveParticipant,
        resetGroups: this._actionResetGroups,
        applyWeatherForge: this._actionApplyWeatherForge,
        openSessionRunner: this._actionOpenSessionRunner,
        addBranchAfterCard: this._actionAddBranchAfterCard,
        appendBranchCard: this._actionAppendBranchCard,
        removeBranchGroup: this._actionRemoveBranchGroup,
        selectRouteCard: this._actionSelectRouteCard,
        selectBranchGroup: this._actionSelectBranchGroup,
        generateFromTemplate: this._actionGenerateFromTemplate,
        rerollGeneratedRoute: this._actionRerollGeneratedRoute,
        browseBlueprintImage: this._actionBrowseBlueprintImage,
        browseEndingImage: this._actionBrowseEndingImage,
        browseCardImage: this._actionBrowseCardImage,
        refreshCardImages: this._actionRefreshCardImages,
        selectCardImageCandidate: this._actionSelectCardImageCandidate,
        clearCardImageSelection: this._actionClearCardImageSelection
      }
    };

    static PARTS = {
      main: {
        template: `modules/${MODULE_ID}/templates/chase-builder.hbs`,
        scrollable: [".chase-builder-sidebar", ".chase-builder-main", ".chase-route-diagram", ".chase-route-inspector"]
      }
    };

    constructor(chaseApi, options = {}) {
      super({
        ...options,
        window: { ...(options.window ?? {}), title: i18n("PF2E_CHASE_FORGE.Builder.Title", "PF2E Chase Forge") }
      });
      this.chaseApi = chaseApi;
      this._draft = createBasicBuilderDraft();
      this._persisted = false;
      this._libraryBlueprintId = null;
      this._lastValidation = null;
      this._selectedInspector = null;
      this._pendingScrollTop = null;
      this._routeLayoutResizeObserver = null;
      this._dropBoundElement = null;
      this._participantDropHandlers = null;
      this._generatorTemplateId = null;
      this._collapsedLibraryGroups = new Set();
      this._initializedLibraryGroupDefaults = new Set();
      this._registeredCardSourceFilter = "";
      this._registeredCardCategoryFilter = "";
    }

    get draft() { return cloneData(this._draft); }

    async loadBlueprint(blueprintId) {
      const blueprint = await this.chaseApi.persistence.blueprints.get(blueprintId);
      if (!blueprint) throw new Error(`Unknown Chase Blueprint '${blueprintId}'.`);
      let normalized = this.chaseApi.factories.blueprint(blueprint);
      let shouldSave = false;

      const localizedCopy = materializeLibraryCopyLocalization(normalized, this.chaseApi);
      if (JSON.stringify(localizedCopy) !== JSON.stringify(normalized)) {
        normalized = localizedCopy;
        shouldSave = true;
      }

      const adopted = adoptCompatibleExtendedGraph(normalized);
      if (!isBuilderEditableBlueprint(normalized) && isBuilderEditableBlueprint(adopted)) {
        normalized = adopted;
        shouldSave = true;
      }
      if (shouldSave) normalized = await this.chaseApi.persistence.blueprints.save(normalized);
      this._draft = normalized;
      this._persisted = true;
      this._libraryBlueprintId = null;
      this._lastValidation = null;
      this._selectedInspector = null;
      this._generatorTemplateId = this._draft.metadata?.generator?.templateId ?? null;
      await this.render({ force: true });
      return this.draft;
    }

    async loadLibraryBlueprint(blueprintId) {
      const blueprint = this.chaseApi.library?.get?.(blueprintId, { includeDisabled: false });
      if (!blueprint) throw new Error(`Unknown Chase Library Blueprint '${blueprintId}'.`);
      this._draft = this.chaseApi.factories.blueprint(blueprint);
      this._persisted = false;
      this._libraryBlueprintId = blueprint.id;
      this._lastValidation = null;
      this._selectedInspector = null;
      this._generatorTemplateId = null;
      await this.render({ force: true });
      return this.draft;
    }

    _worldCopyFromLibrary() {
      if (!this._libraryBlueprintId) return null;
      const source = this.chaseApi.factories.blueprint(this._draft);
      const now = nowIso();
      const metadata = cloneData(source.metadata ?? {});
      delete metadata.library;
      delete metadata.i18nBase;
      delete metadata.i18n;
      metadata.libraryOrigin = {
        blueprintId: source.id,
        source: cloneData(source.source ?? null),
        copiedAt: now
      };
      return this.chaseApi.factories.blueprint({
        ...cloneData(source),
        id: createId("blueprint"),
        source: { moduleId: MODULE_ID, packId: "world-builder", version: this.chaseApi.moduleVersion ?? null },
        createdAt: now,
        updatedAt: now,
        metadata
      });
    }

    async _applyWeatherForgePrefill({ onlyUnset = true, notifyUser = false } = {}) {
      const bridge = this.chaseApi.integrations?.weatherForge ?? null;
      if (!bridge?.isAvailable?.()) {
        if (notifyUser) notify("warn", i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeUnavailable", "Weather Forge ist nicht verfügbar."));
        return null;
      }
      try {
        const current = await bridge.readCurrent();
        if (!current?.available) {
          if (notifyUser) notify("warn", i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeUnavailable", "Weather Forge ist nicht verfügbar."));
          return current;
        }
        if (current.readable === false) {
          if (notifyUser) notify("warn", i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeNotReady", "Weather Forge ist aktiv, konnte seinen aktuellen Wetterzustand aber nicht bereitstellen."));
          else if (current.errors?.length) console.warn(`${MODULE_ID} | Weather Forge is active but its current state is not readable.`, current.errors);
          return current;
        }
        const next = cloneData(this._draft);
        let changed = false;
        if (current.timeOfDay && (!onlyUnset || !next.settings.timeOfDay)) {
          next.settings.timeOfDay = current.timeOfDay;
          changed = true;
        }
        if (current.weather && (!onlyUnset || !next.settings.weather)) {
          next.settings.weather = cloneData(current.weather);
          changed = true;
        }
        if (changed) {
          next.metadata ??= {};
          next.metadata.builder ??= {};
          next.metadata.builder.weatherForgePrefill = {
            moduleId: bridge.moduleId,
            contractVersion: bridge.contractVersion,
            capturedAt: current.weather?.source?.capturedAt ?? new Date().toISOString()
          };
          this._draft = this.chaseApi.factories.blueprint(next);
        }
        if (notifyUser) {
          notify("info", changed
            ? i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeApplied", "Tageszeit und Wetter wurden aus Weather Forge übernommen.")
            : i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeNoChange", "Die aktuellen Weather-Forge-Werte waren bereits gesetzt."));
        }
        return current;
      } catch (error) {
        console.warn(`${MODULE_ID} | Weather Forge prefill failed.`, error);
        if (notifyUser) notify("warn", i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeFailed", "Weather Forge konnte nicht ausgelesen werden."));
        return null;
      }
    }

    async _resetDraftWithEnvironmentPrefill() {
      this._draft = createBasicBuilderDraft();
      this._persisted = false;
      this._libraryBlueprintId = null;
      this._lastValidation = null;
      this._selectedInspector = null;
      this._generatorTemplateId = null;
      await this._applyWeatherForgePrefill({ onlyUnset: true, notifyUser: false });
      return this._draft;
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const blueprints = await this.chaseApi.persistence.blueprints.list();
      const libraryBlueprints = this.chaseApi.library?.list?.({ includeDisabled: false }) ?? [];
      const summaries = blueprints
        .map(blueprint => ({
          ...basicBuilderSummary(blueprint),
          cardCount: blueprint.graph?.nodes?.filter?.(node => node.type === "card")?.length ?? 0,
          participantCount: (blueprint.groups ?? []).reduce((sum, group) => sum + (group.participants?.length ?? 0), 0),
          editable: isBuilderEditableBlueprint(blueprint),
          chaseTypeLabel: i18n(`PF2E_CHASE_FORGE.ChaseType.${blueprint.settings?.chaseType ?? "pursuit"}`, blueprint.settings?.chaseType ?? "pursuit"),
          active: !this._libraryBlueprintId && blueprint.id === this._draft.id
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const librarySelected = Boolean(this._libraryBlueprintId);
      const {
        linearEditable,
        branchingEditable,
        builderSupported,
        libraryPreview,
        cards,
        branchGroups,
        routeWorkspaceSupported
      } = resolveBuilderRouteData(this._draft, this.chaseApi, { librarySelected });
      const editable = !librarySelected;
      const routeEditable = builderSupported && !librarySelected;
      const advancedRouteProtected = editable && !builderSupported;
      const imageProviders = this.chaseApi.images?.providers?.list?.() ?? [];
      const imageProviderOptions = [
        { value: "", label: i18n("PF2E_CHASE_FORGE.Visual.AnyProvider", "Beliebiger Anbieter") },
        ...imageProviders.map(provider => ({ value: provider.id, label: provider.label || provider.id }))
      ];
      const resolvedCardImages = new Map();
      await Promise.all(cards.map(async item => {
        try {
          const visual = await this.chaseApi.images?.resolveCard?.(item.card, { blueprint: this._draft });
          if (item.ref) resolvedCardImages.set(item.ref, visual ?? null);
        } catch (error) {
          console.warn(`${MODULE_ID} | Failed to resolve Builder card image for '${item.ref}'.`, error);
          if (item.ref) resolvedCardImages.set(item.ref, null);
        }
      }));
      let blueprintResolvedImage = null;
      try { blueprintResolvedImage = await this.chaseApi.images?.resolveBlueprint?.(this._draft); }
      catch (error) { console.warn(`${MODULE_ID} | Failed to resolve Blueprint image.`, error); }
      const registeredCards = (this.chaseApi.cards.list({ includeDisabled: false }) ?? []).map(localizeChaseCard);
      const generatorTemplates = this.chaseApi.generator?.listTemplates?.({ includeDisabled: false }) ?? [];
      if (!this._generatorTemplateId || !generatorTemplates.some(template => template.id === this._generatorTemplateId)) {
        this._generatorTemplateId = this._draft.metadata?.generator?.templateId ?? generatorTemplates[0]?.id ?? null;
      }
      const generatorTemplateViews = generatorTemplates
        .map(template => {
          const pack = template.source?.packId ? this.chaseApi.packs?.get?.(template.source.packId) : null;
          return {
            id: template.id,
            name: template.name,
            description: template.description,
            chaseType: template.settings?.chaseType ?? "pursuit",
            chaseTypeLabel: i18n(`PF2E_CHASE_FORGE.ChaseType.${template.settings?.chaseType ?? "pursuit"}`, template.settings?.chaseType ?? "pursuit"),
            length: template.settings?.length ?? "medium",
            lengthLabel: i18n(`PF2E_CHASE_FORGE.Length.${template.settings?.length ?? "medium"}`, template.settings?.length ?? "medium"),
            routeComplexity: template.settings?.routeComplexity ?? "linear",
            sourceLabel: packLabel(pack, template.source?.moduleId ?? i18n("PF2E_CHASE_FORGE.Generator.UnknownSource", "Unbekannte Quelle")),
            sourcePackId: template.source?.packId ?? template.source?.moduleId ?? "templates",
            selected: template.id === this._generatorTemplateId
          };
        })
        .sort((a, b) => String(a.sourceLabel).localeCompare(String(b.sourceLabel)) || String(a.name).localeCompare(String(b.name)));
      const generatorTemplateGroupMap = new Map();
      for (const template of generatorTemplateViews) {
        if (!generatorTemplateGroupMap.has(template.sourcePackId)) generatorTemplateGroupMap.set(template.sourcePackId, { id: template.sourcePackId, label: template.sourceLabel, templates: [] });
        generatorTemplateGroupMap.get(template.sourcePackId).templates.push(template);
      }
      const generatorTemplateGroups = [...generatorTemplateGroupMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
      const registeredCardViews = registeredCards.map(card => {
        const pack = card.source?.packId ? this.chaseApi.packs?.get?.(card.source.packId) : null;
        const source = packLabel(pack, card.source?.moduleId ?? "");
        const category = card.metadata?.i18n?.category
          ? i18n(card.metadata.i18n.category, card.metadata?.category ?? "")
          : (card.metadata?.category ?? "");
        const categoryId = card.metadata?.category ?? card.metadata?.i18n?.category ?? "general";
        return {
          id: card.id,
          name: card.name,
          type: card.type,
          source,
          category,
          categoryId,
          sourcePackId: card.source?.packId ?? card.source?.moduleId ?? "cards"
        };
      }).sort((a, b) => String(a.source).localeCompare(String(b.source)) || String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));

      const registeredCardSourceMap = new Map();
      for (const card of registeredCardViews) {
        if (!registeredCardSourceMap.has(card.sourcePackId)) registeredCardSourceMap.set(card.sourcePackId, card.source || card.sourcePackId);
      }
      const registeredCardSourceOptions = [...registeredCardSourceMap.entries()]
        .map(([value, label]) => ({ value, label, selected: value === this._registeredCardSourceFilter }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));
      if (this._registeredCardSourceFilter && !registeredCardSourceMap.has(this._registeredCardSourceFilter)) this._registeredCardSourceFilter = "";

      const sourceFilteredRegisteredCards = this._registeredCardSourceFilter
        ? registeredCardViews.filter(card => card.sourcePackId === this._registeredCardSourceFilter)
        : registeredCardViews;
      const registeredCardCategoryMap = new Map();
      for (const card of sourceFilteredRegisteredCards) {
        const label = card.category || i18n("PF2E_CHASE_FORGE.Builder.RegisteredCardsGeneral", "Allgemein");
        if (!registeredCardCategoryMap.has(card.categoryId)) registeredCardCategoryMap.set(card.categoryId, label);
      }
      if (this._registeredCardCategoryFilter && !registeredCardCategoryMap.has(this._registeredCardCategoryFilter)) this._registeredCardCategoryFilter = "";
      const registeredCardCategoryOptions = [...registeredCardCategoryMap.entries()]
        .map(([value, label]) => ({ value, label, selected: value === this._registeredCardCategoryFilter }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));

      const filteredRegisteredCardViews = this._registeredCardCategoryFilter
        ? sourceFilteredRegisteredCards.filter(card => card.categoryId === this._registeredCardCategoryFilter)
        : sourceFilteredRegisteredCards;
      const registeredCardGroupMap = new Map();
      for (const card of filteredRegisteredCardViews) {
        const groupId = `${card.sourcePackId}:${card.categoryId || "general"}`;
        if (!registeredCardGroupMap.has(groupId)) {
          registeredCardGroupMap.set(groupId, {
            id: groupId,
            label: card.category ? `${card.source} · ${card.category}` : card.source,
            cards: []
          });
        }
        registeredCardGroupMap.get(groupId).cards.push(card);
      }
      const registeredCardGroups = [...registeredCardGroupMap.values()];
      const generationMeta = this._draft.metadata?.generator ?? null;
      const validation = librarySelected
        ? validateLibraryBlueprintPreview(this._draft, this.chaseApi, libraryPreview)
        : (linearEditable
          ? validateBasicBuilderBlueprint(this._draft)
          : (branchingEditable ? validateBranchingBuilderBlueprint(this._draft) : this.chaseApi.validation.blueprint(this._draft)));
      const builderMeta = this._draft.metadata?.builder ?? {};
      const persisted = !librarySelected && blueprints.some(item => item.id === this._draft.id);
      this._persisted = persisted;
      const sessions = await this.chaseApi.persistence.sessions.list();
      const openableSessions = sessions
        .filter(session => ["draft", "active", "paused"].includes(session.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map(session => ({
          id: session.id,
          status: session.status,
          round: session.round,
          name: session.blueprintSnapshot?.name ?? session.id,
          statusLabel: i18n(`PF2E_CHASE_FORGE.SessionStatus.${session.status}`, session.status)
        }));
      const weatherForgeStatus = this.chaseApi.integrations?.weatherForge?.inspect?.() ?? { available: false, compatible: false };
      const weatherFromWeatherForge = this._draft.settings?.weather?.source?.moduleId === "pf2e-weather-forge";
      const librarySummaries = libraryBlueprints
        .map(blueprint => {
          const summary = basicBuilderSummary(blueprint);
          const pack = blueprint.source?.packId ? this.chaseApi.packs?.get?.(blueprint.source.packId) : null;
          return {
            ...summary,
            cardCount: blueprint.graph?.nodes?.filter?.(node => node.type === "card")?.length ?? summary.cardCount,
            chaseTypeLabel: i18n(`PF2E_CHASE_FORGE.ChaseType.${blueprint.settings?.chaseType ?? "pursuit"}`, blueprint.settings?.chaseType ?? "pursuit"),
            sourceLabel: pack?.label ?? blueprint.source?.moduleId ?? i18n("PF2E_CHASE_FORGE.Builder.LibraryUnknownSource", "Unbekannte Quelle"),
            sourceModule: blueprint.source?.moduleId ?? "",
            sourcePackId: blueprint.source?.packId ?? "",
            sourceVersion: pack?.version ?? blueprint.source?.version ?? null,
            active: blueprint.id === this._libraryBlueprintId,
            readOnly: true
          };
        })
        .sort((a, b) => String(a.sourceLabel).localeCompare(String(b.sourceLabel)) || String(a.name).localeCompare(String(b.name)));
      const libraryGroupMap = new Map();
      for (const blueprint of librarySummaries) {
        const groupId = blueprint.sourcePackId || blueprint.sourceModule || "library";
        if (!libraryGroupMap.has(groupId)) {
          libraryGroupMap.set(groupId, {
            id: groupId,
            label: blueprint.sourceLabel,
            moduleId: blueprint.sourceModule,
            version: blueprint.sourceVersion,
            chases: []
          });
        }
        libraryGroupMap.get(groupId).chases.push(blueprint);
      }
      for (const group of libraryGroupMap.values()) {
        if (this._initializedLibraryGroupDefaults.has(group.id)) continue;
        if (group.moduleId && group.moduleId !== MODULE_ID) this._collapsedLibraryGroups.add(group.id);
        this._initializedLibraryGroupDefaults.add(group.id);
      }
      const libraryGroups = [...libraryGroupMap.values()]
        .map(group => {
          const collapsed = this._collapsedLibraryGroups.has(group.id);
          return { ...group, count: group.chases.length, collapsed, expanded: !collapsed };
        })
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));

      const branchSourceNodeIds = new Set(branchGroups.map(group => group.sourceNodeId).filter(Boolean));
      const cardViews = cards.map(item => {
        const consequenceViews = cardConsequenceViews(item.card);
        const criticalFailureConsequences = consequenceViews.filter(entry => entry.degree === "criticalFailure");
        return {
        ...item,
        displayIndex: item.index + 1,
        typeLabel: i18n(`PF2E_CHASE_FORGE.CardType.${item.card?.type ?? "obstacle"}`, item.card?.type ?? "obstacle"),
        editable: routeEditable,
        linearEditable,
        canDelete: routeEditable && (linearEditable || !branchSourceNodeIds.has(item.node?.id)),
        deleteProtected: routeEditable && !linearEditable && branchSourceNodeIds.has(item.node?.id),
        card: item.card ? {
          ...item.card,
          tagsText: item.card.tags.join(", "),
          typeOptions: optionList(CARD_TYPE_VALUES, item.card.type, "PF2E_CHASE_FORGE.CardType"),
          imageModeOptions: optionList(IMAGE_MODE_VALUES, item.card.image?.mode ?? "none", "PF2E_CHASE_FORGE.ImageMode"),
          imagePreviewPath: resolvedCardImages.get(item.ref)?.path ?? item.card.image?.path ?? null,
          imagePreviewAlt: resolvedCardImages.get(item.ref)?.alt || item.card.image?.alt || item.card.name || "",
          imageResolved: resolvedCardImages.get(item.ref) ?? null,
          imageProviderOptions: imageProviderOptions.map(option => ({ ...option, selected: option.value === (item.card.image?.providerId ?? "") })),
          pointScalingLabel: item.card.metadata?.chasePointScaling?.mode === "groupMinus2"
            ? i18n("PF2E_CHASE_FORGE.Builder.PointScalingGroupMinus2", "Automatisch: Gruppengröße − 2")
            : (item.card.metadata?.chasePointScaling?.mode === "groupMinus1"
              ? i18n("PF2E_CHASE_FORGE.Builder.PointScalingGroupMinus1", "Automatisch: Gruppengröße − 1")
              : null),
          pointScalingOptions: [
            { value: "fixed", label: i18n("PF2E_CHASE_FORGE.Builder.PointScalingFixed", "Fester Wert"), selected: !["groupMinus1", "groupMinus2"].includes(item.card.metadata?.chasePointScaling?.mode) },
            { value: "groupMinus1", label: i18n("PF2E_CHASE_FORGE.Builder.PointScalingModeGroupMinus1", "Gruppengröße − 1"), selected: item.card.metadata?.chasePointScaling?.mode === "groupMinus1" },
            { value: "groupMinus2", label: i18n("PF2E_CHASE_FORGE.Builder.PointScalingModeGroupMinus2", "Gruppengröße − 2"), selected: item.card.metadata?.chasePointScaling?.mode === "groupMinus2" }
          ],
          pointScalingAutomatic: ["groupMinus1", "groupMinus2"].includes(item.card.metadata?.chasePointScaling?.mode),
          approaches: (item.card.approaches ?? []).map((approach, approachIndex) => ({
            ...approach,
            label: localizeApproachLabel(approach),
            approachIndex,
            cardRef: item.ref,
            cardIndex: item.index,
            statisticOptions: ROLL_STATISTICS.map(value => ({ value, selected: value === approach.statistic, label: statisticLabel(value) })),
            minimumProficiencyOptions: MINIMUM_PROFICIENCY_VALUES.map(value => ({ value, selected: value === (approach.minimumProficiency ?? ""), label: value ? i18n(`PF2E_CHASE_FORGE.Proficiency.${value}`, value) : i18n("PF2E_CHASE_FORGE.Builder.MinimumProficiencyNone", "Keine") })),
            dcModeOptions: optionList(DC_MODE_VALUES, approach.dc?.mode ?? "gm", "PF2E_CHASE_FORGE.DcMode"),
            proficiencyOptions: optionList(PROFICIENCY_VALUES, approach.dc?.proficiency ?? "trained", "PF2E_CHASE_FORGE.Proficiency"),
            adjustmentOptions: DIFFICULTY_ADJUSTMENTS.map(value => ({ value, selected: Number(approach.dc?.difficultyAdjustment ?? 0) === value, label: value > 0 ? `+${value}` : String(value) }))
          }))
        } : null,
        first: item.index === 0,
        last: item.index === cards.length - 1,
        canAddBranch: item.canAddBranch === true,
        originLabel: item.record?.metadata?.originCardRef ?? "",
        hasConsequences: consequenceViews.length > 0,
        consequenceCount: consequenceViews.length,
        hasCriticalFailureConsequences: criticalFailureConsequences.length > 0,
        criticalFailureConsequenceCount: criticalFailureConsequences.length,
        consequenceBadgeTitle: criticalFailureConsequences.length > 0
          ? format("PF2E_CHASE_FORGE.Builder.CardCriticalFailureConsequences", { count: criticalFailureConsequences.length }, `${criticalFailureConsequences.length} Konsequenz(en) bei kritischem Fehlschlag`)
          : format("PF2E_CHASE_FORGE.Builder.CardConsequences", { count: consequenceViews.length }, `${consequenceViews.length} Konsequenz(en)`)
      };
      });
      const branchViews = branchGroups.map(group => ({
        ...group,
        editable: routeEditable,
        routes: group.routes.map(route => ({
          ...route,
          editable: routeEditable,
          visibilityLabel: i18n(`PF2E_CHASE_FORGE.RouteVisibility.${route.visibility}`, route.visibility),
          visibilityIcon: route.visibility === "hidden" ? "fa-eye-slash" : (route.visibility === "discoverable" ? "fa-eye-low-vision" : "fa-eye"),
          visibilityOptions: optionList(["public", "discoverable", "hidden"], route.visibility, "PF2E_CHASE_FORGE.RouteVisibility")
        }))
      }));

      const selectionIsValid = this._selectedInspector?.type === "card"
        ? cardViews.some(item => item.ref === this._selectedInspector.id)
        : (this._selectedInspector?.type === "branch"
          ? branchViews.some(group => group.branchGroupId === this._selectedInspector.id)
          : false);
      if (!selectionIsValid) this._selectedInspector = cardViews[0]?.ref ? { type: "card", id: cardViews[0].ref } : null;
      const routeDiagram = buildRouteDiagramModel(cardViews, branchViews, { selected: this._selectedInspector, editable: routeEditable });
      const selectedCard = this._selectedInspector?.type === "card"
        ? cardViews.find(item => item.ref === this._selectedInspector.id) ?? null
        : null;
      const selectedBranch = this._selectedInspector?.type === "branch"
        ? branchViews.find(group => group.branchGroupId === this._selectedInspector.id) ?? null
        : null;
      if (selectedCard?.card) {
        const effectForgeReport = this.chaseApi.integrations?.effectForge?.inspect?.() ?? { available: false, compatible: false, capabilities: {} };
        selectedCard.card.effectForgeEditorAvailable = effectForgeReport.compatible === true && effectForgeReport.capabilities?.editor === true;
        selectedCard.card.consequences = cardConsequenceViews(selectedCard.card);
        selectedCard.card.hasConsequences = selectedCard.card.consequences.length > 0;
        selectedCard.card.consequenceDegreeOptions = DEGREE_VALUES.map(value => ({ value, label: degreeLabel(value), selected: value === "criticalFailure" }));
        try {
          const candidateResult = await this.chaseApi.images?.candidatesFor?.(selectedCard.card.image ?? {}, {
            blueprint: this._draft,
            card: selectedCard.card
          }) ?? { candidates: [], errors: [] };
          selectedCard.card.imageCandidates = (candidateResult.candidates ?? []).slice(0, 12).map((candidate, index) => ({
            ...candidate,
            label: imageCandidateLabel(candidate, index),
            selected: Boolean((selectedCard.card.image?.imageId && candidate.id === selectedCard.card.image.imageId) || (selectedCard.card.image?.path && candidate.path === selectedCard.card.image.path))
          }));
          selectedCard.card.hasImageCandidates = selectedCard.card.imageCandidates.length > 0;
          selectedCard.card.imageCandidateErrors = candidateResult.errors ?? [];
          selectedCard.card.hasImageCandidateErrors = selectedCard.card.imageCandidateErrors.length > 0;
        } catch (error) {
          selectedCard.card.imageCandidates = [];
          selectedCard.card.hasImageCandidates = false;
          selectedCard.card.imageCandidateErrors = [{ message: error?.message ?? String(error) }];
          selectedCard.card.hasImageCandidateErrors = true;
        }
      }

      return {
        ...context,
        draft: cloneData(this._draft),
        editable,
        routeEditable,
        advancedRouteProtected,
        builderSupported,
        routeWorkspaceSupported,
        librarySelected,
        libraryBlueprintId: this._libraryBlueprintId,
        linearEditable,
        branchingEditable,
        persisted,
        cards: cardViews,
        branchGroups: branchViews,
        routeDiagram,
        selectedCard,
        selectedBranch,
        hasInspector: Boolean(selectedCard || selectedBranch),
        endings: (this._draft.graph?.endNodeIds ?? []).map(endId => {
          const node = this._draft.graph?.nodes?.find(candidate => candidate.id === endId) ?? null;
          return node ? {
            ...cloneData(node),
            imagePath: node.image?.path ?? null,
            imageAlt: node.image?.alt || node.label || this._draft.name || ""
          } : null;
        }).filter(Boolean),
        hasEndings: (this._draft.graph?.endNodeIds?.length ?? 0) > 0,
        hasBranchGroups: branchGroups.length > 0,
        groups: this._draft.groups.map(group => ({
          ...group,
          paceMode: group.metadata?.paceMode ?? "roll",
          obstaclesPerRound: Number.isFinite(Number(group.metadata?.obstaclesPerRound)) ? Number(group.metadata.obstaclesPerRound) : 1,
          roleOptions: optionList(GROUP_ROLE_VALUES, group.role, "PF2E_CHASE_FORGE.GroupRole"),
          paceOptions: optionList(GROUP_PACE_VALUES, group.metadata?.paceMode ?? "roll", "PF2E_CHASE_FORGE.GroupPace")
        })),
        blueprints: summaries,
        libraryBlueprints: librarySummaries,
        libraryGroups,
        hasLibraryBlueprints: librarySummaries.length > 0,
        openableSessions,
        hasOpenableSessions: openableSessions.length > 0,
        registeredCards: filteredRegisteredCardViews,
        registeredCardGroups,
        registeredCardSourceOptions,
        registeredCardCategoryOptions,
        registeredCardSourceFilter: this._registeredCardSourceFilter,
        registeredCardCategoryFilter: this._registeredCardCategoryFilter,
        registeredCardVisibleCount: filteredRegisteredCardViews.length,
        registeredCardTotalCount: registeredCardViews.length,
        hasRegisteredCards: registeredCards.length > 0,
        hasVisibleRegisteredCards: filteredRegisteredCardViews.length > 0,
        generatorTemplateGroups,
        hasGeneratorTemplates: generatorTemplateViews.length > 0,
        selectedGeneratorTemplateId: this._generatorTemplateId,
        generationMeta: generationMeta ? {
          ...cloneData(generationMeta),
          hasFallbacks: Number(generationMeta.fallbackCards ?? 0) > 0,
          templateName: generatorTemplateViews.find(template => template.id === generationMeta.templateId)?.name ?? generationMeta.templateId ?? "",
          generatedCardCount: Number(generationMeta.selectedRegisteredCards ?? 0) + Number(generationMeta.fallbackCards ?? 0)
        } : null,
        generated: Boolean(generationMeta),
        validation,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        chaseTypeOptions: optionList(CHASE_TYPE_VALUES, this._draft.settings.chaseType, "PF2E_CHASE_FORGE.ChaseType"),
        isAgainstClock: this._draft.settings.chaseType === "againstClock",
        lengthOptions: optionList(LENGTH_VALUES, this._draft.settings.length, "PF2E_CHASE_FORGE.Length"),
        difficultyOptions: optionList(DIFFICULTY_VALUES, this._draft.settings.difficulty, "PF2E_CHASE_FORGE.Difficulty"),
        imageModeOptions: optionList(IMAGE_MODE_VALUES, this._draft.settings.imageMode, "PF2E_CHASE_FORGE.ImageMode"),
        blueprintImagePreviewPath: blueprintResolvedImage?.path ?? this._draft.image?.path ?? null,
        blueprintImagePreviewAlt: blueprintResolvedImage?.alt || this._draft.image?.alt || this._draft.name || "",
        imageProviders,
        hasImageProviders: imageProviders.length > 0,
        timeOptions: TIME_VALUES.map(value => ({ value, selected: value === (this._draft.settings.timeOfDay ?? ""), label: value ? i18n(`PF2E_CHASE_FORGE.Time.${value}`, value) : i18n("PF2E_CHASE_FORGE.Common.NotSet", "Nicht festgelegt") })),
        roundUnitOptions: ROUND_UNIT_VALUES.map(value => ({ value, selected: value === (this._draft.settings.roundDuration?.unit ?? "rounds"), label: i18n(`PF2E_CHASE_FORGE.RoundUnit.${value}`, value) })),
        actionLevelOptions: optionList(TONE_LEVEL_VALUES, builderMeta.actionLevel ?? "medium", "PF2E_CHASE_FORGE.ToneLevel"),
        humorLevelOptions: optionList(TONE_LEVEL_VALUES, builderMeta.humorLevel ?? "low", "PF2E_CHASE_FORGE.ToneLevel"),
        environmentText: this._draft.settings.environmentTags.join(", "),
        movementText: this._draft.settings.movementModes.join(", "),
        toneText: this._draft.settings.toneTags.join(", "),
        tagsText: this._draft.tags.join(", "),
        weatherText: this._draft.settings.weather?.label ?? this._draft.settings.weather?.text ?? "",
        weatherForgeAvailable: weatherForgeStatus.compatible === true,
        weatherForgeVersion: weatherForgeStatus.version ?? null,
        weatherFromWeatherForge,
        weatherForgeSourceLabel: weatherFromWeatherForge ? i18n("PF2E_CHASE_FORGE.Builder.WeatherForgeSource", "Weather Forge") : "",
        cardCount: cards.length,
        participantCount: this._draft.groups.reduce((sum, group) => sum + group.participants.length, 0)
      };
    }

    _captureScrollPosition({ resetInspector = false } = {}) {
      const main = this.element?.querySelector?.(".chase-builder-main") ?? null;
      const sidebar = this.element?.querySelector?.(".chase-builder-sidebar") ?? null;
      const diagram = this.element?.querySelector?.(".chase-route-diagram") ?? null;
      const inspector = this.element?.querySelector?.(".chase-route-inspector") ?? null;
      this._pendingScrollPosition = {
        main: main ? Number(main.scrollTop ?? 0) : null,
        sidebar: sidebar ? Number(sidebar.scrollTop ?? 0) : null,
        diagram: diagram ? Number(diagram.scrollTop ?? 0) : null,
        inspector: resetInspector ? 0 : (inspector ? Number(inspector.scrollTop ?? 0) : null)
      };
      return this._pendingScrollPosition;
    }

    _restoreCapturedScrollPosition() {
      const pending = this._pendingScrollPosition;
      if (!pending) return;
      this._pendingScrollPosition = null;
      const restore = () => {
        const main = this.element?.querySelector?.(".chase-builder-main") ?? null;
        const sidebar = this.element?.querySelector?.(".chase-builder-sidebar") ?? null;
        const diagram = this.element?.querySelector?.(".chase-route-diagram") ?? null;
        const inspector = this.element?.querySelector?.(".chase-route-inspector") ?? null;
        if (main && Number.isFinite(pending.main)) main.scrollTop = pending.main;
        if (sidebar && Number.isFinite(pending.sidebar)) sidebar.scrollTop = pending.sidebar;
        if (diagram && Number.isFinite(pending.diagram)) diagram.scrollTop = pending.diagram;
        if (inspector && Number.isFinite(pending.inspector)) inspector.scrollTop = pending.inspector;
      };
      restore();
      globalThis.requestAnimationFrame?.(restore);
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const root = this.element;
      if (!root) return;

      // Apply the structural fix immediately, then re-apply after Foundry has had
      // a chance to perform any post-render ApplicationV2 layout work.
      applyBuilderRuntimeLayout(this, "render-immediate");
      this._bindRouteLayoutResize(root);
      this._restoreCapturedScrollPosition();
      globalThis.requestAnimationFrame?.(() => {
        applyBuilderRuntimeLayout(this, "render-raf");
        logBuilderLayoutDiagnostics(this, "render-raf");
      });
      globalThis.setTimeout?.(() => {
        applyBuilderRuntimeLayout(this, "render+100ms");
        logBuilderLayoutDiagnostics(this, "render+100ms");
      }, 100);
      globalThis.setTimeout?.(() => {
        applyBuilderRuntimeLayout(this, "render+500ms");
        logBuilderLayoutDiagnostics(this, "render+500ms");
      }, 500);

      this._synchronizeEditorControlState(root, context);
      this._bindPointScalingControls(root);
      this._bindRegisteredCardFilters(root);
      this._bindParticipantDropZones(root);
    }

    _bindRouteLayoutResize(root = this.element) {
      this._routeLayoutResizeObserver?.disconnect?.();
      this._routeLayoutResizeObserver = null;
      const main = root?.querySelector?.(".chase-builder-main") ?? null;
      if (!main || typeof globalThis.ResizeObserver !== "function") return;
      this._routeLayoutResizeObserver = new globalThis.ResizeObserver(() => {
        applyBuilderRuntimeLayout(this, "route-pane-resize");
      });
      this._routeLayoutResizeObserver.observe(main);
    }

    _bindRegisteredCardFilters(root = this.element) {
      const sourceFilter = root?.querySelector?.('[name="registeredCardSourceFilter"]') ?? null;
      const categoryFilter = root?.querySelector?.('[name="registeredCardCategoryFilter"]') ?? null;

      if (sourceFilter && sourceFilter.dataset.chaseFilterBound !== "true") {
        sourceFilter.dataset.chaseFilterBound = "true";
        sourceFilter.addEventListener?.("change", () => {
          this._registeredCardSourceFilter = sourceFilter.value ?? "";
          this._registeredCardCategoryFilter = "";
          this._captureScrollPosition();
          void this.render({ force: true });
        });
      }

      if (categoryFilter && categoryFilter.dataset.chaseFilterBound !== "true") {
        categoryFilter.dataset.chaseFilterBound = "true";
        categoryFilter.addEventListener?.("change", () => {
          this._registeredCardCategoryFilter = categoryFilter.value ?? "";
          this._captureScrollPosition();
          void this.render({ force: true });
        });
      }
    }

    _bindPointScalingControls(root = this.element) {
      for (const select of root?.querySelectorAll?.('[data-card-field="pointScalingMode"]') ?? []) {
        if (select.dataset.chaseScalingBound === "true") continue;
        select.dataset.chaseScalingBound = "true";
        const update = () => {
          const cardElement = select.closest?.('[data-builder-card]');
          const pointsInput = cardElement?.querySelector?.('[data-card-field="requiredPoints"]');
          if (!pointsInput) return;
          const automatic = ["groupMinus1", "groupMinus2"].includes(select.value);
          if (automatic) pointsInput.value = String(obstaclePointsForScalingMode(rollingGroupSizeForBlueprint(this._draft), select.value));
          pointsInput.readOnly = automatic;
          pointsInput.classList?.toggle?.("chase-readonly-derived", automatic);
        };
        select.addEventListener?.("change", update);
        update();
      }
    }

    _synchronizeEditorControlState(root = this.element, context = null) {
      if (!root) return false;
      const editor = root.querySelector?.(".chase-builder-editor-scroll");
      if (!editor) return false;

      // ApplicationV2 can preserve DOM nodes across forced renders. A control
      // which was disabled by a previous read-only/non-editable render can
      // therefore remain disabled even after the next render context is
      // editable again. This is particularly visible when the Runner refreshes
      // the already-open Builder after a Session is aborted/completed.
      // Re-assert the authoritative Builder state after every render instead of
      // relying on the template diff alone to clear DOM properties.
      const librarySelected = context?.librarySelected ?? Boolean(this._libraryBlueprintId);
      const editable = context?.editable ?? !librarySelected;
      const routeEditable = context?.routeEditable ?? (isBuilderEditableBlueprint(this._draft) && !librarySelected);
      const locked = librarySelected || !editable;

      editor.classList?.toggle?.("chase-builder-read-only", Boolean(librarySelected));
      for (const control of editor.querySelectorAll?.("input, textarea, select") ?? []) {
        control.disabled = locked;
      }
      if (!routeEditable) {
        for (const control of editor.querySelectorAll?.("[data-builder-card] input, [data-builder-card] textarea, [data-builder-card] select, [data-branch-edge] input, [data-branch-edge] textarea, [data-branch-edge] select") ?? []) {
          control.disabled = true;
        }
      }

      // These controls are disabled solely by global Builder editability in the
      // Handlebars template. Re-synchronize them as well while leaving
      // structurally disabled controls (move first/last card, protected branch
      // source deletion, etc.) untouched.
      const editabilityActions = [
        "duplicateBlueprint",
        "saveBlueprint",
        "applyWeatherForge",
        "resetGroups",
        "removeParticipant",
        "addSelectedTokens",
        "selectCardImageCandidate"
      ];
      for (const action of editabilityActions) {
        for (const control of root.querySelectorAll?.(`[data-action="${action}"]`) ?? []) {
          control.disabled = locked;
        }
      }
      return true;
    }

    _applyLibraryReadOnlyUi(root = this.element) {
      return this._synchronizeEditorControlState(root, {
        editable: !this._libraryBlueprintId,
        routeEditable: isBuilderEditableBlueprint(this._draft) && !this._libraryBlueprintId,
        librarySelected: Boolean(this._libraryBlueprintId)
      });
    }

    _bindParticipantDropZones(root = this.element) {
      if (!root?.addEventListener) return;

      // ApplicationV2 may re-render the part while keeping the outer application
      // element alive. Bind a capture-phase delegated handler to that stable root
      // and direct capture handlers to each freshly rendered drop zone. The latter
      // makes Actor/Token drops robust against Foundry handlers which consume the
      // bubbling phase before the Builder sees it.
      if (root !== this._dropBoundElement) {
        this._dropBoundElement = root;
        const dragover = event => {
          const zone = event.target?.closest?.("[data-participant-drop]");
          if (!zone || !root.contains(zone)) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          zone.classList?.add?.("chase-drop-active");
        };
        const drop = event => {
          const zone = event.target?.closest?.("[data-participant-drop]");
          if (!zone || !root.contains(zone)) return;
          event.preventDefault();
          event.stopPropagation();
          zone.classList?.remove?.("chase-drop-active");
          void this._handleDrop(event, zone);
        };
        root.addEventListener("dragenter", dragover, true);
        root.addEventListener("dragover", dragover, true);
        root.addEventListener("drop", drop, true);
        this._participantDropHandlers = { root, dragover, drop };
      }

      for (const zone of root.querySelectorAll?.("[data-participant-drop]") ?? []) {
        if (zone.dataset.chaseDropBound === "true") continue;
        zone.dataset.chaseDropBound = "true";
        const dragover = event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          zone.classList?.add?.("chase-drop-active");
        };
        const dragleave = event => {
          const next = event.relatedTarget;
          if (!next || !zone.contains?.(next)) zone.classList?.remove?.("chase-drop-active");
        };
        const drop = event => {
          event.preventDefault();
          event.stopPropagation();
          zone.classList?.remove?.("chase-drop-active");
          void this._handleDrop(event, zone);
        };
        zone.addEventListener("dragenter", dragover, true);
        zone.addEventListener("dragover", dragover, true);
        zone.addEventListener("dragleave", dragleave, true);
        zone.addEventListener("drop", drop, true);
      }
    }

    debugLayout(reason = "manual") {
      applyBuilderRuntimeLayout(this, `${reason}-apply`);
      return logBuilderLayoutDiagnostics(this, reason);
    }

    async close(options = {}) {
      this._routeLayoutResizeObserver?.disconnect?.();
      this._routeLayoutResizeObserver = null;
      const result = await super.close(options);
      if (openBuilderApp === this) openBuilderApp = null;
      return result;
    }

    _syncDraftFromForm() {
      if (this._libraryBlueprintId) return this._draft;
      if (!this.element) return this._draft;
      const root = this.element;
      const builderSupported = isBuilderEditableBlueprint(this._draft);
      const linearDraft = isBasicLinearBlueprint(this._draft);
      const branchingDraft = isBranchingBuilderBlueprint(this._draft);
      const value = name => root.querySelector(`[name="${name}"]`)?.value;
      const checked = name => root.querySelector(`[name="${name}"]`)?.checked === true;
      const next = cloneData(this._draft);

      next.name = value("blueprint.name")?.trim() || next.name;
      next.description = value("blueprint.description") ?? "";
      next.gmNotes = value("blueprint.gmNotes") ?? "";
      next.settings.chaseType = value("settings.chaseType") || next.settings.chaseType;
      next.settings.length = value("settings.length") || next.settings.length;
      next.settings.difficulty = value("settings.difficulty") || next.settings.difficulty;
      next.settings.partyLevel = numberOrNull(value("settings.partyLevel"));
      next.settings.startDistance = Math.max(0, Math.trunc(Number(value("settings.startDistance")) || 0));
      next.settings.roundDuration = {
        value: Math.max(0, Number(value("settings.roundDuration.value")) || 0),
        unit: value("settings.roundDuration.unit") || "rounds"
      };
      next.settings.victory ??= {};
      const roundLimit = numberOrNull(value("settings.victory.roundLimit"));
      next.settings.victory.roundLimit = roundLimit === null ? null : Math.max(1, Math.trunc(roundLimit));
      next.settings.environmentTags = csv(value("settings.environmentTags"));
      next.settings.movementModes = csv(value("settings.movementModes"));
      next.settings.toneTags = csv(value("settings.toneTags"));
      next.settings.timeOfDay = value("settings.timeOfDay") || null;
      const weather = value("settings.weather")?.trim() ?? "";
      const existingWeather = this._draft.settings.weather ?? null;
      const existingWeatherLabel = existingWeather?.label ?? existingWeather?.text ?? "";
      next.settings.weather = weather
        ? (existingWeather && weather === existingWeatherLabel ? cloneData(existingWeather) : { label: weather })
        : null;
      next.settings.imageMode = value("settings.imageMode") || "none";
      next.image.mode = next.settings.imageMode;
      next.image.path = value("image.path")?.trim() || null;
      next.image.alt = value("image.alt") ?? "";
      next.tags = csv(value("blueprint.tags"));
      next.metadata ??= {};
      next.metadata.builder ??= {};
      if (builderSupported) {
        next.metadata.builder.mode = branchingDraft ? "branching" : "basic";
        next.metadata.builder.contractVersion = 1;
      }
      next.metadata.builder.actionLevel = value("metadata.actionLevel") || next.metadata.builder.actionLevel || "medium";
      next.metadata.builder.humorLevel = value("metadata.humorLevel") || next.metadata.builder.humorLevel || "low";

      for (const groupElement of root.querySelectorAll("[data-builder-group]")) {
        const groupId = groupElement.dataset.groupId;
        const group = next.groups.find(candidate => candidate.id === groupId);
        if (!group) continue;
        group.name = groupElement.querySelector('[data-group-field="name"]')?.value?.trim() || group.name;
        group.role = groupElement.querySelector('[data-group-field="role"]')?.value || group.role;
        group.public = groupElement.querySelector('[data-group-field="public"]')?.checked !== false;
        group.metadata ??= {};
        group.metadata.paceMode = groupElement.querySelector('[data-group-field="paceMode"]')?.value || group.metadata.paceMode || "roll";
        group.metadata.obstaclesPerRound = Math.max(0, Number(groupElement.querySelector('[data-group-field="obstaclesPerRound"]')?.value ?? group.metadata.obstaclesPerRound ?? 1) || 0);
      }

      for (const endElement of root.querySelectorAll("[data-end-node]")) {
        const nodeId = endElement.dataset.nodeId ?? null;
        const node = next.graph?.nodes?.find(candidate => candidate.id === nodeId);
        if (!node || node.type !== "end") continue;
        node.label = endElement.querySelector('[data-end-field="label"]')?.value?.trim() || node.label || "Ziel";
        node.description = endElement.querySelector('[data-end-field="description"]')?.value ?? "";
        node.image ??= {};
        node.image.path = endElement.querySelector('[data-end-field="imagePath"]')?.value?.trim() || null;
        node.image.alt = endElement.querySelector('[data-end-field="imageAlt"]')?.value ?? "";
        node.image.mode = node.image.path ? "manual" : "none";
        if (!node.image.path) { node.image.providerId = null; node.image.imageId = null; }
      }

      const records = next.contentSnapshots?.cards ?? [];
      for (const cardElement of root.querySelectorAll("[data-builder-card]")) {
        const cardRef = cardElement.dataset.cardRef ?? null;
        const index = Number(cardElement.dataset.cardIndex);
        const record = cardRef ? records.find(candidate => candidate.ref === cardRef) : records[index];
        if (!record?.data) continue;
        const card = record.data;
        card.name = cardElement.querySelector('[data-card-field="name"]')?.value?.trim() || card.name;
        card.type = cardElement.querySelector('[data-card-field="type"]')?.value || card.type;
        card.description = cardElement.querySelector('[data-card-field="description"]')?.value ?? "";
        card.gmNotes = cardElement.querySelector('[data-card-field="gmNotes"]')?.value ?? "";
        card.tags = csv(cardElement.querySelector('[data-card-field="tags"]')?.value);
        const pointsInput = cardElement.querySelector('[data-card-field="requiredPoints"]');
        const enteredRequiredPoints = Math.max(1, Math.trunc(Number(pointsInput?.value) || 1));
        const requestedScalingMode = cardElement.querySelector('[data-card-field="pointScalingMode"]')?.value ?? "fixed";
        const pointScalingMode = ["groupMinus1", "groupMinus2"].includes(requestedScalingMode) ? requestedScalingMode : null;
        card.obstacle.scalable = Boolean(pointScalingMode);
        card.metadata ??= {};
        if (pointScalingMode) {
          card.metadata.chasePointScaling = { mode: pointScalingMode };
          card.obstacle.requiredPoints = obstaclePointsForScalingMode(rollingGroupSizeForBlueprint(next), pointScalingMode);
        } else {
          card.obstacle.requiredPoints = enteredRequiredPoints;
          if (card.metadata.chasePointScaling) delete card.metadata.chasePointScaling;
        }
        card.image.mode = cardElement.querySelector('[data-card-field="imageMode"]')?.value || "none";
        card.image.path = cardElement.querySelector('[data-card-field="imagePath"]')?.value?.trim() || null;
        card.image.alt = cardElement.querySelector('[data-card-field="imageAlt"]')?.value ?? "";
        card.image.providerId = cardElement.querySelector('[data-card-field="imageProviderId"]')?.value?.trim() || null;
        if (card.image.mode === "none") {
          card.image.path = null;
          card.image.providerId = null;
          card.image.imageId = null;
        }

        const approachRows = cardElement.querySelectorAll("[data-builder-approach]");
        for (const row of approachRows) {
          const approachIndex = Number(row.dataset.approachIndex);
          const approach = card.approaches?.[approachIndex];
          if (!approach) continue;
          approach.label = row.querySelector('[data-approach-field="label"]')?.value?.trim() || approach.label;
          approach.statistic = row.querySelector('[data-approach-field="statistic"]')?.value || null;
          approach.minimumProficiency = row.querySelector('[data-approach-field="minimumProficiency"]')?.value || null;
          approach.dc.mode = row.querySelector('[data-approach-field="dcMode"]')?.value || "gm";
          approach.dc.value = numberOrNull(row.querySelector('[data-approach-field="dcValue"]')?.value);
          approach.dc.levelOffset = Number(row.querySelector('[data-approach-field="levelOffset"]')?.value ?? 0) || 0;
          approach.dc.difficultyAdjustment = Number(row.querySelector('[data-approach-field="difficultyAdjustment"]')?.value ?? 0) || 0;
          approach.dc.proficiency = row.querySelector('[data-approach-field="proficiency"]')?.value || null;
          approach.dc.hidden = row.querySelector('[data-approach-field="hidden"]')?.checked !== false;
        }
      }

      for (const node of next.graph?.nodes ?? []) {
        if (node.type !== "card" || !node.cardRef) continue;
        const record = records.find(candidate => candidate.ref === node.cardRef);
        if (!record?.data) continue;
        node.label = record.data.name;
        node.description = record.data.description ?? "";
      }

      for (const edgeElement of root.querySelectorAll("[data-branch-edge]")) {
        const edge = next.graph?.edges?.find(candidate => candidate.id === edgeElement.dataset.edgeId);
        if (!edge) continue;
        edge.label = edgeElement.querySelector('[data-branch-field="label"]')?.value?.trim() || edge.label;
        edge.description = edgeElement.querySelector('[data-branch-field="description"]')?.value ?? edge.description ?? "";
        const visibility = edgeElement.querySelector('[data-branch-field="visibility"]')?.value;
        if (["public", "discoverable", "hidden"].includes(visibility)) edge.visibility = visibility;
      }

      const normalized = this.chaseApi.factories.blueprint(next);
      if (branchingDraft) this._draft = normalized;
      else if (linearDraft) this._draft = rebuildBasicLinearGraph(normalized);
      else this._draft = normalized;
      return this._draft;
    }

    async _save({ silent = false } = {}) {
      if (this._libraryBlueprintId) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.LibraryReadOnly", "Bibliotheksjagden sind schreibgeschützt. Übernimm sie zuerst als eigene Verfolgungsjagd."));
        return null;
      }
      this._syncDraftFromForm();
      const linearEditable = isBasicLinearBlueprint(this._draft);
      const branchingEditable = isBranchingBuilderBlueprint(this._draft);
      const validation = linearEditable
        ? validateBasicBuilderBlueprint(this._draft)
        : (branchingEditable ? validateBranchingBuilderBlueprint(this._draft) : this.chaseApi.validation.blueprint(this._draft));
      this._lastValidation = validation;
      if (!validation.valid) {
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.InvalidBlueprint", "Der Blueprint enthält noch Fehler."));
        await this.render({ force: true });
        return null;
      }
      const existing = await this.chaseApi.persistence.blueprints.get(this._draft.id);
      const saved = existing
        ? await this.chaseApi.persistence.blueprints.save(this._draft)
        : await this.chaseApi.persistence.blueprints.create(this._draft);
      this._draft = saved;
      this._persisted = true;
      if (!silent) notify("info", i18n("PF2E_CHASE_FORGE.Builder.Saved", "Verfolgungsjagd gespeichert."));
      await this.render({ force: true });
      return saved;
    }

    async _confirmDelete() {
      if (DialogV2?.confirm) {
        return DialogV2.confirm({
          window: { title: i18n("PF2E_CHASE_FORGE.Builder.DeleteTitle", "Verfolgungsjagd löschen") },
          content: `<p>${escapeHtml(i18n("PF2E_CHASE_FORGE.Builder.DeleteConfirm", "Diese vorbereitete Verfolgungsjagd wirklich löschen?"))}</p>`,
          modal: true
        });
      }
      return globalThis.confirm?.(i18n("PF2E_CHASE_FORGE.Builder.DeleteConfirm", "Diese vorbereitete Verfolgungsjagd wirklich löschen?")) ?? false;
    }

    async _confirmCardRemoval(cardRef) {
      const card = listEditableCards(this._draft).find(item => item.ref === cardRef);
      const name = card?.card?.name ?? card?.node?.label ?? i18n("PF2E_CHASE_FORGE.Builder.Card", "Karte");
      const message = format(
        "PF2E_CHASE_FORGE.Builder.RemoveCardConfirm",
        { name },
        `Die Karte „${name}“ wirklich aus der Verfolgungsjagd löschen?`
      );
      if (DialogV2?.confirm) {
        return DialogV2.confirm({
          window: { title: i18n("PF2E_CHASE_FORGE.Builder.RemoveCardTitle", "Karte löschen") },
          content: `<p>${escapeHtml(message)}</p>`,
          modal: true
        });
      }
      return globalThis.confirm?.(message) ?? false;
    }

    async _confirmBranchRemoval() {
      const message = i18n(
        "PF2E_CHASE_FORGE.Builder.RemoveBranchConfirm",
        "Diese Gabelung wirklich löschen? Alle Karten innerhalb ihrer Zweige werden ebenfalls entfernt."
      );
      if (DialogV2?.confirm) {
        return DialogV2.confirm({
          window: { title: i18n("PF2E_CHASE_FORGE.Builder.RemoveBranchTitle", "Gabelung löschen") },
          content: `<p>${escapeHtml(message)}</p>`,
          modal: true
        });
      }
      return globalThis.confirm?.(message) ?? false;
    }

    async _handleDrop(event, explicitZone = null) {
      if (this._libraryBlueprintId) return;
      const zone = explicitZone ?? event.target?.closest?.("[data-participant-drop]");
      if (!zone || !isBuilderEditableBlueprint(this._draft)) return;
      event.preventDefault();
      const data = readParticipantDragData(event);
      const uuid = resolveParticipantDropUuid(data);
      if (!uuid || typeof globalThis.fromUuid !== "function") {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.DropUnsupported", "Bitte einen Actor oder Token aus Foundry hierher ziehen."));
        return;
      }
      try {
        const document = await globalThis.fromUuid(uuid);
        const actor = document?.actor ?? (document?.documentName === "Actor" ? document : null);
        if (!actor && !["Token", "TokenDocument"].includes(document?.documentName)) throw new Error("Unsupported document");
        const participant = participantFromDocument(document, { ownerUserIds: resolveOwnerUserIds(actor) });
        this._syncDraftFromForm();
        this._captureScrollPosition();
        this._draft = addParticipantToBasicBlueprint(this._draft, zone.dataset.groupId, participant);
        await this.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to add chase participant from drop.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.DropFailed", "Der Beteiligte konnte nicht hinzugefügt werden."));
      }
    }

    async _journalTarget() {
      if (this._libraryBlueprintId) {
        const blueprint = this.chaseApi.library?.get?.(this._libraryBlueprintId, { includeDisabled: false });
        return blueprint ? { kind: "library", id: blueprint.id, label: blueprint.name } : null;
      }
      const saved = await this._save({ silent: true });
      return saved ? { kind: "blueprint", id: saved.id, label: saved.name } : null;
    }

    static async _actionNewBlueprint() {
      await this._resetDraftWithEnvironmentPrefill();
      return this.render({ force: true });
    }

    static async _actionLoadBlueprint(_event, target) {
      const id = target.dataset.blueprintId;
      if (id) await this.loadBlueprint(id);
    }

    static async _actionLoadLibraryBlueprint(_event, target) {
      const id = target.dataset.libraryBlueprintId;
      if (id) await this.loadLibraryBlueprint(id);
    }

    static async _actionToggleLibraryGroup(_event, target) {
      const id = String(target?.dataset?.libraryGroupId ?? "").trim();
      if (!id) return;
      this._captureScrollPosition();
      if (this._collapsedLibraryGroups.has(id)) this._collapsedLibraryGroups.delete(id);
      else this._collapsedLibraryGroups.add(id);
      await this.render({ force: true });
    }

    static async _actionCopyLibraryBlueprint() {
      if (!this._libraryBlueprintId) return null;
      const copy = this._worldCopyFromLibrary();
      if (!copy) return null;
      let saved = await this.chaseApi.persistence.blueprints.create(copy, { snapshotContent: true });
      const localizedCopy = materializeLibraryCopyLocalization(saved, this.chaseApi);
      if (JSON.stringify(localizedCopy) !== JSON.stringify(saved)) {
        saved = await this.chaseApi.persistence.blueprints.save(localizedCopy);
      }

      // Library packs may use the public choice/merge graph shape instead of
      // Chase Forge's internal managed-branch metadata. Once the referenced
      // cards have been frozen into the world copy, adopt conventional
      // choice -> route(s) -> merge graphs so the copied Chase becomes fully
      // editable. More exotic graphs remain route-protected, but the copied
      // document and its participant groups are still editable.
      const adopted = adoptCompatibleExtendedGraph(saved);
      if (isBuilderEditableBlueprint(adopted) && !isBuilderEditableBlueprint(saved)) {
        saved = await this.chaseApi.persistence.blueprints.save(adopted);
      }

      this._draft = saved;
      this._persisted = true;
      this._libraryBlueprintId = null;
      this._selectedInspector = null;
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.LibraryCopied", "Bibliotheksjagd als eigene Verfolgungsjagd übernommen."));
      return this.render({ force: true });
    }

    static async _actionSaveBlueprint() { return this._save(); }

    /** Export the actual editor draft, including unsaved form edits, without mutating the world record. */
    static async _actionExportBlueprintJson() {
      try {
        if (!this._libraryBlueprintId) this._syncDraftFromForm();
        const json = await this.chaseApi.persistence.blueprints.exportJson(this._draft, { snapshotCards: true });
        const envelope = JSON.parse(json);
        downloadChaseJson(json, safeChaseFilename(this._draft.name));
        if (envelope.missingCardRefs?.length) {
          notify("warn", format("PF2E_CHASE_FORGE.Transfer.MissingCards", { count: envelope.missingCardRefs.length }, `${envelope.missingCardRefs.length} Karten konnten nicht eingebettet werden. Das Ziel benötigt möglicherweise die ursprünglichen Add-ons.`));
        }
        notify("info", format("PF2E_CHASE_FORGE.Transfer.Exported", { count: envelope.media?.references?.length ?? 0 }, `JSON exportiert. ${envelope.media?.references?.length ?? 0} Medienpfade referenziert; Mediendateien werden nicht mitgeliefert.`));
        return envelope;
      } catch (error) {
        console.error(`${MODULE_ID} | JSON export failed.`, error);
        notify("error", `${i18n("PF2E_CHASE_FORGE.Transfer.ExportFailed", "JSON-Export fehlgeschlagen")}: ${error.message}`);
        return null;
      }
    }

    async _chooseImportMediaPaths(filename, references) {
      if (!DialogV2?.wait) {
        const ok = await DialogV2?.confirm?.({
          window: { title: i18n("PF2E_CHASE_FORGE.Transfer.Import", "JSON importieren") },
          content: `<p>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.MediaNotice", "Bild-, Audio- und Videodateien sind nicht im JSON enthalten. Relative Pfade beziehen sich auf den Foundry-Datenordner."))}</p>`,
          modal: true
        });
        return ok ? {} : null;
      }
      const examples = references.slice(0, 6).map(entry => `<li><code>${escapeHtml(entry.path)}</code></li>`).join("");
      const countLabel = format("PF2E_CHASE_FORGE.Transfer.ReferenceCount", { count: references.length }, `${references.length} Medienreferenzen`);
      const content = `<div class="chase-transfer-dialog">
        <p><strong>${escapeHtml(filename)}</strong> · ${escapeHtml(countLabel)}</p>
        <p>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.MediaNotice", "Bild-, Audio- und Videodateien sind nicht im JSON enthalten. Relative Pfade beziehen sich auf den Foundry-Datenordner."))}</p>
        ${examples ? `<ul class="chase-transfer-media-list">${examples}</ul>` : ""}
        <p>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.PathMappingHint", "Optional: Nur lokale Medienpfade mit genau diesem Quellpräfix werden auf das Zielpräfix geändert. Leer lassen, um alle Pfade unverändert zu übernehmen."))}</p>
        <p>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.WorldReferencesNotice", "Akteur-/Token-Verknüpfungen können in einer anderen Spielwelt ungültig sein und müssen dann neu zugewiesen werden. Die importierte Chase wird als neue eigene Chase angelegt."))}</p>
        <label>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.SourcePrefix", "Quellpfad (z. B. worlds/alt/assets)"))}
          <input type="text" name="chaseTransferFrom" autocomplete="off" placeholder="worlds/old-world/assets" />
        </label>
        <label>${escapeHtml(i18n("PF2E_CHASE_FORGE.Transfer.DestinationPrefix", "Zielpfad (z. B. worlds/neu/assets)"))}
          <input type="text" name="chaseTransferTo" autocomplete="off" placeholder="worlds/new-world/assets" />
        </label>
      </div>`;
      const choice = await DialogV2.wait({
        window: { title: i18n("PF2E_CHASE_FORGE.Transfer.Import", "JSON importieren") }, content, modal: true,
        buttons: [
          { action: "import", label: i18n("PF2E_CHASE_FORGE.Transfer.Import", "JSON importieren"), default: true,
            callback: (_event, button, dialog) => {
              const root = dialog?.element ?? button?.closest?.(".window-content") ?? null;
              return { fromPrefix: root?.querySelector?.('[name="chaseTransferFrom"]')?.value ?? "",
                toPrefix: root?.querySelector?.('[name="chaseTransferTo"]')?.value ?? "" };
            } },
          { action: "cancel", label: i18n("PF2E_CHASE_FORGE.Common.Cancel", "Abbrechen") }
        ]
      }).catch(() => null);
      if (!choice || choice === "cancel") return null;
      return typeof choice === "object" ? choice : {};
    }

    static async _actionImportBlueprintJson() {
      if (!isGm() || !globalThis.document?.createElement) return null;
      // Native picker is compatible with Foundry's browser environment and never uploads the JSON elsewhere.
      const input = globalThis.document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      const onChange = async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error(i18n("PF2E_CHASE_FORGE.Transfer.FileTooLarge", "JSON-Datei ist größer als 10 MB."));
          const json = await file.text();
          // Validate the envelope before opening the mapping dialogue; persistence validates again before storage.
          const parsed = JSON.parse(json);
          const raw = parsed?.format ? parsed.blueprint : parsed;
          if (!raw || !raw.graph || !Array.isArray(raw.graph.nodes)) throw new Error(i18n("PF2E_CHASE_FORGE.Transfer.NotBlueprint", "Die Datei enthält keine Chase."));
          const mediaPaths = await this._chooseImportMediaPaths(file.name, listBlueprintMedia(raw));
          if (mediaPaths === null) return;
          const imported = await this.chaseApi.persistence.blueprints.importJson(json, { idPolicy: "new", mediaPaths });
          await this.loadBlueprint(imported.id);
          notify("info", format("PF2E_CHASE_FORGE.Transfer.Imported", { name: imported.name }, `Chase importiert: ${imported.name}`));
          return imported;
        } catch (error) {
          console.error(`${MODULE_ID} | JSON import failed.`, error);
          notify("error", `${i18n("PF2E_CHASE_FORGE.Transfer.ImportFailed", "JSON-Import fehlgeschlagen")}: ${error.message}`);
          return null;
        }
      };
      input.addEventListener("change", onChange, { once: true });
      globalThis.document.body?.appendChild(input);
      input.click();
      return input;
    }

    static async _actionCopyJournalLink() {
      const target = await this._journalTarget();
      if (!target) return null;
      try {
        const result = await this.chaseApi.journal?.copyReference?.(target.kind, target.id, target.label);
        if (!result) return null;
        notify(result.copied ? "info" : "warn", result.copied
          ? i18n("PF2E_CHASE_FORGE.Journal.LinkCopied", "Journal-Link in die Zwischenablage kopiert.")
          : i18n("PF2E_CHASE_FORGE.Journal.ClipboardUnavailable", "Zwischenablage nicht verfügbar. Der Journal-Link wurde in der Konsole ausgegeben."));
        if (!result.copied) console.info(`${MODULE_ID} | Chase Journal link: ${result.reference}`);
        return result;
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to copy Chase Journal link.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Journal.CopyFailed", "Der Journal-Link konnte nicht kopiert werden."));
        return null;
      }
    }

    static async _actionCreateJournalEntry() {
      const target = await this._journalTarget();
      if (!target) return null;
      try {
        const entry = await this.chaseApi.journal?.createEntry?.(target.kind, target.id);
        if (entry) notify("info", i18n("PF2E_CHASE_FORGE.Journal.EntryCreated", "Journal-Eintrag für die Verfolgungsjagd erstellt."));
        return entry ?? null;
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to create Chase Journal entry.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Journal.EntryFailed", "Der Journal-Eintrag konnte nicht erstellt werden."));
        return null;
      }
    }

    static async _actionDuplicateBlueprint() {
      const saved = await this._save({ silent: true });
      if (!saved) return;
      const copy = await this.chaseApi.persistence.blueprints.duplicate(saved.id, {
        name: format("PF2E_CHASE_FORGE.Builder.CopyName", { name: saved.name }, `${saved.name} Kopie`)
      });
      this._draft = copy;
      this._persisted = true;
      this._selectedInspector = null;
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.Duplicated", "Kopie erstellt."));
      return this.render({ force: true });
    }

    static async _actionDeleteBlueprint() {
      if (this._libraryBlueprintId) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.LibraryReadOnly", "Bibliotheksjagden sind schreibgeschützt."));
        return;
      }
      if (!this._persisted) {
        await this._resetDraftWithEnvironmentPrefill();
        return this.render({ force: true });
      }
      if (!await this._confirmDelete()) return;
      await this.chaseApi.persistence.blueprints.delete(this._draft.id);
      await this._resetDraftWithEnvironmentPrefill();
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.Deleted", "Verfolgungsjagd gelöscht."));
      return this.render({ force: true });
    }

    static async _actionStartBlueprint() {
      if (this._libraryBlueprintId) {
        const saved = this.chaseApi.library?.get?.(this._libraryBlueprintId, { includeDisabled: false });
        const validation = saved ? validateLibraryBlueprintPreview(saved, this.chaseApi) : { valid: false };
        if (!saved || !validation.valid) {
          notify("error", i18n("PF2E_CHASE_FORGE.Builder.CannotStart", "Die Verfolgungsjagd kann noch nicht gestartet werden."));
          return;
        }
        const draftSession = await this.chaseApi.sessionManager.createSession(saved, {
          metadata: {
            libraryOrigin: {
              blueprintId: saved.id,
              source: cloneData(saved.source ?? null),
              startedDirectly: true
            }
          }
        });
        const session = await this.chaseApi.sessionManager.startSession(draftSession.id);
        notify("info", format("PF2E_CHASE_FORGE.Builder.SessionStarted", { id: session.id }, `Session ${session.id} gestartet.`));
        await this.chaseApi.presentation?.chat?.postEvent?.({
          title: format("PF2E_CHASE_FORGE.Runner.ChatStarted", { name: saved.name }, `Verfolgungsjagd gestartet: ${saved.name}`)
        }, { flags: { sessionId: session.id } }).catch(() => null);
        await this.chaseApi.ui?.openRunner?.({ sessionId: session.id });
        return this.render({ force: true });
      }
      const linearEditable = isBasicLinearBlueprint(this._draft);
      const branchingEditable = isBranchingBuilderBlueprint(this._draft);
      let saved = await this._save({ silent: true });
      if (!saved) return;
      const validation = linearEditable
        ? validateBasicBuilderBlueprint(saved, { forStart: true })
        : (branchingEditable
          ? validateBranchingBuilderBlueprint(saved, { forStart: true })
          : this.chaseApi.validation.blueprint(saved));
      if (!validation.valid) {
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.CannotStart", "Die Verfolgungsjagd kann noch nicht gestartet werden."));
        return this.render({ force: true });
      }
      const draftSession = await this.chaseApi.sessionManager.createSession(saved.id);
      const session = await this.chaseApi.sessionManager.startSession(draftSession.id);
      notify("info", format("PF2E_CHASE_FORGE.Builder.SessionStarted", { id: session.id }, `Session ${session.id} gestartet.`));
      await this.chaseApi.presentation?.chat?.postEvent?.({
        title: format("PF2E_CHASE_FORGE.Runner.ChatStarted", { name: saved.name }, `Verfolgungsjagd gestartet: ${saved.name}`)
      }, { flags: { sessionId: session.id } }).catch(() => null);
      await this.render({ force: true });
      return this.chaseApi.ui?.openRunner?.({ sessionId: session.id });
    }

    static async _actionRefreshBuilder() { return this.render({ force: true }); }

    async _confirmGenerateRoute() {
      const cardCount = isBuilderEditableBlueprint(this._draft) ? listEditableCards(this._draft).length : 0;
      if (cardCount === 0) return true;
      const message = i18n("PF2E_CHASE_FORGE.Generator.ReplaceRouteConfirm", "Die vorhandene Route wird durch die neu generierte Route ersetzt. Fortfahren?");
      if (DialogV2?.confirm) {
        return DialogV2.confirm({
          window: { title: i18n("PF2E_CHASE_FORGE.Generator.ReplaceRouteTitle", "Route neu generieren") },
          content: `<p>${escapeHtml(message)}</p>`,
          modal: true
        });
      }
      return globalThis.confirm?.(message) ?? false;
    }

    _generatorOptionsFromDraft() {
      const draft = this._draft;
      return {
        sourceBlueprint: draft,
        name: draft.name,
        description: draft.description,
        gmNotes: draft.gmNotes,
        partyLevel: draft.settings?.partyLevel,
        environmentTags: draft.settings?.environmentTags?.length ? draft.settings.environmentTags : undefined,
        toneTags: draft.settings?.toneTags?.length ? draft.settings.toneTags : undefined,
        movementModes: draft.settings?.movementModes?.length ? draft.settings.movementModes : undefined,
        timeOfDay: draft.settings?.timeOfDay ?? undefined,
        weather: draft.settings?.weather ?? undefined,
        tags: draft.tags,
        image: draft.image,
        actionLevel: draft.metadata?.builder?.actionLevel,
        humorLevel: draft.metadata?.builder?.humorLevel
      };
    }

    _notifyGeneration(report = {}) {
      const registered = Number(report.selectedRegisteredCards ?? 0);
      const fallback = Number(report.fallbackCards ?? 0);
      const branches = Number(report.branchCount ?? 0);
      notify(fallback > 0 ? "warn" : "info", format(
        fallback > 0 ? "PF2E_CHASE_FORGE.Generator.GeneratedWithFallbacks" : "PF2E_CHASE_FORGE.Generator.Generated",
        { cards: registered, fallbacks: fallback, branches },
        fallback > 0
          ? `Route generiert: ${registered} Bibliothekskarten, ${fallback} Platzhalter, ${branches} Gabelungen.`
          : `Route generiert: ${registered} Bibliothekskarten, ${branches} Gabelungen.`
      ));
    }

    static async _actionGenerateFromTemplate() {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const select = this.element?.querySelector?.('[name="generatorTemplate"]');
      const templateId = select?.value || this._generatorTemplateId;
      if (!templateId) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Generator.NoTemplate", "Es ist keine Generatorvorlage verfügbar."));
        return null;
      }
      if (!await this._confirmGenerateRoute()) return null;
      try {
        this._generatorTemplateId = templateId;
        const result = this.chaseApi.generator.generate(templateId, this._generatorOptionsFromDraft());
        this._draft = result.blueprint;
        this._selectedInspector = listEditableCards(this._draft)[0]?.ref ? { type: "card", id: listEditableCards(this._draft)[0].ref } : null;
        this._lastValidation = null;
        this._notifyGeneration(result.report);
        return this.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Chase generation failed.`, error);
        notify("error", format("PF2E_CHASE_FORGE.Generator.Failed", { message: error?.message ?? String(error) }, `Generierung fehlgeschlagen: ${error?.message ?? error}`));
        return null;
      }
    }

    static async _actionRerollGeneratedRoute() {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const templateId = this._draft.metadata?.generator?.templateId ?? this._generatorTemplateId;
      if (!templateId) return this._actionGenerateFromTemplate();
      if (!await this._confirmGenerateRoute()) return null;
      try {
        this._generatorTemplateId = templateId;
        const result = this.chaseApi.generator.reroll(this._draft, this._generatorOptionsFromDraft());
        this._draft = result.blueprint;
        const first = listEditableCards(this._draft)[0];
        this._selectedInspector = first?.ref ? { type: "card", id: first.ref } : null;
        this._lastValidation = null;
        this._notifyGeneration(result.report);
        return this.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Chase regeneration failed.`, error);
        notify("error", format("PF2E_CHASE_FORGE.Generator.Failed", { message: error?.message ?? String(error) }, `Generierung fehlgeschlagen: ${error?.message ?? error}`));
        return null;
      }
    }

    _updateSelectedCardImage(updater) {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return false;
      const cardRef = this._selectedInspector.id;
      this._draft = updateBuilderCardByRef(this._draft, cardRef, card => ({
        ...card,
        image: typeof updater === "function" ? updater(cloneData(card.image ?? {}), card) : cloneData(updater ?? card.image ?? {})
      }));
      this.chaseApi.images?.clearCache?.();
      return true;
    }

    _selectedCardConsequenceLocation(target) {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return null;
      const degree = target?.dataset?.degree;
      if (!DEGREE_VALUES.includes(degree)) return null;
      const scope = target?.dataset?.scope ?? "card";
      const approachIndex = scope === "approach" ? Number(target?.dataset?.approachIndex) : null;
      const consequenceIndex = Number(target?.dataset?.consequenceIndex);
      return { cardRef: this._selectedInspector.id, degree, scope, approachIndex, consequenceIndex };
    }

    _updateConsequenceAt(location, updater) {
      if (!location || !Number.isInteger(location.consequenceIndex) || location.consequenceIndex < 0) return false;
      this._draft = updateBuilderCardByRef(this._draft, location.cardRef, card => {
        const next = cloneData(card);
        const owner = location.scope === "approach" ? next.approaches?.[location.approachIndex] : next;
        if (!owner) return next;
        owner.outcomes ??= { criticalSuccess: [], success: [], failure: [], criticalFailure: [] };
        owner.outcomes[location.degree] ??= [];
        const list = owner.outcomes[location.degree];
        const current = list[location.consequenceIndex];
        if (!current) return next;
        const updated = updater(cloneData(current));
        if (updated === null) list.splice(location.consequenceIndex, 1);
        else list[location.consequenceIndex] = updated;
        return next;
      });
      return true;
    }

    _appendConsequence(location, consequence) {
      if (!location?.cardRef || !DEGREE_VALUES.includes(location.degree)) return null;
      let index = null;
      this._draft = updateBuilderCardByRef(this._draft, location.cardRef, card => {
        const next = cloneData(card);
        const owner = location.scope === "approach" ? next.approaches?.[location.approachIndex] : next;
        if (!owner) return next;
        owner.outcomes ??= { criticalSuccess: [], success: [], failure: [], criticalFailure: [] };
        owner.outcomes[location.degree] ??= [];
        index = owner.outcomes[location.degree].length;
        owner.outcomes[location.degree].push(cloneData(consequence));
        return next;
      });
      return Number.isInteger(index) ? index : null;
    }

    _effectEditorDefinitionCandidate(value) {
      if (!value || typeof value !== "object") return null;
      if (value.definition?.schemaVersion) return value.definition;
      if (value.value?.definition?.schemaVersion) return value.value.definition;
      if (value.schemaVersion) return value;
      return null;
    }

    async _openEffectEditorForConsequence(location, consequence, { insertOnSave = false } = {}) {
      const bridge = this.chaseApi.integrations?.effectForge;
      const report = bridge?.inspect?.() ?? { compatible: false, capabilities: {} };
      if (!report.compatible || !report.capabilities?.editor) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.EffectForgeEditorUnavailable", "Der Effect-Forge-Editor ist nicht verfügbar."));
        return false;
      }
      let saved = false;
      let activeLocation = { ...location };
      const commit = rawDefinition => {
        const definition = this._effectEditorDefinitionCandidate(rawDefinition) ?? rawDefinition;
        if (!definition || typeof definition !== "object" || !definition.schemaVersion) return false;
        const nextConsequence = {
          ...cloneData(consequence),
          label: definition.name || consequence.label,
          payload: { ...(consequence.payload ?? {}), source: "embedded", definition: cloneData(definition) }
        };
        if (insertOnSave && (!Number.isInteger(activeLocation.consequenceIndex) || activeLocation.consequenceIndex < 0)) {
          const index = this._appendConsequence(activeLocation, nextConsequence);
          if (!Number.isInteger(index)) return false;
          activeLocation = { ...activeLocation, consequenceIndex: index };
        } else {
          const updated = this._updateConsequenceAt(activeLocation, () => nextConsequence);
          if (!updated) return false;
        }
        this._lastValidation = null;
        saved = true;
        return true;
      };
      const onSave = value => {
        if (!commit(value)) return;
        this._captureScrollPosition();
        void this.render({ force: true });
      };
      const result = await bridge.openEditor(
        { source: "embedded", definition: consequence.payload?.definition },
        { onSave }
      );
      const candidate = this._effectEditorDefinitionCandidate(result);
      if (!saved && candidate && commit(candidate)) {
        this._captureScrollPosition();
        await this.render({ force: true });
      }
      return saved || result != null;
    }

    static async _actionAddEffectConsequence(_event, target) {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return null;
      this._syncDraftFromForm();
      const controls = target.closest?.(".chase-builder-consequence-add");
      const degree = controls?.querySelector?.("[data-new-effect-degree]")?.value ?? "criticalFailure";
      if (!DEGREE_VALUES.includes(degree)) return null;
      const report = this.chaseApi.integrations?.effectForge?.inspect?.() ?? {};
      const consequence = blankEffectConsequence(report.schemaVersion ?? 2);
      const location = { cardRef: this._selectedInspector.id, degree, scope: "card", approachIndex: null, consequenceIndex: null };
      return this._openEffectEditorForConsequence(location, consequence, { insertOnSave: true });
    }

    static async _actionEditEffectConsequence(_event, target) {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const location = this._selectedCardConsequenceLocation(target);
      if (!location) return null;
      const card = listEditableCards(this._draft).find(item => item.ref === location.cardRef)?.card ?? null;
      const owner = location.scope === "approach" ? card?.approaches?.[location.approachIndex] : card;
      const consequence = owner?.outcomes?.[location.degree]?.[location.consequenceIndex] ?? null;
      if (!consequence || consequence.kind !== "effectForge") return null;
      return this._openEffectEditorForConsequence(location, consequence);
    }

    static async _actionRemoveEffectConsequence(_event, target) {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const location = this._selectedCardConsequenceLocation(target);
      if (!location) return null;
      this._updateConsequenceAt(location, () => null);
      this._lastValidation = null;
      return this.render({ force: true });
    }

    static async _actionBrowseBlueprintImage() {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const current = this._draft.image?.path ?? "";
      const field = this.element?.querySelector?.('input[name="image.path"]') ?? null;
      const opened = await openFoundryImagePicker({
        current,
        field,
        callback: async path => {
          if (!path) return;
          this._draft.image.mode = "manual";
          this._draft.settings.imageMode = "manual";
          this._draft.image.path = String(path);
          this._draft.image.imageId = null;
          this._draft.image.providerId = null;
          this.chaseApi.images?.clearCache?.();
          await this.render({ force: true });
        }
      });
      if (!opened) notify("warn", i18n("PF2E_CHASE_FORGE.Visual.FilePickerUnavailable", "Die Foundry-Dateiauswahl ist nicht verfügbar."));
      return opened;
    }

    static async _actionBrowseEndingImage(_event, target) {
      if (this._libraryBlueprintId) return null;
      this._syncDraftFromForm();
      const nodeId = target?.dataset?.nodeId ?? null;
      const node = this._draft.graph?.nodes?.find(candidate => candidate.id === nodeId && candidate.type === "end") ?? null;
      if (!node) return null;
      const field = this.element?.querySelector?.(`[data-end-node][data-node-id="${nodeId}"] [data-end-field="imagePath"]`) ?? null;
      const opened = await openFoundryImagePicker({
        current: node.image?.path ?? "",
        field,
        callback: async path => {
          if (!path) return;
          node.image ??= {};
          node.image.mode = "manual";
          node.image.path = String(path);
          node.image.imageId = null;
          node.image.providerId = null;
          this.chaseApi.images?.clearCache?.();
          await this.render({ force: true });
        }
      });
      if (!opened) notify("warn", i18n("PF2E_CHASE_FORGE.Visual.FilePickerUnavailable", "Die Foundry-Dateiauswahl ist nicht verfügbar."));
      return opened;
    }

    static async _actionBrowseCardImage() {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return null;
      this._syncDraftFromForm();
      const item = listEditableCards(this._draft).find(candidate => candidate.ref === this._selectedInspector.id);
      const current = item?.card?.image?.path ?? "";
      const field = this.element?.querySelector?.('[data-card-field="imagePath"]') ?? null;
      const opened = await openFoundryImagePicker({
        current,
        field,
        callback: async path => {
          if (!path) return;
          this._updateSelectedCardImage(image => ({
            ...image,
            mode: "manual",
            path: String(path),
            providerId: null,
            imageId: null
          }));
          await this.render({ force: true });
        }
      });
      if (!opened) notify("warn", i18n("PF2E_CHASE_FORGE.Visual.FilePickerUnavailable", "Die Foundry-Dateiauswahl ist nicht verfügbar."));
      return opened;
    }

    static async _actionRefreshCardImages() {
      if (this._selectedInspector?.type !== "card") return null;
      this._syncDraftFromForm();
      this.chaseApi.images?.clearCache?.();
      return this.render({ force: true });
    }

    static async _actionSelectCardImageCandidate(event, target) {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return null;
      this._syncDraftFromForm();
      const cardRef = this._selectedInspector.id;
      const item = listEditableCards(this._draft).find(candidate => candidate.ref === cardRef);
      if (!item?.card) return null;
      const imageId = target?.dataset?.imageId ?? null;
      const providerId = target?.dataset?.providerId || null;
      const result = await this.chaseApi.images?.candidatesFor?.(item.card.image ?? {}, { blueprint: this._draft, card: item.card }) ?? { candidates: [] };
      const candidate = (result.candidates ?? []).find(entry => entry.id === imageId && (!providerId || entry.providerId === providerId))
        ?? (result.candidates ?? []).find(entry => entry.id === imageId)
        ?? null;
      if (!candidate) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Visual.CandidateUnavailable", "Dieses Bild ist nicht mehr verfügbar."));
        return this.render({ force: true });
      }
      const originalMode = item.card.image?.mode ?? "automatic";
      const pinnedMode = candidate.providerId ? "provider" : (originalMode === "manual" ? "predefined" : originalMode);
      this._updateSelectedCardImage(image => this.chaseApi.images.applyCandidate(image, candidate, { mode: pinnedMode }));
      return this.render({ force: true });
    }

    static async _actionClearCardImageSelection() {
      if (this._libraryBlueprintId || this._selectedInspector?.type !== "card") return null;
      this._syncDraftFromForm();
      this._updateSelectedCardImage(image => ({ ...image, path: null, imageId: null }));
      return this.render({ force: true });
    }

    static async _actionAddManualCard() {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const result = isBranchingBuilderBlueprint(this._draft)
        ? appendMainlineManualCard(this._draft)
        : addManualCardToBasicBlueprint(this._draft);
      this._draft = result.blueprint;
      this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
      return this.render({ force: true });
    }

    _selectedRegisteredCardForInsertion({ scalingIndex = null } = {}) {
      const select = this.element?.querySelector?.('[name="registeredCard"]');
      const cardId = select?.value;
      if (!cardId) return null;
      const rawCard = this.chaseApi.cards.get(cardId, { includeDisabled: false });
      if (!rawCard) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.CardUnavailable", "Diese Karte ist nicht mehr verfügbar."));
        return null;
      }
      let card = localizeChaseCard(rawCard);
      if (card.obstacle?.scalable !== false) {
        const index = Number.isInteger(Number(scalingIndex))
          ? Math.max(0, Math.trunc(Number(scalingIndex)))
          : listEditableCards(this._draft).length;
        card = stampRecommendedPointScaling(card, {
          groupSize: rollingGroupSizeForBlueprint(this._draft),
          mode: obstaclePointScalingModeForIndex(index)
        });
      }
      return { rawCard, card };
    }

    static async _actionAddRegisteredCard() {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const selected = this._selectedRegisteredCardForInsertion();
      if (!selected) return;
      const { rawCard, card } = selected;
      const result = isBranchingBuilderBlueprint(this._draft)
        ? appendMainlineCard(this._draft, card, { originCardRef: rawCard.id })
        : addCardToBasicBlueprint(this._draft, card, { originCardRef: rawCard.id });
      this._draft = result.blueprint;
      this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
      return this.render({ force: true });
    }

    async _insertRegisteredCardRelative(target, position) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const cardRef = target?.dataset?.cardRef ?? this._selectedInspector?.id ?? null;
      if (!cardRef) return null;
      const cards = listEditableCards(this._draft);
      const selectedCard = cards.find(item => item.ref === cardRef);
      if (!selectedCard) return null;
      const scalingIndex = selectedCard.index + (position === "after" ? 1 : 0);
      const selected = this._selectedRegisteredCardForInsertion({ scalingIndex });
      if (!selected) return null;
      const { rawCard, card } = selected;
      try {
        const result = isBranchingBuilderBlueprint(this._draft)
          ? insertCardRelativeToBuilderCard(this._draft, cardRef, card, { position, originCardRef: rawCard.id })
          : addCardToBasicBlueprint(this._draft, card, {
              index: scalingIndex,
              originCardRef: rawCard.id
            });
        this._draft = result.blueprint;
        this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
        return this.render({ force: true });
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to insert registered Chase card ${position}.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.InsertRegisteredCardFailed", "Die registrierte Karte konnte an dieser Stelle nicht eingefügt werden."));
        return null;
      }
    }

    static async _actionInsertRegisteredCardBefore(_event, target) {
      return this._insertRegisteredCardRelative(target, "before");
    }

    static async _actionInsertRegisteredCardAfter(_event, target) {
      return this._insertRegisteredCardRelative(target, "after");
    }

    async _insertManualCardRelative(target, position) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const cardRef = target?.dataset?.cardRef ?? this._selectedInspector?.id ?? null;
      if (!cardRef) return null;
      const cards = listEditableCards(this._draft);
      const selected = cards.find(item => item.ref === cardRef);
      if (!selected) return null;
      try {
        const result = isBranchingBuilderBlueprint(this._draft)
          ? insertManualCardRelativeToBuilderCard(this._draft, cardRef, { position })
          : addManualCardToBasicBlueprint(this._draft, { index: selected.index + (position === "after" ? 1 : 0) });
        this._draft = result.blueprint;
        this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
        return this.render({ force: true });
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to insert Chase card ${position}.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.InsertCardFailed", "Das Hindernis konnte an dieser Stelle nicht eingefügt werden."));
        return null;
      }
    }

    static async _actionInsertManualCardBefore(_event, target) {
      return this._insertManualCardRelative(target, "before");
    }

    static async _actionInsertManualCardAfter(_event, target) {
      return this._insertManualCardRelative(target, "after");
    }

    static async _actionMoveCardUp(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const index = Number(target.dataset.cardIndex);
      this._draft = moveCardInBasicBlueprint(this._draft, index, index - 1);
      return this.render({ force: true });
    }

    static async _actionMoveCardDown(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const index = Number(target.dataset.cardIndex);
      this._draft = moveCardInBasicBlueprint(this._draft, index, index + 1);
      return this.render({ force: true });
    }

    static async _actionRemoveCard(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const cardRef = target.dataset.cardRef ?? null;
      if (!cardRef && !Number.isInteger(Number(target.dataset.cardIndex))) return null;
      if (!await this._confirmCardRemoval(cardRef)) return null;
      try {
        this._draft = isBranchingBuilderBlueprint(this._draft)
          ? removeBuilderCardByRef(this._draft, cardRef)
          : removeCardFromBasicBlueprint(this._draft, Number(target.dataset.cardIndex));
      } catch (error) {
        if (error?.code === "BRANCH_SOURCE_CARD") {
          notify("warn", i18n("PF2E_CHASE_FORGE.Builder.RemoveBranchSourceFirst", "Diese Karte erzeugt eine Gabelung. Entferne zuerst die Gabelung, bevor du die Karte löschst."));
          return null;
        }
        console.error(`${MODULE_ID} | Failed to remove Chase card.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.RemoveCardFailed", "Die Karte konnte nicht entfernt werden."));
        return null;
      }
      if (cardRef && this._selectedInspector?.type === "card" && this._selectedInspector.id === cardRef) this._selectedInspector = null;
      return this.render({ force: true });
    }

    static async _actionAddApproach(_event, target) {
      this._syncDraftFromForm();
      const ref = target.dataset.cardRef;
      this._draft = ref
        ? addApproachToBuilderCard(this._draft, ref)
        : addApproachToBasicCard(this._draft, Number(target.dataset.cardIndex));
      return this.render({ force: true });
    }

    static async _actionRemoveApproach(_event, target) {
      this._syncDraftFromForm();
      const ref = target.dataset.cardRef;
      this._draft = ref
        ? removeApproachFromBuilderCard(this._draft, ref, Number(target.dataset.approachIndex))
        : removeApproachFromBasicCard(this._draft, Number(target.dataset.cardIndex), Number(target.dataset.approachIndex));
      return this.render({ force: true });
    }

    static async _actionAddBranchAfterCard(_event, target) {
      this._syncDraftFromForm();
      const nodeId = target.dataset.nodeId;
      if (!nodeId) return;
      try {
        const before = new Set(listBranchGroups(this._draft).map(group => group.branchGroupId));
        this._draft = addBranchAfterCard(this._draft, nodeId);
        const created = listBranchGroups(this._draft).find(group => !before.has(group.branchGroupId));
        if (created) this._selectedInspector = { type: "branch", id: created.branchGroupId };
        notify("info", i18n("PF2E_CHASE_FORGE.Builder.BranchAdded", "Weggabelung hinzugefügt."));
        return this.render({ force: true });
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to add Chase branch.`, error);
        notify("error", error?.message ?? String(error));
      }
    }

    static async _actionAppendBranchCard(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      try {
        this._draft = appendCardToBranchRoute(this._draft, target.dataset.edgeId);
        return this.render({ force: true });
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to extend Chase branch route.`, error);
        notify("error", error?.message ?? String(error));
      }
    }

    static async _actionRemoveBranchGroup(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const branchGroupId = target.dataset.branchGroupId;
      if (!branchGroupId) return;
      if (!await this._confirmBranchRemoval()) return null;
      const group = listBranchGroups(this._draft).find(candidate => candidate.branchGroupId === branchGroupId);
      const sourceRef = group?.sourceNodeId ? this._draft.graph?.nodes?.find(node => node.id === group.sourceNodeId)?.cardRef ?? null : null;
      this._draft = removeBranchGroup(this._draft, branchGroupId);
      this._selectedInspector = sourceRef ? { type: "card", id: sourceRef } : null;
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.BranchRemoved", "Weggabelung entfernt."));
      return this.render({ force: true });
    }

    static async _actionSelectRouteCard(_event, target) {
      this._syncDraftFromForm();
      const cardRef = target.dataset.cardRef;
      if (!cardRef) return;
      this._selectedInspector = { type: "card", id: cardRef };
      this._captureScrollPosition({ resetInspector: true });
      return this.render({ force: true });
    }

    static async _actionSelectBranchGroup(_event, target) {
      this._syncDraftFromForm();
      const branchGroupId = target.dataset.branchGroupId;
      if (!branchGroupId) return;
      this._selectedInspector = { type: "branch", id: branchGroupId };
      this._captureScrollPosition({ resetInspector: true });
      return this.render({ force: true });
    }

    static async _actionAddSelectedTokens(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      const groupId = target.dataset.groupId;
      const controlled = globalThis.canvas?.tokens?.controlled ?? [];
      if (controlled.length === 0) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.NoSelectedTokens", "Es sind keine Tokens ausgewählt."));
        return;
      }
      for (const token of controlled) {
        const document = token.document ?? token;
        const actor = token.actor ?? document.actor ?? null;
        const participant = participantFromDocument(document, { ownerUserIds: resolveOwnerUserIds(actor) });
        this._draft = addParticipantToBasicBlueprint(this._draft, groupId, participant);
      }
      return this.render({ force: true });
    }

    static async _actionRemoveParticipant(_event, target) {
      this._syncDraftFromForm();
      this._captureScrollPosition();
      this._draft = removeParticipantFromBasicBlueprint(this._draft, target.dataset.groupId, target.dataset.participantId);
      return this.render({ force: true });
    }

    static async _actionResetGroups() {
      this._syncDraftFromForm();
      const type = this._draft.settings.chaseType;
      this._draft = replaceBasicGroupsForChaseType(this._draft, type, { preserveParticipants: true });
      return this.render({ force: true });
    }

    static async _actionApplyWeatherForge() {
      this._syncDraftFromForm();
      await this._applyWeatherForgePrefill({ onlyUnset: false, notifyUser: true });
      return this.render({ force: true });
    }

    static async _actionOpenSessionRunner(_event, target) {
      const sessionId = target.dataset.sessionId;
      if (!sessionId) return null;
      return this.chaseApi.ui?.openRunner?.({ sessionId });
    }
  };

  return builderAppClass;
}

/** Foundry's download helper is preferred; the Blob fallback supports browser builds without it. */
export function downloadChaseJson(json, filename) {
  if (typeof globalThis.saveDataToFile === "function") {
    return globalThis.saveDataToFile(json, "application/json", filename);
  }
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  globalThis.document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    globalThis.setTimeout?.(() => globalThis.URL.revokeObjectURL(url), 1000);
  }
}

export function createChaseBuilderUiService({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  return Object.freeze({
    async openBuilder({ blueprintId = null, libraryBlueprintId = null, newChase = false } = {}) {
      if (!isGm()) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.GmOnly", "Die Chase Forge Verwaltung ist nur für die Spielleitung verfügbar."));
        return null;
      }
      const chaseApi = getApi();
      if (!chaseApi?.persistence?.blueprints) throw new Error("Chase Forge persistence API is unavailable.");
      let created = false;
      if (!openBuilderApp) {
        const App = getAppClass();
        openBuilderApp = new App(chaseApi);
        created = true;
      }
      if (newChase) {
        await openBuilderApp._resetDraftWithEnvironmentPrefill();
        await openBuilderApp.render({ force: true });
      } else if (libraryBlueprintId) {
        await openBuilderApp.loadLibraryBlueprint(libraryBlueprintId);
      } else if (blueprintId) {
        await openBuilderApp.loadBlueprint(blueprintId);
      } else {
        if (created) await openBuilderApp._applyWeatherForgePrefill({ onlyUnset: true, notifyUser: false });
        await openBuilderApp.render({ force: true });
      }
      return openBuilderApp;
    },
    getOpenBuilder() { return openBuilderApp ?? null; },
    debugLayout({ reason = "api-manual" } = {}) {
      if (!openBuilderApp) {
        console.warn(`${MODULE_ID} | Builder layout diagnostics requested, but no builder is open.`);
        return null;
      }
      return openBuilderApp.debugLayout(reason);
    },
    async closeBuilder() {
      if (!openBuilderApp) return false;
      await openBuilderApp.close();
      openBuilderApp = null;
      return true;
    }
  });
}

function addToolToControl(control, tool) {
  if (!control) return false;
  if (Array.isArray(control.tools)) {
    if (!control.tools.some(existing => existing.name === tool.name)) {
      control.tools.push({ ...tool, order: Number.isInteger(tool.order) ? tool.order : control.tools.length });
    }
    return true;
  }
  if (control.tools && typeof control.tools === "object") {
    const existing = Object.values(control.tools);
    control.tools[tool.name] = {
      ...tool,
      order: Number.isInteger(tool.order) ? tool.order : existing.length
    };
    return true;
  }
  return false;
}

export function registerChaseBuilderSceneControls(uiService) {
  if (!globalThis.Hooks?.on) return;
  Hooks.on("getSceneControlButtons", controls => {
    if (!isGm()) return;
    const tool = {
      name: "chase-forge-builder",
      title: i18n("PF2E_CHASE_FORGE.Builder.SceneTool", "Chase Forge"),
      icon: "fa-solid fa-person-running",
      button: true,
      visible: true,
      onChange: () => uiService.openBuilder()
    };
    if (Array.isArray(controls)) {
      const tokenControl = controls.find(control => ["token", "tokens"].includes(control.name));
      if (addToolToControl(tokenControl, tool)) return;
      controls.push({ name: "chase-forge", title: tool.title, icon: tool.icon, layer: "TokenLayer", order: controls.length, activeTool: tool.name, tools: [{ ...tool, order: 0 }] });
      return;
    }
    if (controls && typeof controls === "object") {
      const tokenControl = controls.tokens ?? controls.token ?? Object.values(controls).find(control => ["token", "tokens"].includes(control?.name));
      if (addToolToControl(tokenControl, tool)) return;
      controls["chase-forge"] = {
        name: "chase-forge",
        title: tool.title,
        icon: tool.icon,
        layer: "TokenLayer",
        order: Object.keys(controls).length,
        activeTool: tool.name,
        tools: { [tool.name]: { ...tool, order: 0 } }
      };
    }
  });
}
