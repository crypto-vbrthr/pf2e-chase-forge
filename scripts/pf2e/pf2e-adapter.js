import { ChasePf2eError } from "../core/errors.js";

function pf2eError(code, message, details = null) {
  return new ChasePf2eError(message, { code, details });
}

function unwrapActor(document) {
  if (!document) return null;
  if (document.actor) return document.actor;
  if (document.documentName === "Actor" || document.type && typeof document.getStatistic === "function") return document;
  return null;
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
    const statistic = actor.getStatistic?.(slug)
      ?? actor.skills?.[slug]
      ?? actor.saves?.[slug]
      ?? (slug === "perception" ? actor.perception : null)
      ?? null;
    if (!statistic) throw pf2eError("STATISTIC_NOT_FOUND", `Actor does not expose statistic '${slug}'.`, { slug });
    return statistic;
  }

  async rollStatistic({ actor = null, actorUuid = null, statistic, dc = null, label = null, extraRollOptions = [], event = null } = {}) {
    const resolvedActor = actor ?? await this.resolveActor(actorUuid);
    const resolvedStatistic = this.getStatistic(resolvedActor, statistic);
    const roll = resolvedStatistic.check?.roll ?? resolvedStatistic.roll;
    if (typeof roll !== "function") throw pf2eError("STATISTIC_ROLL_UNAVAILABLE", `Statistic '${statistic}' does not expose a PF2e roll method.`, { statistic });

    const options = {
      extraRollOptions: Array.isArray(extraRollOptions) ? [...extraRollOptions] : [],
      event
    };
    if (Number.isFinite(Number(dc))) options.dc = { value: Number(dc) };
    if (label) options.label = String(label);

    return roll.call(resolvedStatistic.check ?? resolvedStatistic, options);
  }
}

export function createPf2eChaseAdapter(options = {}) {
  return new Pf2eChaseAdapter(options);
}
