import { MODULE_ID } from "../core/constants.js";
import { cloneData } from "../data/utils.js";
import { getEffectConsequencePresentationMode } from "../settings.js";

function i18n(key, fallback = null) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : (fallback ?? key);
}

function format(key, data = {}, fallback = null) {
  const translated = globalThis.game?.i18n?.format?.(key, data);
  return translated && translated !== key ? translated : (fallback ?? key);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function participantDefinition(session, participantId) {
  for (const group of session?.blueprintSnapshot?.groups ?? []) {
    const participant = group.participants?.find(item => item.id === participantId);
    if (participant) return participant;
  }
  return null;
}

function snapshotCard(session, cardId) {
  return session?.blueprintSnapshot?.contentSnapshots?.cards?.find(record => record?.data?.id === cardId || record?.ref === cardId)?.data ?? null;
}

export function reconstructConsequenceOccurrence(api, session, record) {
  const card = snapshotCard(session, record.cardId) ?? api?.cards?.get?.(record.cardId, { includeDisabled: true }) ?? null;
  const approach = card?.approaches?.find(item => item.id === record.approachId) ?? null;
  const candidates = [...(approach?.outcomes?.[record.degree] ?? []), ...(card?.outcomes?.[record.degree] ?? [])];
  const consequence = candidates.find(item => item.id === record.consequenceId) ?? null;
  if (!consequence) return null;
  return api.consequences.createOccurrence(consequence, {
    occurrenceId: record.occurrenceId,
    sourceEventId: record.sourceEventId,
    runtimeGroupId: record.runtimeGroupId,
    participantId: record.participantId,
    nodeId: record.nodeId,
    cardId: record.cardId,
    approachId: record.approachId,
    degree: record.degree
  });
}

export function prepareOccurrencesForPresentation(api, rulesResult, mode = getEffectConsequencePresentationMode()) {
  const occurrences = api?.consequences?.fromRulesResult?.(rulesResult) ?? [];
  return occurrences.map(occurrence => {
    if (occurrence?.consequence?.kind !== "effectForge") return occurrence;
    return {
      ...cloneData(occurrence),
      consequence: {
        ...cloneData(occurrence.consequence),
        gmConfirmation: mode === "automatic" ? false : true
      }
    };
  });
}

export function pendingEffectItems(execution) {
  return (execution?.processed ?? []).filter(item => item?.occurrence?.consequence?.kind === "effectForge" && item?.record?.status === "pendingConfirmation");
}

export async function confirmEffectConsequenceDialog(item) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return false;
  const label = item?.occurrence?.consequence?.label || item?.record?.consequenceId || i18n("PF2E_CHASE_FORGE.Runner.Effect", "Effekt");
  const participant = participantDefinition(item?.session, item?.occurrence?.participantId);
  const participantName = participant?.name || i18n("PF2E_CHASE_FORGE.Runner.UnknownParticipant", "Beteiligter");
  const description = item?.occurrence?.consequence?.payload?.definition?.description ?? "";
  const content = `<div class="chase-consequence-dialog"><p>${escapeHtml(format("PF2E_CHASE_FORGE.Runner.ConsequenceDialogQuestion", { effect: label, participant: participantName }, `${label} auf ${participantName} anwenden?`))}</p>${description ? `<p class="chase-consequence-description">${escapeHtml(description)}</p>` : ""}</div>`;
  const choice = await DialogV2.wait({
    window: { title: i18n("PF2E_CHASE_FORGE.Runner.ConsequenceDialogTitle", "Konsequenz anwenden") },
    content,
    modal: true,
    buttons: [
      { action: "apply", label: i18n("PF2E_CHASE_FORGE.Runner.Apply", "Anwenden"), icon: "<i class=\"fa-solid fa-wand-magic-sparkles\"></i>", default: true },
      { action: "later", label: i18n("PF2E_CHASE_FORGE.Runner.ConsequenceLater", "Später"), icon: "<i class=\"fa-solid fa-clock\"></i>" }
    ]
  }).catch(() => "later");
  return choice === "apply";
}

export function effectConsequenceChatHtml({ label, participantName, description = "", status = "pending" } = {}) {
  const applied = status === "applied";
  return `<article class="pf2e-chase-forge-chat chase-chat-consequence ${applied ? "applied" : "pending"}">
    <header><i class="fa-solid fa-triangle-exclamation"></i> <strong>${escapeHtml(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceTitle", "Chase-Konsequenz"))}</strong></header>
    <div class="chase-chat-consequence-target"><strong>${escapeHtml(participantName)}</strong> · ${escapeHtml(label)}</div>
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    <button type="button" data-chase-consequence-apply ${applied ? "disabled" : ""}><i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(applied ? i18n("PF2E_CHASE_FORGE.Chat.ConsequenceApplied", "Angewendet") : i18n("PF2E_CHASE_FORGE.Chat.ApplyConsequence", "Konsequenz anwenden"))}</button>
  </article>`;
}

