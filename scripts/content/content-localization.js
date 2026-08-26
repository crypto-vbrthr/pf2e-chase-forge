import { createChaseCard } from "../data/factories.js";
import { cloneData } from "../data/utils.js";

const STATISTIC_ALIASES = Object.freeze({
  acrobatics: ["acrobatics", "akrobatik"],
  arcana: ["arcana", "arkane künste", "arkane kuenste"],
  athletics: ["athletics", "athletik"],
  crafting: ["crafting", "handwerkskunst"],
  deception: ["deception", "täuschung", "taeuschung"],
  diplomacy: ["diplomacy", "diplomatie"],
  intimidation: ["intimidation", "einschüchtern", "einschuechtern"],
  medicine: ["medicine", "heilkunde"],
  nature: ["nature", "naturkunde"],
  occultism: ["occultism", "okkultismus"],
  performance: ["performance", "darbietung"],
  perception: ["perception", "wahrnehmung"],
  religion: ["religion", "religionskunde"],
  society: ["society", "gesellschaftskunde"],
  stealth: ["stealth", "heimlichkeit"],
  survival: ["survival", "überlebenskunst", "ueberlebenskunst", "überlebenskunde", "ueberlebenskunde"],
  thievery: ["thievery", "diebeskunst"],
  fortitude: ["fortitude", "zähigkeit", "zaehigkeit"],
  reflex: ["reflex"],
  will: ["will", "willen"],
  attack: ["attack", "angriff"]
});

function normalizedLabel(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

export function localizeRuntime(key, fallback = "") {
  if (!key) return fallback;
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : fallback;
}

export function localizeSkillLabel(slug) {
  const value = String(slug ?? "").trim();
  if (!value) return "";
  const entry = globalThis.CONFIG?.PF2E?.skills?.[value] ?? globalThis.CONFIG?.PF2E?.skillList?.[value] ?? null;
  const configuredKey = typeof entry === "string" ? entry : (entry?.label ?? entry?.name ?? null);
  const title = value.charAt(0).toUpperCase() + value.slice(1);
  const candidates = [configuredKey, `PF2E_CHASE_FORGE.Skill.${value}`, `PF2E.Skill.${title}`, `PF2E.Skill.${value}`].filter(Boolean);
  for (const key of candidates) {
    const translated = localizeRuntime(key, "");
    if (translated && translated !== key) return translated;
  }
  return title;
}

export function localizeStatisticLabel(slug) {
  const value = String(slug ?? "").trim();
  if (!value) return "";
  if (["fortitude", "reflex", "will", "attack"].includes(value)) {
    return localizeRuntime(`PF2E_CHASE_FORGE.Statistic.${value}`, value.charAt(0).toUpperCase() + value.slice(1));
  }
  return localizeSkillLabel(value);
}

export function localizeApproachLabel(approach) {
  const statistic = String(approach?.statistic ?? "").trim();
  const fallback = String(approach?.label ?? "").trim();
  const explicitKey = approach?.metadata?.i18n?.label ?? null;
  if (explicitKey) {
    const translated = localizeRuntime(explicitKey, "");
    if (translated) return translated;
  }
  if (!statistic) return fallback;
  const localizedStatistic = localizeStatisticLabel(statistic);
  if (!fallback) return localizedStatistic;
  const aliases = new Set([statistic, ...(STATISTIC_ALIASES[statistic] ?? [])].map(normalizedLabel));
  if (aliases.has(normalizedLabel(fallback))) return localizedStatistic;
  return fallback;
}

export function localizeNodeLabel(node, fallback = "") {
  if (!node) return fallback;
  const explicitKey = node?.metadata?.i18n?.label ?? null;
  if (explicitKey) {
    const translated = localizeRuntime(explicitKey, "");
    if (translated) return translated;
  }
  if (node.type === "merge") return localizeRuntime("PF2E_CHASE_FORGE.Builder.MergeNode", node.label || fallback || "Merge");
  return node.label || fallback || node.description || node.id || "";
}

export function localizeChaseCard(cardInput) {
  const card = createChaseCard(cardInput);
  const next = cloneData(card);
  const keys = card.metadata?.i18n ?? {};
  next.name = localizeRuntime(keys.name, card.name);
  next.description = localizeRuntime(keys.description, card.description);
  next.gmNotes = localizeRuntime(keys.gmNotes, card.gmNotes);
  next.image ??= {};
  next.image.alt = localizeRuntime(keys.imageAlt, card.image?.alt || next.name);
  next.approaches = (card.approaches ?? []).map(approach => {
    const approachKeys = keys.approaches?.[approach.id] ?? {};
    const labelFallback = localizeApproachLabel(approach) || localizeStatisticLabel(approach.statistic);
    return {
      ...cloneData(approach),
      label: localizeRuntime(approachKeys.label, labelFallback),
      description: localizeRuntime(approachKeys.description, approach.description)
    };
  });
  return createChaseCard(next);
}
