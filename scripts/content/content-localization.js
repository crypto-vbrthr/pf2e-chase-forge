import { createChaseCard } from "../data/factories.js";
import { cloneData } from "../data/utils.js";

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
    const labelFallback = card.metadata?.coreCard === true && approach.statistic
      ? localizeSkillLabel(approach.statistic)
      : (approach.label || localizeSkillLabel(approach.statistic));
    return {
      ...cloneData(approach),
      label: localizeRuntime(approachKeys.label, labelFallback),
      description: localizeRuntime(approachKeys.description, approach.description)
    };
  });
  return createChaseCard(next);
}
