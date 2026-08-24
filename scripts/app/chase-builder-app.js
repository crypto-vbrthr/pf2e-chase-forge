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
import { cloneData } from "../data/utils.js";

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

function skillLabel(slug) {
  const key = `PF2E.Skill.${slug}`;
  const translated = i18n(key, "");
  if (translated && translated !== key) return translated;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
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

  setImportantStyle(editor, "height", "auto");
  setImportantStyle(editor, "overflow", "visible");

  setImportantStyle(sidebar, "height", "auto");
  setImportantStyle(sidebar, "overflow", "visible");

  root.dataset.chaseRuntimeLayout = reason;
  return { root, windowContent, shell, main, editor, sidebar };
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
        openSessionRunner: this._actionOpenSessionRunner
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
      this._lastValidation = null;
      this._dropBoundElement = null;
      this._participantDropHandlers = null;
    }

    get draft() { return cloneData(this._draft); }

    async loadBlueprint(blueprintId) {
      const blueprint = await this.chaseApi.persistence.blueprints.get(blueprintId);
      if (!blueprint) throw new Error(`Unknown Chase Blueprint '${blueprintId}'.`);
      this._draft = this.chaseApi.factories.blueprint(blueprint);
      this._persisted = true;
      this._lastValidation = null;
      await this.render({ force: true });
      return this.draft;
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
      this._lastValidation = null;
      await this._applyWeatherForgePrefill({ onlyUnset: true, notifyUser: false });
      return this._draft;
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const blueprints = await this.chaseApi.persistence.blueprints.list();
      const summaries = blueprints
        .map(blueprint => ({ ...basicBuilderSummary(blueprint), chaseTypeLabel: i18n(`PF2E_CHASE_FORGE.ChaseType.${blueprint.settings?.chaseType ?? "pursuit"}`, blueprint.settings?.chaseType ?? "pursuit"), active: blueprint.id === this._draft.id }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const editable = isBasicLinearBlueprint(this._draft);
      const cards = editable ? listBasicCards(this._draft) : [];
      const registeredCards = this.chaseApi.cards.list({ includeDisabled: false }) ?? [];
      const validation = editable ? validateBasicBuilderBlueprint(this._draft) : this.chaseApi.validation.blueprint(this._draft);
      const builderMeta = this._draft.metadata?.builder ?? {};
      const persisted = blueprints.some(item => item.id === this._draft.id);
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
      const weatherFromWeatherForge = this._draft.settings.weather?.source?.moduleId === "pf2e-weather-forge";

      return {
        ...context,
        draft: cloneData(this._draft),
        editable,
        persisted,
        cards: cards.map(item => ({
          ...item,
          displayIndex: item.index + 1,
          card: item.card ? {
            ...item.card,
            tagsText: item.card.tags.join(", "),
            typeOptions: optionList(CARD_TYPE_VALUES, item.card.type, "PF2E_CHASE_FORGE.CardType"),
            imageModeOptions: optionList(IMAGE_MODE_VALUES, item.card.image?.mode ?? "none", "PF2E_CHASE_FORGE.ImageMode"),
            approaches: (item.card.approaches ?? []).map((approach, approachIndex) => ({
              ...approach,
              approachIndex,
              statisticOptions: SKILLS.map(value => ({ value, selected: value === approach.statistic, label: skillLabel(value) })),
              dcModeOptions: optionList(DC_MODE_VALUES, approach.dc?.mode ?? "gm", "PF2E_CHASE_FORGE.DcMode"),
              proficiencyOptions: optionList(PROFICIENCY_VALUES, approach.dc?.proficiency ?? "trained", "PF2E_CHASE_FORGE.Proficiency"),
              adjustmentOptions: DIFFICULTY_ADJUSTMENTS.map(value => ({ value, selected: Number(approach.dc?.difficultyAdjustment ?? 0) === value, label: value > 0 ? `+${value}` : String(value) }))
            }))
          } : null,
          first: item.index === 0,
          last: item.index === cards.length - 1,
          originLabel: item.record?.metadata?.originCardRef ?? ""
        })),
        groups: this._draft.groups.map(group => ({
          ...group,
          roleOptions: optionList(GROUP_ROLE_VALUES, group.role, "PF2E_CHASE_FORGE.GroupRole")
        })),
        blueprints: summaries,
        openableSessions,
        hasOpenableSessions: openableSessions.length > 0,
        registeredCards: registeredCards.map(card => ({ id: card.id, name: card.name, type: card.type, source: card.source?.moduleId ?? "" })),
        hasRegisteredCards: registeredCards.length > 0,
        validation,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        chaseTypeOptions: optionList(CHASE_TYPE_VALUES, this._draft.settings.chaseType, "PF2E_CHASE_FORGE.ChaseType"),
        lengthOptions: optionList(LENGTH_VALUES, this._draft.settings.length, "PF2E_CHASE_FORGE.Length"),
        difficultyOptions: optionList(DIFFICULTY_VALUES, this._draft.settings.difficulty, "PF2E_CHASE_FORGE.Difficulty"),
        imageModeOptions: optionList(IMAGE_MODE_VALUES, this._draft.settings.imageMode, "PF2E_CHASE_FORGE.ImageMode"),
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

    async _onRender(context, options) {
      await super._onRender(context, options);
      const root = this.element;
      if (!root) return;

      // Apply the structural fix immediately, then re-apply after Foundry has had
      // a chance to perform any post-render ApplicationV2 layout work.
      applyBuilderRuntimeLayout(this, "render-immediate");
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

      this._bindParticipantDropZones(root);
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
      if (!this.element || !isBasicLinearBlueprint(this._draft)) return this._draft;
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
      next.metadata.builder.mode = "basic";
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
        const index = Number(cardElement.dataset.cardIndex);
        const record = records[index];
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

      this._draft = rebuildBasicLinearGraph(this.chaseApi.factories.blueprint(next));
      return this._draft;
    }

    async _save({ silent = false } = {}) {
      this._syncDraftFromForm();
      const validation = editable ? validateBasicBuilderBlueprint(this._draft) : this.chaseApi.validation.blueprint(this._draft);
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
      const zone = explicitZone ?? event.target?.closest?.("[data-participant-drop]");
      if (!zone || !isBasicLinearBlueprint(this._draft)) return;
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

    static async _actionSaveBlueprint() { return this._save(); }

    static async _actionDuplicateBlueprint() {
      const saved = await this._save({ silent: true });
      if (!saved) return;
      const copy = await this.chaseApi.persistence.blueprints.duplicate(saved.id, {
        name: format("PF2E_CHASE_FORGE.Builder.CopyName", { name: saved.name }, `${saved.name} Kopie`)
      });
      this._draft = copy;
      this._persisted = true;
      notify("info", i18n("PF2E_CHASE_FORGE.Builder.Duplicated", "Kopie erstellt."));
      return this.render({ force: true });
    }

    static async _actionDeleteBlueprint() {
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
      const editable = isBasicLinearBlueprint(this._draft);
      let saved = null;
      if (editable) {
        saved = await this._save({ silent: true });
        if (!saved) return;
        const validation = validateBasicBuilderBlueprint(saved, { forStart: true });
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

    static async _actionAddManualCard() {
      this._syncDraftFromForm();
      this._draft = addManualCardToBasicBlueprint(this._draft);
      return this.render({ force: true });
    }

    static async _actionAddRegisteredCard() {
      this._syncDraftFromForm();
      const select = this.element?.querySelector?.('[name="registeredCard"]');
      const cardId = select?.value;
      if (!cardId) return;
      const card = this.chaseApi.cards.get(cardId, { includeDisabled: false });
      if (!card) {
        notify("warn", i18n("PF2E_CHASE_FORGE.Builder.CardUnavailable", "Diese Karte ist nicht mehr verfügbar."));
        return;
      }
      this._draft = addCardToBasicBlueprint(this._draft, card, { originCardRef: card.id }).blueprint;
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
      this._draft = removeCardFromBasicBlueprint(this._draft, Number(target.dataset.cardIndex));
      return this.render({ force: true });
    }

    static async _actionAddApproach(_event, target) {
      this._syncDraftFromForm();
      this._draft = addApproachToBasicCard(this._draft, Number(target.dataset.cardIndex));
      return this.render({ force: true });
    }

    static async _actionRemoveApproach(_event, target) {
      this._syncDraftFromForm();
      this._draft = removeApproachFromBasicCard(this._draft, Number(target.dataset.cardIndex), Number(target.dataset.approachIndex));
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
