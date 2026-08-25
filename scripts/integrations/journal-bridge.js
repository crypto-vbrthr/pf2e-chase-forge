import { MODULE_ID } from "../core/constants.js";

export const CHASE_JOURNAL_CONTRACT_VERSION = 1;
export const CHASE_JOURNAL_LINK_KINDS = Object.freeze(["blueprint", "library"]);

const TOKEN_PREFIX = Object.freeze({
  blueprint: "ChaseBlueprint",
  library: "ChaseLibrary"
});

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
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function safeLabel(value, fallback = "Chase") {
  const label = String(value ?? fallback).replace(/[{}\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return label || fallback;
}

function requireKind(kind) {
  if (!CHASE_JOURNAL_LINK_KINDS.includes(kind)) throw new TypeError(`Unsupported Chase Journal link kind '${kind}'.`);
  return kind;
}

export function createChaseJournalReference(kind, id, label = "Chase") {
  requireKind(kind);
  const targetId = String(id ?? "").trim();
  if (!targetId) throw new TypeError("Chase Journal links require an id.");
  return `@${TOKEN_PREFIX[kind]}[${targetId}]{${safeLabel(label)}}`;
}

export function parseChaseJournalReference(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^@(ChaseBlueprint|ChaseLibrary)\[([^\]]+)\](?:\{([^}]*)\})?$/);
  if (!match) return null;
  const kind = match[1] === "ChaseLibrary" ? "library" : "blueprint";
  return Object.freeze({ kind, id: match[2], label: match[3] || null, reference: raw });
}

export function buildChaseJournalLinkHtml({ kind, id, label, gm = true } = {}) {
  requireKind(kind);
  const cleanId = String(id ?? "").trim();
  if (!cleanId) throw new TypeError("Chase Journal link HTML requires an id.");
  const cleanLabel = safeLabel(label, cleanId);
  const kindLabel = kind === "library"
    ? i18n("PF2E_CHASE_FORGE.Journal.LibraryKind", "Bibliotheksjagd")
    : i18n("PF2E_CHASE_FORGE.Journal.BlueprintKind", "Verfolgungsjagd");
  const openTitle = i18n("PF2E_CHASE_FORGE.Journal.Open", "In Chase Forge öffnen");
  const startTitle = i18n("PF2E_CHASE_FORGE.Journal.Start", "Verfolgungsjagd starten");
  const attributes = `data-pf2e-chase-kind="${escapeHtml(kind)}" data-pf2e-chase-id="${escapeHtml(cleanId)}"`;
  const open = gm
    ? `<a class="content-link pf2e-chase-journal-open" ${attributes} data-pf2e-chase-action="open" title="${escapeHtml(openTitle)}"><i class="fa-solid fa-person-running"></i> ${escapeHtml(cleanLabel)}</a>`
    : `<span class="content-link pf2e-chase-journal-readonly" title="${escapeHtml(kindLabel)}"><i class="fa-solid fa-person-running"></i> ${escapeHtml(cleanLabel)}</span>`;
  const start = gm
    ? `<button type="button" class="pf2e-chase-journal-start" ${attributes} data-pf2e-chase-action="start" title="${escapeHtml(startTitle)}" aria-label="${escapeHtml(startTitle)}"><i class="fa-solid fa-play"></i></button>`
    : "";
  return `<span class="pf2e-chase-journal-link" data-pf2e-chase-reference="true">${open}${start}</span>`;
}

function htmlToNode(html) {
  const document = globalThis.document;
  if (!document?.createElement) return html;
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content?.firstElementChild ?? template.firstElementChild ?? html;
}

export function createChaseJournalEnrichers() {
  const make = kind => ({
    pattern: kind === "library"
      ? /@ChaseLibrary\[([^\]]+)\](?:\{([^}]*)\})?/g
      : /@ChaseBlueprint\[([^\]]+)\](?:\{([^}]*)\})?/g,
    enricher: async match => htmlToNode(buildChaseJournalLinkHtml({
      kind,
      id: match?.[1],
      label: match?.[2] || match?.[1],
      gm: globalThis.game?.user?.isGM === true
    }))
  });
  return Object.freeze([make("blueprint"), make("library")]);
}

