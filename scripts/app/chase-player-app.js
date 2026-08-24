import { MODULE_ID } from "../core/constants.js";
import { cloneData } from "../data/utils.js";

export const PLAYER_CHASE_VIEW_CONTRACT_VERSION = 1;

let playerAppClass = null;
const openPlayerApps = new Map();
const playerStates = new Map();

function i18n(key, fallback = null) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : (fallback ?? key);
}

function notify(kind, message) {
  const fn = globalThis.ui?.notifications?.[kind] ?? globalThis.ui?.notifications?.info;
  fn?.call(globalThis.ui?.notifications, message);
}

function rollNatural(roll) {
  const direct = Number(roll?.dieResult ?? roll?.natural ?? NaN);
  if (Number.isFinite(direct)) return direct;
  const dice = roll?.dice ?? roll?.roll?.dice ?? [];
  for (const die of dice) {
    if (Number(die?.faces) !== 20) continue;
    const result = (die.results ?? []).find(item => item?.active !== false && item?.discarded !== true)?.result;
    if (Number.isFinite(Number(result))) return Number(result);
  }
  return null;
}

function rollTotal(roll) {
  for (const value of [roll?.total, roll?.roll?.total, roll?._total]) if (Number.isFinite(Number(value))) return Number(value);
  return null;
}

function weatherLabel(weather) {
  if (!weather) return null;
  if (typeof weather === "string") return weather;
  return weather.label ?? weather.summary ?? weather.condition ?? null;
}

async function askProposal() {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.prompt) {
    return DialogV2.prompt({
      window: { title: i18n("PF2E_CHASE_FORGE.Player.ProposalTitle", "Andere Handlung") },
      content: `<div class="form-group stacked"><label>${i18n("PF2E_CHASE_FORGE.Player.ProposalPrompt", "Was möchtest du versuchen?")}</label><textarea name="proposal" rows="5" autofocus></textarea></div>`,
      ok: {
        label: i18n("PF2E_CHASE_FORGE.Player.Send", "Senden"),
        callback: (_event, button) => button?.form?.elements?.proposal?.value ?? ""
      }
    });
  }
  return globalThis.prompt?.(i18n("PF2E_CHASE_FORGE.Player.ProposalPrompt", "Was möchtest du versuchen?")) ?? "";
}