export async function postEffectConsequenceChatCard(item, { mode = "chatGm" } = {}) {
  if (!globalThis.ChatMessage?.create) return null;
  const session = item?.session ?? null;
  const occurrence = item?.occurrence ?? null;
  const record = item?.record ?? null;
  const label = occurrence?.consequence?.label || record?.consequenceId || i18n("PF2E_CHASE_FORGE.Runner.Effect", "Effekt");
  const participant = participantDefinition(session, occurrence?.participantId);
  const participantName = participant?.name || i18n("PF2E_CHASE_FORGE.Runner.UnknownParticipant", "Beteiligter");
  const description = occurrence?.consequence?.payload?.definition?.description ?? "";
  const flags = { [MODULE_ID]: { type: "consequence", sessionId: session?.id ?? null, occurrenceId: occurrence?.occurrenceId ?? null, consequenceId: occurrence?.consequence?.id ?? null, participantId: occurrence?.participantId ?? null, consequenceStatus: "pending" } };
  const data = { speaker: globalThis.ChatMessage.getSpeaker?.({ alias: "Chase Forge" }) ?? { alias: "Chase Forge" }, content: effectConsequenceChatHtml({ label, participantName, description }), flags };
  if (mode === "chatGm") {
    const gmIds = (globalThis.game?.users ?? []).filter?.(user => user?.isGM)?.map?.(user => user.id) ?? [];
    if (gmIds.length) data.whisper = gmIds;
    data.blind = true;
  }
  return globalThis.ChatMessage.create(data);
}

function rootElement(html) {
  if (!html) return null;
  const HTMLElementCtor = globalThis.HTMLElement;
  if (HTMLElementCtor && html instanceof HTMLElementCtor) return html;
  if (HTMLElementCtor && html?.[0] instanceof HTMLElementCtor) return html[0];
  return html?.querySelector ? html : null;
}

async function applyFromChat(message, button) {
  if (globalThis.game?.user?.isGM !== true) return;
  const flags = message?.flags?.[MODULE_ID] ?? message?.getFlag?.(MODULE_ID, "") ?? null;
  const sessionId = flags?.sessionId;
  const occurrenceId = flags?.occurrenceId;
  if (!sessionId || !occurrenceId) return;
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null;
  if (!api) return;
  try {
    const session = await api.sessionManager.getSession(sessionId);
    const record = session?.consequenceState?.records?.find(item => item.occurrenceId === occurrenceId) ?? null;
    if (!record) throw new Error(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceRecordMissing", "Die Konsequenz ist in der laufenden Chase nicht mehr vorhanden."));
    if (record.status === "applied") {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceApplied", "Angewendet"))}`;
      await message?.setFlag?.(MODULE_ID, "consequenceStatus", "applied");
      return;
    }
    const occurrence = reconstructConsequenceOccurrence(api, session, record);
    if (!occurrence) throw new Error(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceReconstructFailed", "Die Konsequenz konnte nicht aus der Kartenkopie rekonstruiert werden."));
    const result = await api.consequences.execute(session, occurrence, { confirmedOccurrenceIds: [occurrenceId], retryFallback: true, retryFailed: true, retryBlocked: true });
    await api.sessionManager.saveSession(result.session);
    await api.sync?.publishSession?.(result.session, { open: true });
    await api.ui?.getOpenRunner?.(sessionId)?.render?.({ force: true });
    const applied = result.records?.find(item => item.occurrenceId === occurrenceId)?.status === "applied";
    if (applied) {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceApplied", "Angewendet"))}`;
      await message?.setFlag?.(MODULE_ID, "consequenceStatus", "applied");
      globalThis.ui?.notifications?.info?.(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceAppliedNotice", "Chase-Konsequenz angewendet."));
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to apply consequence from Chat.`, error);
    globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
  }
}

export function registerEffectConsequenceChatActions() {
  const wire = (message, html) => {
    const flags = message?.flags?.[MODULE_ID] ?? null;
    if (flags?.type !== "consequence") return;
    const root = rootElement(html);
    if (!root) return;
    const button = root.querySelector?.("[data-chase-consequence-apply]");
    if (!button) return;
    if (globalThis.game?.user?.isGM !== true) {
      button.style.display = "none";
      return;
    }
    if (flags?.consequenceStatus === "applied") {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(i18n("PF2E_CHASE_FORGE.Chat.ConsequenceApplied", "Angewendet"))}`;
      return;
    }
    if (button.dataset.chaseConsequenceWired === "1") return;
    button.dataset.chaseConsequenceWired = "1";
    button.addEventListener("click", event => { event.preventDefault(); void applyFromChat(message, button); });
  };
  globalThis.Hooks?.on?.("renderChatMessageHTML", wire);
}
