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
  convertToBranchingBuilder,
  isBranchingBuilderBlueprint,
  isBuilderEditableBlueprint,
  listBranchGroups,
  listEditableCards,
  removeApproachFromBuilderCard,
  removeBranchGroup,
  validateBranchingBuilderBlueprint
} from "../builder/branching-builder-model.js";
import { cloneData, createId, nowIso } from "../data/utils.js";
import { localizeChaseCard, localizeSkillLabel } from "../content/content-localization.js";
import { openFoundryImagePicker } from "../images/foundry-image-picker.js";

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
const CARD_TYPE_VALUES = ["obstacle", "complication", "opportunity", "finale"];
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

export function skillLabel(slug) {
  return localizeSkillLabel(slug);
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

  // The diagnostics prove that .window-content is the bounded viewport:
  // it has the window height while its scrollHeight contains the full Builder.
  setImportantStyle(windowContent, "overflow-y", "scroll");
  setImportantStyle(windowContent, "overflow-x", "hidden");
  setImportantStyle(windowContent, "min-height", "0");
  windowContent?.style?.setProperty?.("scrollbar-gutter", "stable");

  // Foundry has been observed computing these as display:block/overflow:visible
  // despite the module stylesheet. Inline !important makes the intended layout
  // unambiguous and also gives diagnostics a reliable signal that the fix ran.
  setImportantStyle(shell, "display", "grid");
  setImportantStyle(shell, "grid-template-columns", "280px minmax(0, 1fr)");
  setImportantStyle(shell, "width", "100%");
  setImportantStyle(shell, "height", "auto");
  setImportantStyle(shell, "min-height", "100%");
  setImportantStyle(shell, "overflow", "visible");

  setImportantStyle(main, "display", "flex");
  setImportantStyle(main, "flex-direction", "column");
  setImportantStyle(main, "min-width", "0");
  setImportantStyle(main, "height", "auto");
  setImportantStyle(main, "overflow", "visible");

  // Keep the Builder command bar visible while Foundry's bounded window-content
  // viewport scrolls the long form below it. Runtime enforcement mirrors the
  // CSS because ApplicationV2/core styles have overridden module layout rules
  // in this window on some Foundry builds.
  setImportantStyle(toolbar, "position", "sticky");
  setImportantStyle(toolbar, "top", "0");
  setImportantStyle(toolbar, "z-index", "20");

  setImportantStyle(editor, "height", "auto");
  setImportantStyle(editor, "overflow", "visible");

  setImportantStyle(sidebar, "height", "auto");
  setImportantStyle(sidebar, "overflow", "visible");

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
        copyLibraryBlueprint: this._actionCopyLibraryBlueprint,
        saveBlueprint: this._actionSaveBlueprint,
        duplicateBlueprint: this._actionDuplicateBlueprint,
        deleteBlueprint: this._actionDeleteBlueprint,
        startBlueprint: this._actionStartBlueprint,
        refreshBuilder: this._actionRefreshBuilder,
        addManualCard: this._actionAddManualCard,
        addRegisteredCard: this._actionAddRegisteredCard,
        moveCardUp: this._actionMoveCardUp,
        moveCardDown: this._actionMoveCardDown,
        removeCard: this._actionRemoveCard,
        addApproach: this._actionAddApproach,
        removeApproach: this._actionRemoveApproach,
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
        browseCardImage: this._actionBrowseCardImage,
        refreshCardImages: this._actionRefreshCardImages,
        selectCardImageCandidate: this._actionSelectCardImageCandidate,
        clearCardImageSelection: this._actionClearCardImageSelection
      }
    };

    static PARTS = {
      main: {
        template: `modules/${MODULE_ID}/templates/chase-builder.hbs`,
        scrollable: [".chase-builder-sidebar", ".chase-builder-editor-scroll"]
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
      this._dropBoundElement = null;
      this._participantDropHandlers = null;
      this._generatorTemplateId = null;
    }

    get draft() { return cloneData(this._draft); }

    async loadBlueprint(blueprintId) {
      const blueprint = await this.chaseApi.persistence.blueprints.get(blueprintId);
      if (!blueprint) throw new Error(`Unknown Chase Blueprint '${blueprintId}'.`);
      this._draft = this.chaseApi.factories.blueprint(blueprint);
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
        .map(blueprint => ({ ...basicBuilderSummary(blueprint), chaseTypeLabel: i18n(`PF2E_CHASE_FORGE.ChaseType.${blueprint.settings?.chaseType ?? "pursuit"}`, blueprint.settings?.chaseType ?? "pursuit"), active: !this._libraryBlueprintId && blueprint.id === this._draft.id }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const linearEditable = isBasicLinearBlueprint(this._draft);
      const branchingEditable = isBranchingBuilderBlueprint(this._draft);
      const builderSupported = isBuilderEditableBlueprint(this._draft);
      const librarySelected = Boolean(this._libraryBlueprintId);
      const editable = builderSupported && !librarySelected;
      const cards = builderSupported ? listEditableCards(this._draft) : [];
      const branchGroups = branchingEditable ? listBranchGroups(this._draft) : [];
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
        return { id: card.id, name: card.name, type: card.type, source, category, sourcePackId: card.source?.packId ?? card.source?.moduleId ?? "cards" };
      }).sort((a, b) => String(a.source).localeCompare(String(b.source)) || String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
      const registeredCardGroupMap = new Map();
      for (const card of registeredCardViews) {
        const groupId = `${card.sourcePackId}:${card.category || "general"}`;
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
      const validation = linearEditable
        ? validateBasicBuilderBlueprint(this._draft)
        : (branchingEditable ? validateBranchingBuilderBlueprint(this._draft) : this.chaseApi.validation.blueprint(this._draft));
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
      const libraryGroups = [...libraryGroupMap.values()]
        .map(group => ({ ...group, count: group.chases.length }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));

      const cardViews = cards.map(item => ({
        ...item,
        displayIndex: item.index + 1,
        typeLabel: i18n(`PF2E_CHASE_FORGE.CardType.${item.card?.type ?? "obstacle"}`, item.card?.type ?? "obstacle"),
        editable,
        linearEditable,
        card: item.card ? {
          ...item.card,
          tagsText: item.card.tags.join(", "),
          typeOptions: optionList(CARD_TYPE_VALUES, item.card.type, "PF2E_CHASE_FORGE.CardType"),
          imageModeOptions: optionList(IMAGE_MODE_VALUES, item.card.image?.mode ?? "none", "PF2E_CHASE_FORGE.ImageMode"),
          imagePreviewPath: resolvedCardImages.get(item.ref)?.path ?? item.card.image?.path ?? null,
          imagePreviewAlt: resolvedCardImages.get(item.ref)?.alt || item.card.image?.alt || item.card.name || "",
          imageResolved: resolvedCardImages.get(item.ref) ?? null,
          imageProviderOptions: imageProviderOptions.map(option => ({ ...option, selected: option.value === (item.card.image?.providerId ?? "") })),
          approaches: (item.card.approaches ?? []).map((approach, approachIndex) => ({
            ...approach,
            approachIndex,
            cardRef: item.ref,
            cardIndex: item.index,
            statisticOptions: SKILLS.map(value => ({ value, selected: value === approach.statistic, label: skillLabel(value) })),
            dcModeOptions: optionList(DC_MODE_VALUES, approach.dc?.mode ?? "gm", "PF2E_CHASE_FORGE.DcMode"),
            proficiencyOptions: optionList(PROFICIENCY_VALUES, approach.dc?.proficiency ?? "trained", "PF2E_CHASE_FORGE.Proficiency"),
            adjustmentOptions: DIFFICULTY_ADJUSTMENTS.map(value => ({ value, selected: Number(approach.dc?.difficultyAdjustment ?? 0) === value, label: value > 0 ? `+${value}` : String(value) }))
          }))
        } : null,
        first: item.index === 0,
        last: item.index === cards.length - 1,
        canAddBranch: item.canAddBranch === true,
        originLabel: item.record?.metadata?.originCardRef ?? ""
      }));
      const branchViews = branchGroups.map(group => ({
        ...group,
        editable,
        routes: group.routes.map(route => ({
          ...route,
          editable,
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
      const routeDiagram = buildRouteDiagramModel(cardViews, branchViews, { selected: this._selectedInspector, editable });
      const selectedCard = this._selectedInspector?.type === "card"
        ? cardViews.find(item => item.ref === this._selectedInspector.id) ?? null
        : null;
      const selectedBranch = this._selectedInspector?.type === "branch"
        ? branchViews.find(group => group.branchGroupId === this._selectedInspector.id) ?? null
        : null;
      if (selectedCard?.card) {
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
        builderSupported,
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
        hasBranchGroups: branchGroups.length > 0,
        groups: this._draft.groups.map(group => ({
          ...group,
          roleOptions: optionList(GROUP_ROLE_VALUES, group.role, "PF2E_CHASE_FORGE.GroupRole")
        })),
        blueprints: summaries,
        libraryBlueprints: librarySummaries,
        libraryGroups,
        hasLibraryBlueprints: librarySummaries.length > 0,
        openableSessions,
        hasOpenableSessions: openableSessions.length > 0,
        registeredCards: registeredCardViews,
        registeredCardGroups,
        hasRegisteredCards: registeredCards.length > 0,
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

    _captureScrollPosition() {
      const scroller = this.element?.querySelector?.(":scope > .window-content") ?? this.element?.querySelector?.(".window-content") ?? null;
      this._pendingScrollTop = scroller ? Number(scroller.scrollTop ?? 0) : null;
      return this._pendingScrollTop;
    }

    _restoreCapturedScrollPosition() {
      if (!Number.isFinite(this._pendingScrollTop)) return;
      const top = this._pendingScrollTop;
      this._pendingScrollTop = null;
      const restore = () => {
        const scroller = this.element?.querySelector?.(":scope > .window-content") ?? this.element?.querySelector?.(".window-content") ?? null;
        if (scroller) scroller.scrollTop = top;
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

      this._applyLibraryReadOnlyUi(root);
      this._bindParticipantDropZones(root);
    }

    _applyLibraryReadOnlyUi(root = this.element) {
      if (!root || !this._libraryBlueprintId) return;
      const editor = root.querySelector?.(".chase-builder-editor-scroll");
      if (!editor) return;
      editor.classList?.add?.("chase-builder-read-only");
      for (const control of editor.querySelectorAll?.("input, textarea, select, button") ?? []) control.disabled = true;
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
      const result = await super.close(options);
      if (openBuilderApp === this) openBuilderApp = null;
      return result;
    }

    _syncDraftFromForm() {
      if (this._libraryBlueprintId) return this._draft;
      if (!this.element || !isBuilderEditableBlueprint(this._draft)) return this._draft;
      const root = this.element;
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
      const branchingDraft = isBranchingBuilderBlueprint(this._draft);
      next.metadata.builder.mode = branchingDraft ? "branching" : "basic";
      next.metadata.builder.contractVersion = 1;
      next.metadata.builder.actionLevel = value("metadata.actionLevel") || "medium";
      next.metadata.builder.humorLevel = value("metadata.humorLevel") || "low";

      for (const groupElement of root.querySelectorAll("[data-builder-group]")) {
        const groupId = groupElement.dataset.groupId;
        const group = next.groups.find(candidate => candidate.id === groupId);
        if (!group) continue;
        group.name = groupElement.querySelector('[data-group-field="name"]')?.value?.trim() || group.name;
        group.role = groupElement.querySelector('[data-group-field="role"]')?.value || group.role;
        group.public = groupElement.querySelector('[data-group-field="public"]')?.checked !== false;
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
        card.obstacle.requiredPoints = Math.max(1, Math.trunc(Number(cardElement.querySelector('[data-card-field="requiredPoints"]')?.value) || 1));
        card.obstacle.scalable = cardElement.querySelector('[data-card-field="scalable"]')?.checked !== false;
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
      this._draft = branchingDraft ? normalized : rebuildBasicLinearGraph(normalized);
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
        this._draft = addParticipantToBasicBlueprint(this._draft, zone.dataset.groupId, participant);
        await this.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to add chase participant from drop.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Builder.DropFailed", "Der Beteiligte konnte nicht hinzugefügt werden."));
      }
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

    static async _actionCopyLibraryBlueprint() {
      if (!this._libraryBlueprintId) return null;
      const copy = this._worldCopyFromLibrary();
      if (!copy) return null;
      const saved = await this.chaseApi.persistence.blueprints.create(copy);
      this._draft = saved;
      this._persisted = true;
      this._libraryBlueprintId = null;
      this._selectedInspector = null;
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.LibraryCopied", "Bibliotheksjagd als eigene Verfolgungsjagd übernommen."));
      return this.render({ force: true });
    }

    static async _actionSaveBlueprint() { return this._save(); }

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
        const validation = saved ? this.chaseApi.validation.blueprint(saved) : { valid: false };
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
      const editable = linearEditable || branchingEditable;
      let saved = null;
      if (editable) {
        saved = await this._save({ silent: true });
        if (!saved) return;
        const validation = linearEditable
          ? validateBasicBuilderBlueprint(saved, { forStart: true })
          : validateBranchingBuilderBlueprint(saved, { forStart: true });
        if (!validation.valid) {
          notify("error", i18n("PF2E_CHASE_FORGE.Builder.CannotStart", "Die Verfolgungsjagd kann noch nicht gestartet werden."));
          return this.render({ force: true });
        }
      } else {
        if (!this._persisted) {
          notify("error", i18n("PF2E_CHASE_FORGE.Builder.CannotStart", "Die Verfolgungsjagd kann noch nicht gestartet werden."));
          return;
        }
        saved = await this.chaseApi.persistence.blueprints.get(this._draft.id);
        const validation = saved ? this.chaseApi.validation.blueprint(saved) : { valid: false };
        if (!saved || !validation.valid) {
          notify("error", i18n("PF2E_CHASE_FORGE.Builder.CannotStart", "Die Verfolgungsjagd kann noch nicht gestartet werden."));
          return;
        }
      }
      const draftSession = await this.chaseApi.sessionManager.createSession(saved.id);
      const session = await this.chaseApi.sessionManager.startSession(draftSession.id);
      notify("info", format("PF2E_CHASE_FORGE.Builder.SessionStarted", { id: session.id }, `Session ${session.id} gestartet.`));
      await this.chaseApi.presentation?.chat?.postEvent?.({
        title: format("PF2E_CHASE_FORGE.Runner.ChatStarted", { name: saved.name }, `Verfolgungsjagd gestartet: ${saved.name}`)
      }, { flags: { sessionId: session.id } }).catch(() => null);
      await this.chaseApi.ui?.openRunner?.({ sessionId: session.id });
      return this.render({ force: true });
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
      const result = isBranchingBuilderBlueprint(this._draft)
        ? appendMainlineManualCard(this._draft)
        : addManualCardToBasicBlueprint(this._draft);
      this._draft = result.blueprint;
      this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
      return this.render({ force: true });
    }

    static async _actionAddRegisteredCard() {
      this._syncDraftFromForm();
      const select = this.element?.querySelector?.('[name="registeredCard"]');
      const cardId = select?.value;
      if (!cardId) return;
      const rawCard = this.chaseApi.cards.get(cardId, { includeDisabled: false });
      if (!rawCard) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.CardUnavailable", "Diese Karte ist nicht mehr verfügbar."));
        return;
      }
      const card = localizeChaseCard(rawCard);
      if (card.obstacle?.scalable !== false) {
        const largestGroup = Math.max(1, ...(this._draft.groups ?? []).map(group => group.participants?.length ?? 0));
        card.obstacle.requiredPoints = Math.max(1, largestGroup - 1);
      }
      const result = isBranchingBuilderBlueprint(this._draft)
        ? appendMainlineCard(this._draft, card, { originCardRef: rawCard.id })
        : addCardToBasicBlueprint(this._draft, card, { originCardRef: rawCard.id });
      this._draft = result.blueprint;
      this._selectedInspector = result.ref ? { type: "card", id: result.ref } : this._selectedInspector;
      return this.render({ force: true });
    }

    static async _actionMoveCardUp(_event, target) {
      this._syncDraftFromForm();
      const index = Number(target.dataset.cardIndex);
      this._draft = moveCardInBasicBlueprint(this._draft, index, index - 1);
      return this.render({ force: true });
    }

    static async _actionMoveCardDown(_event, target) {
      this._syncDraftFromForm();
      const index = Number(target.dataset.cardIndex);
      this._draft = moveCardInBasicBlueprint(this._draft, index, index + 1);
      return this.render({ force: true });
    }

    static async _actionRemoveCard(_event, target) {
      this._syncDraftFromForm();
      const cardRef = target.dataset.cardRef ?? null;
      this._draft = removeCardFromBasicBlueprint(this._draft, Number(target.dataset.cardIndex));
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
      const branchGroupId = target.dataset.branchGroupId;
      if (!branchGroupId) return;
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
      this._captureScrollPosition();
      return this.render({ force: true });
    }

    static async _actionSelectBranchGroup(_event, target) {
      this._syncDraftFromForm();
      const branchGroupId = target.dataset.branchGroupId;
      if (!branchGroupId) return;
      this._selectedInspector = { type: "branch", id: branchGroupId };
      this._captureScrollPosition();
      return this.render({ force: true });
    }

    static async _actionAddSelectedTokens(_event, target) {
      this._syncDraftFromForm();
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

export function createChaseBuilderUiService({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  return Object.freeze({
    async openBuilder({ blueprintId = null } = {}) {
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
      if (blueprintId) {
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