function getAppClass() {
  if (playerAppClass) return playerAppClass;
  const api = globalThis.foundry?.applications?.api;
  const ApplicationV2 = api?.ApplicationV2;
  const HandlebarsApplicationMixin = api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || !HandlebarsApplicationMixin) throw new Error("Foundry ApplicationV2 API is unavailable.");

  playerAppClass = class ChaseForgePlayerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "pf2e-chase-forge-player-{id}",
      classes: ["pf2e-chase-forge", "chase-forge-player"],
      tag: "section",
      position: { width: 900, height: 760 },
      window: { title: "PF2E Chase Forge", resizable: true, icon: "fa-solid fa-person-running" },
      actions: {
        rollApproach: this._actionRollApproach,
        chooseRoute: this._actionChooseRoute,
        proposeAction: this._actionProposeAction,
        refreshPlayer: this._actionRefreshPlayer
      }
    };

    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/chase-player.hbs`, scrollable: [".chase-player-scroll"] } };

    constructor(chaseApi, sessionId, state, options = {}) {
      super(options);
      this.chaseApi = chaseApi;
      this.sessionId = sessionId;
      this._state = cloneData(state);
      this._pending = false;
    }

    setState(state) {
      this._state = cloneData(state);
      return this;
    }

    async _prepareContext() {
      const state = this._state ?? playerStates.get(this.sessionId) ?? null;
      if (!state) return { missing: true, sessionId: this.sessionId };
      const actions = state.availableActions ?? [];
      const rollActions = actions.filter(action => action.type === "roll");
      const routeActions = actions.filter(action => action.type === "route");
      const proposalActions = actions.filter(action => action.type === "propose");
      const groups = (state.groups ?? []).map(group => ({
        ...cloneData(group),
        hasObstacle: Boolean(group.obstacle),
        isControlled: group.participants?.some?.(participant => participant.controlled) === true,
        myRollActions: rollActions.filter(action => action.runtimeGroupId === group.runtimeGroupId),
        canPropose: proposalActions.some(action => action.runtimeGroupId === group.runtimeGroupId),
        myRoutes: routeActions.filter(action => action.runtimeGroupId === group.runtimeGroupId),
        hasPendingDc: group.participants?.some?.(participant => participant.controlled) === true && group.obstacle?.approaches?.some?.(approach => approach.ready === false) === true
      }));
      return {
        state,
        sessionId: state.sessionId,
        title: state.title,
        status: state.status,
        statusLabel: i18n(`PF2E_CHASE_FORGE.SessionStatus.${state.status}`, state.status),
        round: state.round,
        roundPhase: state.metadata?.roundPhase ?? "idle",
        timeOfDay: state.metadata?.timeOfDay ?? null,
        weather: weatherLabel(state.metadata?.weather),
        groups,
        hasEffects: (state.personalEffects?.length ?? 0) > 0,
        personalEffects: cloneData(state.personalEffects ?? []),
        terminal: ["completed", "aborted"].includes(state.status),
        pending: this._pending
      };
    }

    async close(options = {}) {
      const result = await super.close(options);
      if (openPlayerApps.get(this.sessionId) === this) openPlayerApps.delete(this.sessionId);
      return result;
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const content = this.element?.querySelector?.(".window-content");
      content?.style?.setProperty?.("overflow-y", "auto", "important");
      content?.style?.setProperty?.("overflow-x", "hidden", "important");
    }

    async _sendIntent(intent, payload) {
      this._pending = true;
      await this.render({ force: true });
      try { return await this.chaseApi.sync.sendIntent(intent, { sessionId: this.sessionId, payload }); }
      finally { /* pending clears on result/state; timeout fallback below */ setTimeout(() => { if (this._pending) { this._pending = false; this.render({ force: true }); } }, 8000); }
    }

    receiveIntentResult(result) {
      this._pending = false;
      if (!result?.ok && result?.message) notify("error", result.message);
      else if (result?.message) notify("info", result.message);
      return this.render({ force: true });
    }

    static async _actionRollApproach(_event, target) {
      try {
        const state = this._state;
        const action = state?.availableActions?.find(candidate => candidate.type === "roll"
          && candidate.runtimeGroupId === target.dataset.runtimeGroupId
          && candidate.participantId === target.dataset.participantId
          && candidate.approach?.id === target.dataset.approachId);
        if (!action) throw new Error(i18n("PF2E_CHASE_FORGE.Player.ActionExpired", "Diese Aktion ist nicht mehr verfügbar."));
        if (!action.actorUuid) throw new Error(i18n("PF2E_CHASE_FORGE.Player.ActorMissing", "Für diesen Beteiligten ist kein Actor verknüpft."));
        const roll = await this.chaseApi.pf2e.adapter.rollStatistic({
          actorUuid: action.actorUuid,
          statistic: action.approach.statistic,
          label: action.approach.label || state.title
        });
        const total = rollTotal(roll);
        if (!Number.isFinite(total)) throw new Error(i18n("PF2E_CHASE_FORGE.Player.RollUnreadable", "Das PF2e-Wurfergebnis konnte nicht ausgewertet werden."));
        return this._sendIntent("roll", {
          runtimeGroupId: action.runtimeGroupId,
          participantId: action.participantId,
          approachId: action.approach.id,
          total,
          natural: rollNatural(roll)
        });
      } catch (error) {
        console.error(`${MODULE_ID} | Player Chase roll failed.`, error);
        notify("error", error?.message ?? String(error));
      }
    }

    static async _actionChooseRoute(_event, target) {
      try {
        return this._sendIntent("route", { runtimeGroupId: target.dataset.runtimeGroupId, edgeId: target.dataset.edgeId });
      } catch (error) { console.error(error); notify("error", error?.message ?? String(error)); }
    }

    static async _actionProposeAction(_event, target) {
      try {
        const text = String(await askProposal() ?? "").trim();
        if (!text) return;
        return this._sendIntent("propose", { runtimeGroupId: target.dataset.runtimeGroupId, participantId: target.dataset.participantId, text });
      } catch (error) { console.error(error); notify("error", error?.message ?? String(error)); }
    }

    static async _actionRefreshPlayer() {
      try { return this._sendIntent("requestState", {}); }
      catch (error) { console.error(error); notify("error", error?.message ?? String(error)); }
    }
  };
  return playerAppClass;
}

export function createChasePlayerUiService({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  return Object.freeze({
    contractVersion: PLAYER_CHASE_VIEW_CONTRACT_VERSION,
    async receiveState(state, { open = true } = {}) {
      if (!state?.sessionId || globalThis.game?.user?.isGM === true) return null;
      playerStates.set(state.sessionId, cloneData(state));
      const existing = openPlayerApps.get(state.sessionId) ?? null;
      if (existing) {
        existing.setState(state);
        await existing.render({ force: true });
        return existing;
      }
      if (!open || !["active", "paused"].includes(state.status)) return null;
      return this.openPlayerView({ sessionId: state.sessionId, state });
    },
    receiveIntentResult(result) {
      const app = result?.sessionId ? openPlayerApps.get(result.sessionId) : null;
      app?.receiveIntentResult?.(result);
    },
    async openPlayerView({ sessionId, state = null } = {}) {
      if (globalThis.game?.user?.isGM === true) return null;
      if (!sessionId) throw new Error("openPlayerView requires a sessionId.");
      const chaseApi = getApi();
      const resolvedState = state ?? playerStates.get(sessionId) ?? null;
      if (!resolvedState) {
        await chaseApi?.sync?.requestState?.(sessionId);
        notify("info", i18n("PF2E_CHASE_FORGE.Player.Requested", "Spieleransicht wird von der Spielleitung angefordert."));
        return null;
      }
      let app = openPlayerApps.get(sessionId) ?? null;
      if (!app) {
        const App = getAppClass();
        app = new App(chaseApi, sessionId, resolvedState, { id: `pf2e-chase-forge-player-${sessionId}` });
        openPlayerApps.set(sessionId, app);
      } else app.setState(resolvedState);
      await app.render({ force: true });
      return app;
    },
    getState(sessionId) { return cloneData(playerStates.get(sessionId) ?? null); },
    getOpenPlayerView(sessionId) { return openPlayerApps.get(sessionId) ?? null; },
    getOpenPlayerViews() { return [...openPlayerApps.values()]; },
    async closePlayerView(sessionId) {
      const app = openPlayerApps.get(sessionId);
      if (!app) return false;
      await app.close();
      openPlayerApps.delete(sessionId);
      return true;
    },
    async closeAllPlayerViews() {
      for (const [sessionId, app] of [...openPlayerApps]) {
        await app.close();
        openPlayerApps.delete(sessionId);
      }
      return true;
    }
  });
}
