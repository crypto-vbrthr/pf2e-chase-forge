import { MODULE_ID } from "../core/constants.js";

export const CHASE_CHAT_PRESENTER_CONTRACT_VERSION = 1;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function paragraphs(text) {
  return escapeHtml(text).split(/\n{2,}/).filter(Boolean).map(value => `<p>${value.replace(/\n/g, "<br>")}</p>`).join("");
}

function imageHtml(image) {
  if (!image?.path || image.mode === "none") return "";
  const alt = escapeHtml(image.alt || "Chase obstacle");
  return `<figure class="chase-chat-image"><img src="${escapeHtml(image.path)}" alt="${alt}"></figure>`;
}

function visibleApproaches(card) {
  return (card?.approaches ?? []).filter(approach => approach?.metadata?.public !== false && approach?.hidden !== true);
}

function degreeLabel(degree) {
  const labels = {
    criticalSuccess: "Kritischer Erfolg",
    success: "Erfolg",
    failure: "Fehlschlag",
    criticalFailure: "Kritischer Fehlschlag"
  };
  return labels[degree] ?? degree ?? "Ergebnis";
}

function speaker() {
  return globalThis.ChatMessage?.getSpeaker?.({ alias: "Chase Forge" }) ?? { alias: "Chase Forge" };
}

async function createMessage(content, { whisper = null, blind = false, flags = {} } = {}) {
  if (!globalThis.ChatMessage?.create) throw new Error("ChatMessage API is unavailable.");
  const data = {
    speaker: speaker(),
    content,
    flags: { [MODULE_ID]: { ...flags } }
  };
  if (Array.isArray(whisper) && whisper.length > 0) data.whisper = whisper;
  if (blind) data.blind = true;
  return globalThis.ChatMessage.create(data);
}

export function obstacleChatHtml({ session, runtimeGroup, groupDefinition, obstacle }) {
  const card = obstacle?.card ?? null;
  const approaches = visibleApproaches(card);
  const approachHtml = approaches.length > 0
    ? `<div class="chase-chat-approaches"><strong>Mögliche Vorgehensweisen</strong><ul>${approaches.map(approach => `<li><strong>${escapeHtml(approach.label || approach.statistic || "Option")}</strong>${approach.description ? `: ${escapeHtml(approach.description)}` : ""}</li>`).join("")}</ul></div>`
    : "";
  return `<article class="pf2e-chase-forge-chat chase-chat-obstacle">
    <header><i class="fa-solid fa-person-running"></i> <strong>${escapeHtml(card?.name ?? obstacle?.node?.label ?? "Verfolgungshindernis")}</strong></header>
    ${imageHtml(card?.image)}
    <section>${paragraphs(card?.description ?? obstacle?.node?.description ?? "")}</section>
    ${approachHtml}
    <footer><span>${escapeHtml(groupDefinition?.name ?? runtimeGroup?.id ?? "Gruppe")}</span><span>Runde ${Number(session?.round ?? 0)}</span><span>Fortschritt ${Number(obstacle?.progress ?? 0)} / ${Number(obstacle?.requiredPoints ?? 0)}</span></footer>
  </article>`;
}

export function rollResultChatHtml({ participantName, approachLabel, result }) {
  const delta = Number(result?.chasePointDelta ?? 0);
  const sign = delta > 0 ? "+" : "";
  const total = Number.isFinite(Number(result?.effectiveTotal)) ? ` · Wurf ${Number(result.effectiveTotal)}` : "";
  const cleared = result?.obstacleCleared ? `<div class="chase-chat-cleared"><i class="fa-solid fa-flag-checkered"></i> Hindernis überwunden</div>` : "";
  return `<article class="pf2e-chase-forge-chat chase-chat-result">
    <header><strong>${escapeHtml(participantName || "Beteiligter")}</strong> · ${escapeHtml(approachLabel || "Aktion")}</header>
    <div class="chase-chat-degree">${escapeHtml(degreeLabel(result?.degree))}${escapeHtml(total)}</div>
    <div>Verfolgungspunkte: <strong>${escapeHtml(`${sign}${delta}`)}</strong></div>
    ${cleared}
  </article>`;
}

export function eventChatHtml({ title, text = "", icon = "fa-solid fa-person-running" } = {}) {
  return `<article class="pf2e-chase-forge-chat chase-chat-event"><header><i class="${escapeHtml(icon)}"></i> <strong>${escapeHtml(title ?? "Chase Forge")}</strong></header>${text ? `<p>${escapeHtml(text)}</p>` : ""}</article>`;
}

export function createChaseChatPresenter() {
  return Object.freeze({
    contractVersion: CHASE_CHAT_PRESENTER_CONTRACT_VERSION,
    obstacleHtml: obstacleChatHtml,
    rollResultHtml: rollResultChatHtml,
    eventHtml: eventChatHtml,
    postObstacle: (context, options = {}) => createMessage(obstacleChatHtml(context), { ...options, flags: { type: "obstacle", sessionId: context?.session?.id, runtimeGroupId: context?.runtimeGroup?.id } }),
    postRollResult: (context, options = {}) => createMessage(rollResultChatHtml(context), { ...options, flags: { type: "rollResult", sessionId: context?.sessionId ?? null } }),
    postEvent: (context, options = {}) => createMessage(eventChatHtml(context), { ...options, flags: { type: "event", ...(options.flags ?? {}) } })
  });
}