function getJournalEntryClass() {
  return globalThis.JournalEntry ?? globalThis.getDocumentClass?.("JournalEntry") ?? null;
}

export function createChaseJournalBridge({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  let registered = false;
  let clickHandler = null;
  let enrichers = [];

  async function resolveTarget(kind, id) {
    const api = getApi();
    if (!api) return null;
    if (kind === "library") return api.library?.get?.(id, { includeDisabled: false }) ?? null;
    return api.persistence?.blueprints?.get?.(id) ?? null;
  }

  async function open(kind, id) {
    requireKind(kind);
    if (globalThis.game?.user?.isGM !== true) {
      notify("warn", i18n("PF2E_CHASE_FORGE.Journal.GmOnly", "Nur die Spielleitung kann vorbereitete Verfolgungsjagden öffnen."));
      return null;
    }
    const target = await resolveTarget(kind, id);
    if (!target) {
      notify("error", i18n("PF2E_CHASE_FORGE.Journal.TargetMissing", "Die verknüpfte Verfolgungsjagd ist nicht mehr verfügbar."));
      return null;
    }
    const api = getApi();
    return kind === "library"
      ? api.ui?.openBuilder?.({ libraryBlueprintId: id })
      : api.ui?.openBuilder?.({ blueprintId: id });
  }

  async function start(kind, id) {
    requireKind(kind);
    if (globalThis.game?.user?.isGM !== true) {
      notify("warn", i18n("PF2E_CHASE_FORGE.Journal.GmOnly", "Nur die Spielleitung kann vorbereitete Verfolgungsjagden starten."));
      return null;
    }
    const api = getApi();
    const blueprint = await resolveTarget(kind, id);
    const validation = blueprint ? api?.validation?.blueprint?.(blueprint) : { valid: false };
    if (!blueprint || !validation?.valid) {
      notify("error", i18n("PF2E_CHASE_FORGE.Journal.CannotStart", "Die verknüpfte Verfolgungsjagd kann nicht gestartet werden."));
      return null;
    }
    const draftSession = kind === "library"
      ? await api.sessionManager.createSession(blueprint, {
          metadata: {
            libraryOrigin: {
              blueprintId: blueprint.id,
              source: structuredClone(blueprint.source ?? null),
              startedDirectly: true,
              startedFromJournal: true
            }
          }
        })
      : await api.sessionManager.createSession(blueprint.id, { metadata: { startedFromJournal: true } });
    const session = await api.sessionManager.startSession(draftSession.id);
    notify("info", format("PF2E_CHASE_FORGE.Builder.SessionStarted", { id: session.id }, `Session ${session.id} gestartet.`));
    await api.presentation?.chat?.postEvent?.({
      title: format("PF2E_CHASE_FORGE.Runner.ChatStarted", { name: blueprint.name }, `Verfolgungsjagd gestartet: ${blueprint.name}`)
    }, { flags: { sessionId: session.id, startedFromJournal: true } }).catch(() => null);
    try { await api.sync?.publishSession?.(session, { open: true }); }
    catch { /* A running Chase remains valid even when no player socket is currently available. */ }
    await api.ui?.openRunner?.({ sessionId: session.id });
    return session;
  }

  async function copyReference(kind, id, label = null) {
    const target = label ? null : await resolveTarget(kind, id);
    const reference = createChaseJournalReference(kind, id, label ?? target?.name ?? id);
    let copied = false;
    if (globalThis.game?.clipboard?.copyPlainText) {
      await globalThis.game.clipboard.copyPlainText(reference);
      copied = true;
    } else if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(reference);
      copied = true;
    }
    return Object.freeze({ reference, copied });
  }

  async function createEntry(kind, id, { name = null, folder = null } = {}) {
    requireKind(kind);
    if (globalThis.game?.user?.isGM !== true) throw new Error("Only a GM can create Chase Journal entries.");
    const blueprint = await resolveTarget(kind, id);
    if (!blueprint) throw new Error(`Unknown Chase Journal target '${kind}:${id}'.`);
    const JournalEntryClass = getJournalEntryClass();
    if (!JournalEntryClass?.create) throw new Error("Foundry JournalEntry creation is unavailable.");
    const reference = createChaseJournalReference(kind, id, blueprint.name);
    const title = name || blueprint.name;
    const chaseType = blueprint.settings?.chaseType ?? "pursuit";
    const chaseTypeLabel = i18n(`PF2E_CHASE_FORGE.ChaseType.${chaseType}`, chaseType);
    const description = String(blueprint.description ?? "").trim();
    const content = [
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>${escapeHtml(reference)}</p>`,
      description ? `<p>${escapeHtml(description)}</p>` : "",
      `<p><strong>${escapeHtml(i18n("PF2E_CHASE_FORGE.Journal.Type", "Typ"))}:</strong> ${escapeHtml(chaseTypeLabel)}</p>`
    ].filter(Boolean).join("\n");
    const none = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
    const data = {
      name: title,
      ownership: { default: none },
      pages: [{
        name: title,
        type: "text",
        text: { content, format: globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
        flags: { [MODULE_ID]: { type: "chaseLinkPage", kind, targetId: id, reference } }
      }],
      flags: { [MODULE_ID]: { type: "chaseLinkJournal", kind, targetId: id, reference } }
    };
    if (folder) data.folder = folder;
    const entry = await JournalEntryClass.create(data);
    await entry?.sheet?.render?.({ force: true });
    return entry;
  }

  async function handleClick(event) {
    const target = event?.target?.closest?.("[data-pf2e-chase-action]");
    if (!target) return;
    const action = target.dataset?.pf2eChaseAction;
    const kind = target.dataset?.pf2eChaseKind;
    const id = target.dataset?.pf2eChaseId;
    if (!action || !kind || !id) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (action === "open") await open(kind, id);
    else if (action === "start") await start(kind, id);
  }

  function register() {
    if (registered) return true;
    const config = globalThis.CONFIG;
    if (config?.TextEditor) {
      config.TextEditor.enrichers ??= [];
      enrichers = createChaseJournalEnrichers();
      for (const enricher of enrichers) {
        if (!config.TextEditor.enrichers.some(existing => String(existing?.pattern) === String(enricher.pattern))) {
          config.TextEditor.enrichers.push(enricher);
        }
      }
    }
    const document = globalThis.document;
    if (document?.addEventListener) {
      clickHandler = event => { Promise.resolve(handleClick(event)).catch(error => {
        console.error(`${MODULE_ID} | Chase Journal action failed.`, error);
        notify("error", i18n("PF2E_CHASE_FORGE.Journal.ActionFailed", "Die Journal-Aktion konnte nicht ausgeführt werden."));
      }); };
      document.addEventListener("click", clickHandler, true);
    }
    registered = true;
    return true;
  }

  function unregister() {
    if (!registered) return false;
    if (clickHandler) globalThis.document?.removeEventListener?.("click", clickHandler, true);
    if (globalThis.CONFIG?.TextEditor?.enrichers && enrichers.length) {
      globalThis.CONFIG.TextEditor.enrichers = globalThis.CONFIG.TextEditor.enrichers.filter(existing => !enrichers.includes(existing));
    }
    enrichers = [];
    clickHandler = null;
    registered = false;
    return true;
  }

  return Object.freeze({
    contractVersion: CHASE_JOURNAL_CONTRACT_VERSION,
    reference: createChaseJournalReference,
    parseReference: parseChaseJournalReference,
    buildLinkHtml: buildChaseJournalLinkHtml,
    resolve: resolveTarget,
    open,
    start,
    copyReference,
    createEntry,
    register,
    unregister,
    isRegistered: () => registered
  });
}
