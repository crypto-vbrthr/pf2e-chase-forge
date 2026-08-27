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

function uiLabel(key, fallback) {
  try {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

async function defaultEmbeddedEditorHost(effectEditorApi, definition, options = {}) {
  const document = globalThis.document;
  if (!document?.createElement || !document?.body) {
    throw integrationError("EFFECT_FORGE_EMBEDDED_EDITOR_HOST_UNAVAILABLE", "The embedded Effect Forge editor requires a browser document host.");
  }

  const dialog = document.createElement("dialog");
  dialog.className = "pf2e-chase-forge-effect-editor-dialog";
  dialog.innerHTML = `
    <div class="chase-effect-editor-shell">
      <header class="chase-effect-editor-header">
        <h2><i class="fa-solid fa-wand-magic-sparkles"></i> ${uiLabel("PF2E_CHASE_FORGE.Builder.EffectConsequenceEditorTitle", "Effect-Forge-Konsequenz")}</h2>
        <p>${uiLabel("PF2E_CHASE_FORGE.Builder.EffectConsequenceEditorHint", "Der Effekt wird in dieser Chase-Karte gespeichert und nicht als eigenständiges Item angelegt.")}</p>
      </header>
      <div class="chase-effect-editor-mount"></div>
      <footer class="chase-effect-editor-actions">
        <button type="button" data-action="cancel"><i class="fa-solid fa-xmark"></i> ${uiLabel("PF2E_CHASE_FORGE.Common.Cancel", "Abbrechen")}</button>
        <button type="button" data-action="save" class="default bright"><i class="fa-solid fa-check"></i> ${uiLabel("PF2E_CHASE_FORGE.Builder.AttachEffectToCard", "Effekt zur Karte hinzufügen")}</button>
      </footer>
    </div>`;
  document.body.append(dialog);

  const mount = dialog.querySelector(".chase-effect-editor-mount");
  let latest = cloneData(definition);
  const editor = effectEditorApi.create({
    definition: cloneData(definition),
    onChange(value) {
      const candidate = value?.definition?.schemaVersion ? value.definition
        : value?.value?.definition?.schemaVersion ? value.value.definition
          : value?.value?.schemaVersion ? value.value
            : value?.schemaVersion ? value
              : null;
      if (isPlainObject(candidate)) latest = cloneData(candidate);
    }
  });

  const close = async () => {
    try { await editor?.unmount?.(); } catch { /* best effort */ }
    try { dialog.close?.(); } catch { /* best effort */ }
    dialog.remove?.();
  };

  let resolveChoice;
  const choice = new Promise(resolve => { resolveChoice = resolve; });
  let settled = false;
  const finish = async value => {
    if (settled) return;
    settled = true;
    await close();
    resolveChoice(value);
  };
  dialog.querySelector('[data-action="cancel"]')?.addEventListener("click", () => void finish(null), { once: true });
  dialog.querySelector('[data-action="save"]')?.addEventListener("click", () => {
    const raw = editor?.value ?? latest;
    const candidate = raw?.definition?.schemaVersion ? raw.definition
      : raw?.value?.definition?.schemaVersion ? raw.value.definition
        : raw?.value?.schemaVersion ? raw.value
          : raw?.schemaVersion ? raw
            : latest;
    void finish(isPlainObject(candidate) ? cloneData(candidate) : null);
  }, { once: true });
  dialog.addEventListener?.("cancel", event => {
    event.preventDefault?.();
    void finish(null);
  }, { once: true });

  if (typeof dialog.showModal === "function") dialog.showModal();
  else if (typeof dialog.show === "function") dialog.show();
  else dialog.setAttribute("open", "");

  try {
    await editor.mount(mount);
  } catch (error) {
    await close();
    throw error;
  }
  return choice;
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
      capabilities: Object.freeze({ apply: false, execute: false, readItem: false, analyze: false, migrate: false, checkCompatibility: false, embeddedEditor: false, standaloneEditor: false, editor: false })
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
    embeddedEditor: typeof api.ui?.effectEditor?.create === "function",
    standaloneEditor: typeof api.ui?.openEffectForgeDefinition === "function" || typeof api.ui?.openEffectForge === "function",
    editor: typeof api.ui?.effectEditor?.create === "function" || typeof api.ui?.openEffectForgeDefinition === "function" || typeof api.ui?.openEffectForge === "function"
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
  uuidResolver = null,
  embeddedEditorHost = defaultEmbeddedEditorHost
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

  async function openEditor(reference = {}, options = {}) {
    const { api } = assertAvailable();
    const resolved = await resolveDefinition(reference);

    // Prefer the pure embedded Effect Editor. The host owns persistence, so a
    // Chase consequence can store the edited definition directly instead of
    // materializing a world Item through the standalone Effect Forge window.
    if (typeof api.ui?.effectEditor?.create === "function") {
      const edited = await embeddedEditorHost(api.ui.effectEditor, resolved.definition, {
        unmanagedRules: resolved.unmanagedRules,
        ...(options.editorOptions ?? {})
      });
      if (edited && typeof options.onSave === "function") options.onSave(edited);
      return edited;
    }

    // Backward-compatible fallback for older Critical Forge builds. These
    // surfaces may be Item-oriented, so consumers should prefer the embedded
    // editor capability whenever it is available.
    if (typeof api.ui?.openEffectForgeDefinition === "function") {
      const editorOptions = { unmanagedRules: resolved.unmanagedRules, ...(options.editorOptions ?? {}) };
      if (typeof options.onSave === "function") editorOptions.onSave = options.onSave;
      return api.ui.openEffectForgeDefinition(resolved.definition, editorOptions);
    }
    if (resolved.item && typeof api.ui?.openEffectForge === "function") return api.ui.openEffectForge(resolved.item, options.editorOptions ?? {});
    if (typeof api.ui?.openEffectForge === "function") return api.ui.openEffectForge(options.editorOptions ?? {});
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
