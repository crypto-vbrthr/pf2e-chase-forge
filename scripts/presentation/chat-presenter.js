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

// Chat content is stored at creation time, so every label must use the current
// Foundry world language before it is sent to ChatMessage.create.
function localize(key, fallback) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return typeof translated === "string" && translated !== key ? translated : fallback;
}

function format(key, data, fallback) {
  const translated = globalThis.game?.i18n?.format?.(key, data);
  if (typeof translated === "string" && translated !== key) return translated;
  // Also support test environments and other consumers implementing localize only.
  return localize(key, fallback).replace(/\{(\w+)\}/g, (_match, name) => String(data[name] ?? `{${name}}`));
}

function imageHtml(image) {
  if (!image?.path || image.mode === "none") return "";
  const alt = escapeHtml(image.alt || localize("PF2E_CHASE_FORGE.Chat.ObstacleFallback", "Chase obstacle"));
  return `<figure class="chase-chat-image"><img src="${escapeHtml(image.path)}" alt="${alt}"></figure>`;
}

function visibleApproaches(card) {
  return (card?.approaches ?? []).filter(approach => approach?.metadata?.public !== false && approach?.hidden !== true);
}

function degreeLabel(degree) {
  const fallback = {
    criticalSuccess: "Critical Success",
    success: "Success",
    failure: "Failure",
    criticalFailure: "Critical Failure"
  }[degree] ?? degree ?? "Result";
  return degree ? localize(`PF2E_CHASE_FORGE.Runner.Label.${degree}`, fallback) : localize("PF2E_CHASE_FORGE.Runner.Result", fallback);
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
    ? `<div class="chase-chat-approaches"><strong>${escapeHtml(localize("PF2E_CHASE_FORGE.Chat.Approaches", "Possible approaches"))}</strong><ul>${approaches.map(approach => `<li><strong>${escapeHtml(approach.label || approach.statistic || localize("PF2E_CHASE_FORGE.Chat.OptionFallback", "Option"))}</strong>${approach.description ? `: ${escapeHtml(approach.description)}` : ""}</li>`).join("")}</ul></div>`
    : "";
  const round = format("PF2E_CHASE_FORGE.Chat.Round", { round: Number(session?.round ?? 0) }, "Round {round}");
  const progress = format("PF2E_CHASE_FORGE.Chat.Progress", { progress: Number(obstacle?.progress ?? 0), required: Number(obstacle?.requiredPoints ?? 0) }, "Progress {progress} / {required}");
  return `<article class="pf2e-chase-forge-chat chase-chat-obstacle">
    <header><i class="fa-solid fa-person-running"></i> <strong>${escapeHtml(card?.name ?? obstacle?.node?.label ?? localize("PF2E_CHASE_FORGE.Chat.ObstacleFallback", "Chase obstacle"))}</strong></header>
    ${imageHtml(card?.image)}
    <section>${paragraphs(card?.description ?? obstacle?.node?.description ?? "")}</section>
    ${approachHtml}
    <footer><span>${escapeHtml(groupDefinition?.name ?? runtimeGroup?.id ?? localize("PF2E_CHASE_FORGE.Chat.GroupFallback", "Group"))}</span><span>${escapeHtml(round)}</span><span>${escapeHtml(progress)}</span></footer>
  </article>`;
}

export function rollResultChatHtml({ participantName, approachLabel, result }) {
  const delta = Number(result?.chasePointDelta ?? 0);
  const sign = delta > 0 ? "+" : "";
  const total = result?.effectiveTotal !== null && result?.effectiveTotal !== undefined && Number.isFinite(Number(result.effectiveTotal))
    ? ` · ${escapeHtml(format("PF2E_CHASE_FORGE.Chat.RollTotal", { total: Number(result.effectiveTotal) }, "Roll {total}"))}`
    : "";
  const cleared = result?.obstacleCleared ? `<div class="chase-chat-cleared"><i class="fa-solid fa-flag-checkered"></i> ${escapeHtml(localize("PF2E_CHASE_FORGE.Chat.ObstacleCleared", "Obstacle cleared"))}</div>` : "";
  return `<article class="pf2e-chase-forge-chat chase-chat-result">
    <header><strong>${escapeHtml(participantName || localize("PF2E_CHASE_FORGE.Chat.ParticipantFallback", "Participant"))}</strong> · ${escapeHtml(approachLabel || localize("PF2E_CHASE_FORGE.Chat.ActionFallback", "Action"))}</header>
    <div class="chase-chat-degree">${escapeHtml(degreeLabel(result?.degree))}${total}</div>
    <div>${escapeHtml(localize("PF2E_CHASE_FORGE.Runner.ChasePoints", "Chase Points"))}: <strong>${escapeHtml(`${sign}${delta}`)}</strong></div>
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
