import { ChasePf2eError } from "../core/errors.js";

function pf2eError(code, message, details = null) {
  return new ChasePf2eError(message, { code, details });
}

const PROFICIENCY_RANKS = Object.freeze({ untrained: 0, trained: 1, expert: 2, master: 3, legendary: 4 });

function unwrapActor(document) {
  if (!document) return null;
  if (document.actor) return document.actor;
  if (document.documentName === "Actor" || document.type && typeof document.getStatistic === "function") return document;
  return null;
}

function numericModifier(...candidates) {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function strikeCandidates(actor) {
  const pools = [actor?.system?.actions, actor?.actions, actor?.strikes].filter(Array.isArray);
  return pools.flat().filter(action => action && (action.type === "strike" || Array.isArray(action.variants)) && typeof action.variants?.[0]?.roll === "function");
}

function attackStatisticFromActor(actor) {
  const direct = actor?.getStatistic?.("attack")
    ?? actor?.getStatistic?.("attack-roll")
    ?? actor?.attackStatistic
    ?? null;
  if (direct) return direct;

  const strikes = strikeCandidates(actor);
  if (strikes.length === 0) return null;
  const scored = strikes.map(strike => ({
    strike,
    mod: numericModifier(
      strike.totalModifier,
      strike.modifier,
      strike.statistic?.mod,
      strike.statistic?.check?.mod,
      strike.variants?.[0]?.modifier
    )
  })).sort((a, b) => Number(b.mod ?? Number.NEGATIVE_INFINITY) - Number(a.mod ?? Number.NEGATIVE_INFINITY));
  const selected = scored[0].strike;
  const mod = scored[0].mod;
  const variant = selected.variants[0];
  return {
    slug: "attack",
    label: selected.label ?? selected.name ?? "Attack Roll",
    rank: selected.rank ?? selected.statistic?.rank ?? null,
    mod,
    modifier: mod,
    check: {
      mod,
      async roll(options = {}) {
        return variant.roll({
          dc: options.dc ?? null,
          options: Array.isArray(options.extraRollOptions) ? [...options.extraRollOptions] : [],
          modifiers: Array.isArray(options.modifiers) ? [...options.modifiers] : [],
          event: options.event ?? null
        });
      }
    }
  };
}

export class Pf2eChaseAdapter {
  constructor({ fromUuid = null } = {}) {
    this.fromUuid = fromUuid ?? globalThis.fromUuid ?? null;
  }

  isAvailable() {
    return globalThis.game?.system?.id === "pf2e" || Boolean(this.fromUuid);
  }

  async resolveActor(uuid) {
    if (!uuid || typeof uuid !== "string") throw pf2eError("ACTOR_UUID_REQUIRED", "PF2e chase actor resolution requires a UUID.", { uuid });
    if (typeof this.fromUuid !== "function") throw pf2eError("FROM_UUID_UNAVAILABLE", "Foundry fromUuid is unavailable in the current runtime.");
    const document = await this.fromUuid(uuid);
    const actor = unwrapActor(document);
    if (!actor) throw pf2eError("ACTOR_NOT_FOUND", `No PF2e Actor could be resolved from '${uuid}'.`, { uuid });
    return actor;
  }

  getStatistic(actor, slug) {
    if (!actor) throw pf2eError("ACTOR_REQUIRED", "PF2e statistic lookup requires an Actor.");
    if (!slug) throw pf2eError("STATISTIC_REQUIRED", "PF2e statistic lookup requires a statistic slug.");
    const statistic = slug === "attack"
      ? attackStatisticFromActor(actor)
      : (actor.getStatistic?.(slug)
        ?? actor.skills?.[slug]
        ?? actor.saves?.[slug]
        ?? (slug === "perception" ? actor.perception : null)
        ?? null);
    if (!statistic) throw pf2eError("STATISTIC_NOT_FOUND", `Actor does not expose statistic '${slug}'.`, { slug });
    return statistic;
  }

  getStatisticModifier(actor, slug) {
    const statistic = this.getStatistic(actor, slug);
    return numericModifier(
      statistic?.mod,
      statistic?.modifier,
      statistic?.check?.mod,
      statistic?.check?.modifier,
      statistic?.check?.totalModifier,
      statistic?.totalModifier
    );
  }

  getStatisticRank(actor, slug) {
    const statistic = this.getStatistic(actor, slug);
    for (const candidate of [statistic?.rank, statistic?.proficiencyRank, statistic?.check?.rank]) {
      const value = Number(candidate);
      if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
    }
    return null;
  }

  meetsMinimumProficiency(actor, slug, required = null) {
    if (!required) return true;
    const requiredRank = PROFICIENCY_RANKS[String(required).toLowerCase()];
    if (!Number.isInteger(requiredRank)) throw pf2eError("UNKNOWN_PROFICIENCY", `Unsupported PF2e proficiency rank '${required}'.`, { required });
    const actual = this.getStatisticRank(actor, slug);
    // NPC and other contrived statistics often do not expose a PC-style rank.
    // In that case Chase Forge leaves the final ruling to the GM rather than
    // incorrectly treating a valid NPC statistic as untrained.
    return actual === null ? true : actual >= requiredRank;
  }

  createModifier({ value = 0, type = "untyped", label = "Chase Forge", slug = "chase-forge" } = {}) {
    const modifier = Number(value);
    if (!Number.isFinite(modifier)) throw pf2eError("INVALID_MODIFIER", "PF2e check modifier must be finite.", { value });
    const Modifier = globalThis.game?.pf2e?.Modifier ?? globalThis.pf2e?.Modifier ?? null;
    if (typeof Modifier !== "function") {
      throw pf2eError("MODIFIER_API_UNAVAILABLE", "PF2e Modifier API is unavailable for a typed Chase modifier.", { type, label, slug });
    }
    return new Modifier({ slug, label, modifier, type });
  }

  async resolveStatisticModifier({ actor = null, actorUuid = null, statistic } = {}) {
    const resolvedActor = actor ?? await this.resolveActor(actorUuid);
    return this.getStatisticModifier(resolvedActor, statistic);
  }

  async rollStatistic({ actor = null, actorUuid = null, statistic, dc = null, label = null, extraRollOptions = [], modifiers = [], event = null } = {}) {
    const resolvedActor = actor ?? await this.resolveActor(actorUuid);
    const resolvedStatistic = this.getStatistic(resolvedActor, statistic);
    const roll = resolvedStatistic.check?.roll ?? resolvedStatistic.roll;
    if (typeof roll !== "function") throw pf2eError("STATISTIC_ROLL_UNAVAILABLE", `Statistic '${statistic}' does not expose a PF2e roll method.`, { statistic });

    const options = {
      extraRollOptions: Array.isArray(extraRollOptions) ? [...extraRollOptions] : [],
      event
    };
    if (Array.isArray(modifiers) && modifiers.length > 0) options.modifiers = [...modifiers];
    if (Number.isFinite(Number(dc))) options.dc = { value: Number(dc) };
    if (label) options.label = String(label);

    return roll.call(resolvedStatistic.check ?? resolvedStatistic, options);
  }
}

export function createPf2eChaseAdapter(options = {}) {
  return new Pf2eChaseAdapter(options);
}
