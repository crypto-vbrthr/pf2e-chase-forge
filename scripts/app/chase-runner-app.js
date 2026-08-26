import { MODULE_ID } from "../core/constants.js";
import { cloneData } from "../data/utils.js";
import { buildGraphIndex, topologicalSort } from "../data/graph.js";
import { openChaseImage } from "../images/image-popout.js";
import { createChaseChatPresenter } from "../presentation/chat-presenter.js";
import { localizeApproachLabel, localizeChaseCard, localizeNodeLabel, localizeStatisticLabel } from "../content/content-localization.js";

export const GM_RUNNER_CONTRACT_VERSION = 1;

let runnerAppClass = null;
let openRunnerApps = new Map();

function i18n(key, fallback = null) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : (fallback ?? key);
}

function format(key, data = {}, fallback = null) {
  const translated = globalThis.game?.i18n?.format?.(key, data);
  return translated && translated !== key ? translated : (fallback ?? key);
}

function notify(kind, message) {
  const fn = globalThis.ui?.notifications?.[kind] ?? globalThis.ui?.notifications?.info;
  fn?.call(globalThis.ui?.notifications, message);
}

function escapeHtml(value) {
  if (typeof globalThis.foundry?.utils?.escapeHTML === "function") return globalThis.foundry.utils.escapeHTML(String(value ?? ""));
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function isGm() { return globalThis.game?.user?.isGM === true; }

async function confirmAbortSession() {
  const message = i18n("PF2E_CHASE_FORGE.Runner.AbortConfirm", "Verfolgungsjagd wirklich abbrechen?");
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    return Boolean(await DialogV2.confirm({
      window: { title: i18n("PF2E_CHASE_FORGE.Runner.Abort", "Abbrechen") },
      content: `<p>${escapeHtml(message)}</p>`,
      modal: true
    }));
  }
  return globalThis.confirm?.(message) ?? true;
}

function optionLabel(value) {
  const map = {
    quarry: "Flüchtige", pursuer: "Verfolger", competitor: "Wettläufer", participant: "Beteiligte",
    active: "Aktiv", paused: "Pausiert", draft: "Entwurf", completed: "Beendet", aborted: "Abgebrochen",
    criticalSuccess: "Kritischer Erfolg", success: "Erfolg", failure: "Fehlschlag", criticalFailure: "Kritischer Fehlschlag",
    pendingConfirmation: "Bestätigung ausstehend", pendingSelection: "Auswahl ausstehend", manualFallback: "Manuell anwenden",
    blocked: "Blockiert", failed: "Fehlgeschlagen", applied: "Angewendet", skipped: "Übersprungen",
    quarryEscaped: "Flüchtige entkommen", quarryCaught: "Flüchtige eingeholt", goalReached: "Ziel erreicht", timeExpired: "Zeit abgelaufen", raceWon: "Rennen gewonnen"
  };
  const fallback = map[value] ?? value ?? "";
  return i18n(`PF2E_CHASE_FORGE.Runner.Label.${value}`, fallback);
}

function resolveBlueprintGroup(session, runtimeGroup) {
  return session?.blueprintSnapshot?.groups?.find(group => group.id === runtimeGroup?.groupId) ?? null;
}

function resolveParticipant(session, participantId) {
  for (const group of session?.blueprintSnapshot?.groups ?? []) {
    const participant = group.participants?.find(candidate => candidate.id === participantId);
    if (participant) return participant;
  }
  return null;
}

function resolveCard(api, session, cardRef) {
  const snapshot = session?.blueprintSnapshot?.contentSnapshots?.cards?.find(record => record.ref === cardRef)?.data ?? null;
  if (session?.blueprintSnapshot?.contentSnapshots?.mode === "snapshot" && snapshot) return localizeChaseCard(snapshot);
  const resolved = api?.cards?.get?.(cardRef, { includeDisabled: true }) ?? (snapshot ? cloneData(snapshot) : null);
  return resolved ? localizeChaseCard(resolved) : null;
}

function resolveCardById(api, session, cardId) {
  const snapshot = session?.blueprintSnapshot?.contentSnapshots?.cards?.find(record => record?.data?.id === cardId || record?.ref === cardId)?.data ?? null;
  const resolved = snapshot ? cloneData(snapshot) : (api?.cards?.get?.(cardId, { includeDisabled: true }) ?? null);
  return resolved ? localizeChaseCard(resolved) : null;
}

function reconstructOccurrence(api, session, record) {
  const card = resolveCardById(api, session, record.cardId);
  const approach = card?.approaches?.find(item => item.id === record.approachId) ?? null;
  const candidates = [
    ...(approach?.outcomes?.[record.degree] ?? []),
    ...(card?.outcomes?.[record.degree] ?? [])
  ];
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
  for (const value of [roll?.total, roll?.roll?.total, roll?._total]) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}


function storedGmDc(session, cardId, approachId) {
  const value = session?.metadata?.runner?.gmDcs?.[cardId]?.[approachId];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function setStoredGmDc(api, session, cardId, approachId, value) {
  if (!Number.isFinite(Number(value))) return session;
  const next = cloneData(session);
  next.metadata ??= {};
  next.metadata.runner ??= {};
  next.metadata.runner.gmDcs ??= {};
  next.metadata.runner.gmDcs[cardId] ??= {};
  next.metadata.runner.gmDcs[cardId][approachId] = Number(value);
  return api.factories.session(next);
}

function degreeOptions(selected = "success") {
  return ["criticalSuccess", "success", "failure", "criticalFailure"].map(value => ({ value, selected: value === selected, label: optionLabel(value) }));
}

function signedPoints(value) {
  const amount = Number(value ?? 0);
  return amount > 0 ? `+${amount}` : String(amount);
}

function signedModifier(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount >= 0 ? `+${amount}` : String(amount);
}

async function participantApproachStats(api, participant, approaches) {
  const actorUuid = participant?.uuid ?? participant?.metadata?.actorUuid ?? null;
  if (!actorUuid) return new Map();
  let actor = null;
  try { actor = await api?.pf2e?.adapter?.resolveActor?.(actorUuid); }
  catch { return new Map(); }
  const result = new Map();
  for (const approach of approaches ?? []) {
    if (!approach?.statistic) continue;
    try {
      const modifier = api?.pf2e?.adapter?.getStatisticModifier?.(actor, approach.statistic);
      const rank = api?.pf2e?.adapter?.getStatisticRank?.(actor, approach.statistic) ?? null;
      const eligible = api?.pf2e?.adapter?.meetsMinimumProficiency?.(actor, approach.statistic, approach.minimumProficiency) ?? true;
      result.set(approach.id, { modifier: Number.isFinite(Number(modifier)) ? Number(modifier) : null, rank, eligible });
    } catch { result.set(approach.id, { modifier: null, rank: null, eligible: false }); }
  }
  return result;
}

function lastParticipantResult(session, runtimeGroupId, participantId) {
  const currentRound = Number(session?.round ?? 0);
  const record = [...(session?.events ?? [])].reverse().find(item =>
    item?.round === currentRound
    && item?.participantId === participantId
    && ["checkResolved", "automaticContribution", "participantSkipped"].includes(item?.type)
  );
  if (!record) return null;

  const pointsKey = "PF2E_CHASE_FORGE.Runner.ChasePointsShort";
  const pointsLabel = i18n(pointsKey, "VP");
  if (record.type === "checkResolved") {
    const degree = optionLabel(record.degree);
    const delta = Number(record.chasePointDelta ?? 0);
    return {
      type: record.degree ?? "check",
      label: `${degree} · ${signedPoints(delta)} ${pointsLabel}`,
      degree: record.degree ?? null,
      chasePointDelta: delta
    };
  }
  if (record.type === "automaticContribution") {
    const delta = Number(record.points ?? 0);
    return {
      type: "automatic",
      label: `${i18n("PF2E_CHASE_FORGE.Runner.AutomaticResult", "Automatisch")} · ${signedPoints(delta)} ${pointsLabel}`,
      degree: null,
      chasePointDelta: delta
    };
  }
  const delta = Number(record.penalty ?? 0);
  return {
    type: "skipped",
    label: `${i18n("PF2E_CHASE_FORGE.Runner.Skipped", "Ausgesetzt")} · ${signedPoints(delta)} ${pointsLabel}`,
    degree: null,
    chasePointDelta: delta
  };
}

function groupCurrentNode(session, runtimeGroup) {
  return session?.blueprintSnapshot?.graph?.nodes?.find(node => node.id === runtimeGroup?.position?.nodeId) ?? null;
}

function runtimeGroupDisplayName(session, runtimeGroup) {
  const definition = resolveBlueprintGroup(session, runtimeGroup);
  const allIds = definition?.participants?.map?.(item => item.id) ?? [];
  const split = Boolean(runtimeGroup?.parentRuntimeGroupId) || (allIds.length > 0 && runtimeGroup?.participantIds?.length !== allIds.length);
  if (!split) return definition?.name || runtimeGroup?.groupId || runtimeGroup?.id || "Gruppe";
  const names = (runtimeGroup?.participantIds ?? []).map(id => resolveParticipant(session, id)?.name || id);
  return names.join(" + ") || definition?.name || runtimeGroup?.groupId || runtimeGroup?.id || "Gruppe";
}

function buildRouteMonitor(api, session, orderState = null) {
  const graph = session?.blueprintSnapshot?.graph;
  if (!graph?.nodes?.length) return { rows: [], distances: [], groupCount: 0 };
  let order = [];
  try { order = topologicalSort(graph); } catch { order = graph.nodes.map(node => node.id); }
  const { incoming } = buildGraphIndex(graph);
  const depth = new Map();
  for (const nodeId of order) {
    const predecessors = incoming.get(nodeId) ?? [];
    const base = predecessors.length ? Math.max(...predecessors.map(edge => depth.get(edge.from) ?? 0)) + 1 : 0;
    depth.set(nodeId, base);
  }
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const nodeViews = graph.nodes.map(node => {
    let label = localizeNodeLabel(node, node.description || node.id);
    if (node.type === "card" && node.cardRef) {
      const card = resolveCard(api, session, node.cardRef);
      label = card?.name || label;
    }
    const markers = (session.groups ?? []).filter(group => group.position?.nodeId === node.id).map(group => {
      let remaining = null;
      try { remaining = api?.rules?.getShortestRemainingDistance?.(session, group.id); } catch { remaining = null; }
      return {
        runtimeGroupId: group.id,
        name: runtimeGroupDisplayName(session, group),
        role: resolveBlueprintGroup(session, group)?.role || "participant",
        active: orderState?.activeRuntimeGroupId === group.id,
        recommended: orderState?.recommendedRuntimeGroupId === group.id,
        canActivate: (orderState?.candidates ?? []).some(item => item.runtimeGroupId === group.id),
        remaining: Number.isFinite(Number(remaining)) ? Number(remaining) : null,
        actedCount: (group.participantIds ?? []).filter(id => session.roundState?.actedParticipantIds?.includes?.(id)).length,
        participantCount: group.participantIds?.length ?? 0
      };
    });
    return {
      id: node.id,
      type: node.type,
      label,
      depth: depth.get(node.id) ?? 0,
      orderIndex: orderIndex.get(node.id) ?? 0,
      markers,
      hasGroups: markers.length > 0
    };
  });
  const rowsByDepth = new Map();
  for (const node of nodeViews) {
    const list = rowsByDepth.get(node.depth) ?? [];
    list.push(node);
    rowsByDepth.set(node.depth, list);
  }
  const rows = [...rowsByDepth.entries()].sort((a, b) => a[0] - b[0]).map(([row, nodes]) => ({
    row,
    nodes: nodes.sort((a, b) => a.orderIndex - b.orderIndex),
    branched: nodes.length > 1
  }));
  const selectedId = orderState?.activeRuntimeGroupId ?? orderState?.recommendedRuntimeGroupId ?? session.groups?.[0]?.id ?? null;
  const selected = session.groups?.find(group => group.id === selectedId) ?? null;
  const distances = selected ? (session.groups ?? []).filter(group => group.id !== selected.id).map(group => {
    let distance = null;
    try { distance = api?.rules?.getShortestGroupDistance?.(session, selected.id, group.id); } catch { distance = null; }
    return {
      runtimeGroupId: group.id,
      name: runtimeGroupDisplayName(session, group),
      distance: Number.isFinite(Number(distance)) ? Number(distance) : null
    };
  }).filter(item => item.distance !== null) : [];
  return {
    rows,
    distances,
    groupCount: session.groups?.length ?? 0,
    selectedGroupName: selected ? runtimeGroupDisplayName(session, selected) : null
  };
}

async function resolveBlueprintImage(api, session) {
  try {
    const image = await api?.images?.resolveBlueprint?.(session?.blueprintSnapshot);
    if (image?.path) return { path: image.path, alt: image.alt || session?.blueprintSnapshot?.image?.alt || session?.blueprintSnapshot?.name || "" };
  } catch { /* manual fallback */ }
  const image = session?.blueprintSnapshot?.image ?? {};
  return image?.path ? { path: image.path, alt: image.alt || session?.blueprintSnapshot?.name || "" } : null;
}

function terminalSummary(session, chaseImage = null) {
  if (!["completed", "aborted"].includes(session?.status)) return null;
  const completed = [...(session?.events ?? [])].reverse().find(item => item?.type === "chaseCompleted") ?? null;
  const aborted = [...(session?.events ?? [])].reverse().find(item => item?.type === "sessionAborted") ?? null;
  const outcome = completed?.outcome ?? (aborted ? "aborted" : null);
  const winnerIds = completed?.winnerGroupIds ?? [];
  const loserIds = completed?.loserGroupIds ?? [];
  const endingNodeId = session?.groups?.find(group => winnerIds.includes(group.id))?.position?.nodeId
    ?? session?.groups?.find(group => loserIds.includes(group.id))?.position?.nodeId
    ?? null;
  const endingNode = session?.blueprintSnapshot?.graph?.nodes?.find(node => node.id === endingNodeId) ?? null;
  const image = endingNode?.image?.path ? { path: endingNode.image.path, alt: endingNode.image.alt || endingNode.label || session?.blueprintSnapshot?.name || "" } : chaseImage;
  const names = ids => ids.map(id => {
    const runtime = session?.groups?.find(group => group.id === id);
    return resolveBlueprintGroup(session, runtime)?.name || runtime?.groupId || id;
  });
  return { outcome, outcomeLabel: optionLabel(outcome), reason: completed?.reason ?? (aborted ? "aborted" : null), winnerNames: names(winnerIds), loserNames: names(loserIds), endingNodeId, endingLabel: localizeNodeLabel(endingNode, endingNode?.label || ""), endingDescription: endingNode?.description || "", image };
}

async function bringRunnerToFront(app) {
  try { app?.bringToFront?.(); } catch { /* compatibility */ }
  await new Promise(resolve => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)));
  const element = app?.element ?? null;
  if (!element) return;
  try { element.setAttribute?.("tabindex", "-1"); } catch { /* ignore */ }
  try { element.focus?.({ preventScroll: true }); } catch { try { element.focus?.(); } catch { /* ignore */ } }
}

function routeLabel(session, edge) {
  const node = session.blueprintSnapshot.graph.nodes.find(item => item.id === edge.to);
  return edge.label || localizeNodeLabel(node, node?.description || edge.to);
}

async function maybePersistOutcome(api, session, { phase = "immediate" } = {}) {
  const resolution = api.rules.resolveRuntimeOutcomes?.(session, { phase }) ?? { session, evaluation: api.rules.evaluateOutcome(session, { phase }) };
  session = resolution.session;
  const evaluation = resolution.evaluation;
  if (!evaluation.ended) {
    const saved = await api.sessionManager.saveSession(session);
    return { session: saved, outcome: evaluation, completed: null };
  }
  await api.sessionManager.saveSession(session);
  const completed = await api.sessionManager.finishSession(session.id, evaluation);
  return { session: completed.session, outcome: evaluation, completed };
}

async function refreshOpenBuilder(api) {
  const builder = api?.ui?.getOpenBuilder?.() ?? null;
  if (!builder?.render) return false;
  try { await builder.render({ force: true }); return true; }
  catch (error) { console.warn(`${MODULE_ID} | Failed to refresh Chase Builder session list.`, error); return false; }
}

function getAppClass() {
  if (runnerAppClass) return runnerAppClass;
  const api = globalThis.foundry?.applications?.api;
  const ApplicationV2 = api?.ApplicationV2;
  const HandlebarsApplicationMixin = api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || !HandlebarsApplicationMixin) throw new Error("Foundry ApplicationV2 API is unavailable.");

  runnerAppClass = class ChaseForgeRunnerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "pf2e-chase-forge-runner-{id}",
      classes: ["pf2e-chase-forge", "chase-forge-runner"],
      tag: "section",
      position: { width: 1180, height: 820 },
      window: { title: "PF2E Chase Forge · GM Runner", resizable: true },
      actions: {
        beginRound: this._actionBeginRound,
        endRound: this._actionEndRound,
        pauseSession: this._actionPauseSession,
        resumeSession: this._actionResumeSession,
        abortSession: this._actionAbortSession,
        postObstacle: this._actionPostObstacle,
        rollApproach: this._actionRollApproach,
        applyManualDegree: this._actionApplyManualDegree,
        automaticContribution: this._actionAutomaticContribution,
        skipParticipant: this._actionSkipParticipant,
        chooseRoute: this._actionChooseRoute,
        activateGroup: this._actionActivateGroup,
        setGroupOrderAutomatic: this._actionSetGroupOrderAutomatic,
        setGroupOrderManual: this._actionSetGroupOrderManual,
        splitGroup: this._actionSplitGroup,
        transferParticipants: this._actionTransferParticipants,
        mergeGroups: this._actionMergeGroups,
        unlockEdge: this._actionUnlockEdge,
        lockEdge: this._actionLockEdge,
        confirmConsequence: this._actionConfirmConsequence,
        selectConsequenceRoute: this._actionSelectConsequenceRoute,
        refreshRunner: this._actionRefreshRunner,
        syncPlayers: this._actionSyncPlayers,
        openImage: this._actionOpenImage
      }
    };

    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/chase-runner.hbs`, scrollable: [".chase-runner-scroll"] } };

    constructor(chaseApi, sessionId, options = {}) {
      super(options);
      this.chaseApi = chaseApi;
      this.sessionId = sessionId;
      this._session = null;
      this._completionShown = false;
      this.chat = createChaseChatPresenter();
    }

    get session() { return this._session; }

    async _load() {
      this._session = await this.chaseApi.sessionManager.getSession(this.sessionId);
      if (!this._session) throw new Error(`Chase Session '${this.sessionId}' does not exist.`);
      return this._session;
    }

    async _prepareContext() {
      const session = await this._load();
      const activeRound = session.roundState?.phase === "active";
      const turnPolicy = this.chaseApi.rules.getTurnPolicy?.(session) ?? { mode: "free", initiativeRequired: false, suggestedOrder: [] };
      const race = session.blueprintSnapshot?.settings?.chaseType === "race";
      const usesGroupOrder = ["pursuit", "escape"].includes(session.blueprintSnapshot?.settings?.chaseType);
      const groupOrderState = usesGroupOrder && this.chaseApi.rules.getGroupOrderState
        ? this.chaseApi.rules.getGroupOrderState(session)
        : { mode: "automatic", phaseRole: null, activeRuntimeGroupId: null, recommendedRuntimeGroupId: null, candidates: [] };
      const groupOrderCandidates = new Map((groupOrderState.candidates ?? []).map(item => [item.runtimeGroupId, item]));
      const groups = [];
      for (const runtimeGroup of session.groups) {
        const definition = resolveBlueprintGroup(session, runtimeGroup);
        const node = groupCurrentNode(session, runtimeGroup);
        let obstacle = null;
        if (node?.type === "card") {
          try { obstacle = this.chaseApi.rules.currentObstacle(session, runtimeGroup.id); }
          catch { obstacle = null; }
        }
        if (obstacle?.card) {
          obstacle = { ...cloneData(obstacle), card: localizeChaseCard(obstacle.card) };
          try {
            const visual = await this.chaseApi.images?.resolveCard?.(obstacle.card, { blueprint: session.blueprintSnapshot, fallbackToBlueprint: true });
            if (visual?.path) {
              obstacle = cloneData(obstacle);
              obstacle.card.image = {
                ...(obstacle.card.image ?? {}),
                mode: visual.mode ?? obstacle.card.image?.mode ?? "manual",
                path: visual.path,
                alt: visual.alt || obstacle.card.image?.alt || obstacle.card.name || "",
                providerId: visual.providerId ?? obstacle.card.image?.providerId ?? null,
                imageId: visual.id ?? obstacle.card.image?.imageId ?? null
              };
              obstacle.card.metadata = { ...(obstacle.card.metadata ?? {}), resolvedVisual: cloneData(visual) };
            }
          } catch (error) {
            console.warn(`${MODULE_ID} | Failed to resolve Runner obstacle image.`, error);
          }
        }
        const approaches = (obstacle?.card?.approaches ?? []).map(approach => {
          const savedGmDc = storedGmDc(session, obstacle?.card?.id, approach.id);
          let dc = null;
          try {
            dc = this.chaseApi.pf2e.dc.resolveApproach(approach, { partyLevel: session.blueprintSnapshot.settings.partyLevel, gmDc: savedGmDc });
          } catch { dc = null; }
          return {
            ...cloneData(approach),
            label: localizeApproachLabel(approach),
            statisticLabel: localizeStatisticLabel(approach.statistic),
            dcResolved: dc?.value ?? savedGmDc ?? null,
            dcMode: dc?.mode ?? approach.dc?.mode ?? null,
            storedGmDc: savedGmDc,
            needsGmDc: (approach.dc?.mode ?? "gm") === "gm",
            minimumProficiencyLabel: approach.minimumProficiency ? i18n(`PF2E_CHASE_FORGE.Proficiency.${approach.minimumProficiency}`, approach.minimumProficiency) : null
          };
        });
        const groupTurnAllowed = this.chaseApi.rules.canGroupAct?.(session, runtimeGroup.id) ?? true;
        const participants = [];
        for (const participantId of runtimeGroup.participantIds) {
          const participant = resolveParticipant(session, participantId) ?? { id: participantId, name: participantId, uuid: null, image: null };
          const participantTurnAllowed = this.chaseApi.rules.canParticipantAct?.(session, runtimeGroup.id, participantId)
            ?? (activeRound && groupTurnAllowed && runtimeGroup.rules.paceMode === "roll" && !runtimeGroup.completed && !session.roundState.actedParticipantIds.includes(participantId));
          const approachStats = await participantApproachStats(this.chaseApi, participant, approaches);
          participants.push({
            ...cloneData(participant),
            acted: session.roundState.actedParticipantIds.includes(participantId),
            skipped: session.roundState.skippedParticipantIds.includes(participantId),
            canAct: Boolean(participantTurnAllowed),
            lastResult: lastParticipantResult(session, runtimeGroup.id, participantId),
            degreeOptions: degreeOptions("success"),
            approaches: approaches.map(approach => {
              const stats = approachStats.get(approach.id) ?? { modifier: null, rank: null, eligible: true };
              return {
                ...cloneData(approach),
                statisticModifier: stats.modifier,
                modifierLabel: signedModifier(stats.modifier),
                statisticRank: stats.rank,
                eligible: stats.eligible !== false,
                minimumProficiencyLabel: approach.minimumProficiency ? i18n(`PF2E_CHASE_FORGE.Proficiency.${approach.minimumProficiency}`, approach.minimumProficiency) : null
              };
            }),
            manualApproaches: approaches.map(approach => ({ value: approach.id, label: approach.label || approach.statistic || approach.id }))
          });
        }
        let transitions = [];
        try { transitions = this.chaseApi.route.availableTransitions(session, runtimeGroup.id).map(item => ({ edgeId: item.edge.id, label: routeLabel(session, item.edge), type: item.edge.type, visibility: item.edge.visibility })); }
        catch { transitions = []; }
        const cardCleared = node?.type === "card" && session.nodeState?.[node.id]?.groups?.[runtimeGroup.id]?.cleared === true;
        const routeChoiceAvailable = (node?.type === "choice" || cardCleared) && transitions.length > 0;
        const availableEdgeIds = new Set(transitions.map(item => item.edgeId));
        const outgoingEdges = (session.blueprintSnapshot?.graph?.edges ?? []).filter(edge => edge.from === node?.id).map(edge => ({
          edgeId: edge.id,
          label: routeLabel(session, edge),
          type: edge.type,
          visibility: edge.visibility,
          available: availableEdgeIds.has(edge.id),
          explicitlyUnlocked: session.unlockedEdgeIds.includes(edge.id),
          explicitlyLocked: session.lockedEdgeIds.includes(edge.id)
        }));
        let obstacleIndex = null;
        try { obstacleIndex = this.chaseApi.rules.getObstacleIndex(session, runtimeGroup.id); } catch { obstacleIndex = null; }
        const splitState = this.chaseApi.rules.canSplitRuntimeGroup?.(session, runtimeGroup.id) ?? { allowed: false };
        const mergeCandidates = session.groups.filter(other => other.id !== runtimeGroup.id).filter(other => {
          try { return this.chaseApi.rules.canMergeRuntimeGroups?.(session, [runtimeGroup.id, other.id])?.allowed === true; } catch { return false; }
        }).map(other => ({ runtimeGroupId: other.id, name: runtimeGroupDisplayName(session, other) }));
        const transferCandidates = session.groups.filter(other => other.id !== runtimeGroup.id).filter(other => {
          try { return this.chaseApi.rules.canTransferParticipants?.(session, runtimeGroup.id, other.id)?.allowed === true; } catch { return false; }
        }).map(other => ({ runtimeGroupId: other.id, name: runtimeGroupDisplayName(session, other) }));
        const orderCandidate = groupOrderCandidates.get(runtimeGroup.id) ?? null;
        const splitParticipants = participants.map(participant => ({ id: participant.id, name: participant.name, acted: participant.acted }));
        const runtimeResolution = runtimeGroup.metadata?.runtimeResolution ?? null;
        const runtimeResolved = runtimeGroup.completed === true || runtimeResolution?.terminal === true;
        const resolvedStatusLabel = runtimeResolution?.outcome === "caught"
          ? i18n("PF2E_CHASE_FORGE.Runner.GroupCaught", "Eingeholt")
          : (runtimeResolution?.outcome === "escaped" ? i18n("PF2E_CHASE_FORGE.Runner.GroupEscaped", "Entkommen") : null);
        groups.push({
          runtime: cloneData(runtimeGroup), definition: cloneData(definition ?? { id: runtimeGroup.groupId, name: runtimeGroup.groupId, role: "participant" }),
          displayName: runtimeGroupDisplayName(session, runtimeGroup),
          roleLabel: optionLabel(definition?.role), node: node ? { ...cloneData(node), label: localizeNodeLabel(node) } : null, obstacle: obstacle ? cloneData(obstacle) : null,
          approaches, participants, transitions, outgoingEdges,
          hasOutgoingEdges: outgoingEdges.length > 0,
          obstacleIndex,
          routeChoiceAvailable,
          isActiveGroup: groupOrderState.activeRuntimeGroupId === runtimeGroup.id,
          isRecommendedGroup: groupOrderState.recommendedRuntimeGroupId === runtimeGroup.id,
          canActivateGroup: activeRound && !race && Boolean(orderCandidate) && groupOrderState.activeRuntimeGroupId !== runtimeGroup.id,
          distanceToEnd: Number.isFinite(Number(orderCandidate?.distance)) ? Number(orderCandidate.distance) : null,
          unactedCount: orderCandidate?.unactedCount ?? 0,
          actedCount: orderCandidate?.actedCount ?? participants.filter(item => item.acted).length,
          splitAllowed: splitState.allowed === true,
          splitReason: splitState.reason ?? null,
          splitParticipants,
          canManageGroup: splitState.allowed === true || transferCandidates.length > 0,
          transferCandidates,
          hasTransferCandidates: transferCandidates.length > 0,
          mergeCandidates,
          hasMergeCandidates: mergeCandidates.length > 0,
          runtimeResolved,
          runtimeResolution: runtimeResolution ? cloneData(runtimeResolution) : null,
          turnBlocked: activeRound && runtimeGroup.rules.paceMode === "roll" && !runtimeResolved && !groupTurnAllowed,
          turnBlockedReason: race ? "initiative" : (usesGroupOrder && Boolean(orderCandidate) ? "groupOrder" : "quarry"),
          waitingForInitiative: race && activeRound && runtimeGroup.rules.paceMode === "roll" && !runtimeResolved && !groupTurnAllowed,
          waitingForGroupOrder: !race && usesGroupOrder && activeRound && Boolean(orderCandidate) && !groupTurnAllowed,
          paceLabel: runtimeGroup.rules.paceMode === "steady" ? "Konstantes Tempo" : "Proben",
          statusLabel: resolvedStatusLabel ?? (runtimeGroup.completed ? "Am Ziel" : (node?.type === "card" ? "Am Hindernis" : (node?.type === "choice" ? "Wegentscheidung" : node?.type ?? "Unterwegs")))
        });
      }
      const consequenceRecords = (session.consequenceState?.records ?? []).filter(record => ["pendingConfirmation", "pendingSelection", "manualFallback", "blocked", "failed"].includes(record.status)).map(record => {
        const edgeIds = record.result?.edgeIds ?? [];
        const occurrence = reconstructOccurrence(this.chaseApi, session, record);
        return {
          ...cloneData(record), consequenceLabel: occurrence?.consequence?.label || record.consequenceId, statusLabel: optionLabel(record.status),
          canConfirm: record.status === "pendingConfirmation",
          needsRouteSelection: record.status === "pendingSelection",
          routeChoices: edgeIds.map(edgeId => {
            const edge = session.blueprintSnapshot.graph.edges.find(item => item.id === edgeId);
            return { edgeId, label: edge ? routeLabel(session, edge) : edgeId };
          })
        };
      });
      const chaseImage = await resolveBlueprintImage(this.chaseApi, session);
      const completion = terminalSummary(session, chaseImage);
      const initiativeEntries = race
        ? (this.chaseApi.rules.getRaceInitiativeEntries?.(session) ?? []).map((entry, index) => ({ ...entry, index, initiative: "" }))
        : [];
      const initiativeByParticipant = new Map(initiativeEntries.map(entry => [entry.participantId, entry]));
      const currentRaceParticipantId = race ? (this.chaseApi.rules.getNextRaceParticipantId?.(session) ?? null) : null;
      const initiativeOrderDisplay = (session.roundState?.initiativeOrder ?? []).map((participantId, index) => {
        const entry = initiativeByParticipant.get(participantId) ?? { participantId, participantName: participantId, groupName: "" };
        return { ...entry, order: index + 1, current: participantId === currentRaceParticipantId, acted: session.roundState.actedParticipantIds.includes(participantId) };
      });
      const routeMonitor = buildRouteMonitor(this.chaseApi, session, groupOrderState);
      return {
        session: cloneData(session),
        title: session.blueprintSnapshot?.name ?? session.id,
        statusLabel: optionLabel(session.status),
        groups,
        activeRound,
        race,
        usesGroupOrder,
        groupOrderState,
        groupOrderAutomatic: groupOrderState.mode === "automatic",
        groupOrderManual: groupOrderState.mode === "manual",
        routeMonitor,
        raceInitiativeRequired: race && initiativeEntries.length > 0,
        initiativeEntries,
        initiativeOrderDisplay,
        currentRaceParticipantId,
        canBeginRound: session.status === "active" && session.roundState.phase !== "active",
        canEndRound: session.status === "active" && activeRound,
        canPause: session.status === "active",
        canResume: session.status === "paused",
        terminal: ["completed", "aborted"].includes(session.status),
        chaseImage,
        completion,
        consequenceRecords,
        hasConsequences: consequenceRecords.length > 0,
        weather: session.blueprintSnapshot?.settings?.weather?.label ?? session.blueprintSnapshot?.settings?.weather ?? null,
        timeOfDay: session.blueprintSnapshot?.settings?.timeOfDay ?? null
      };
    }

    async close(options = {}) {
      const result = await super.close(options);
      if (openRunnerApps.get(this.sessionId) === this) openRunnerApps.delete(this.sessionId);
      return result;
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const content = this.element?.querySelector?.(".window-content");
      if (content?.style?.setProperty) {
        content.style.setProperty("padding", "0", "important");
        content.style.setProperty("min-height", "0", "important");
        content.style.setProperty("overflow", "hidden", "important");
      }
      const part = content?.querySelector?.("[data-application-part]");
      if (part?.style?.setProperty) {
        part.style.setProperty("height", "100%", "important");
        part.style.setProperty("min-height", "0", "important");
        part.style.setProperty("overflow", "hidden", "important");
      }
      const scroller = this.element?.querySelector?.(".chase-runner-scroll");
      if (scroller?.style?.setProperty) {
        scroller.style.setProperty("min-height", "0", "important");
        scroller.style.setProperty("overflow-y", "auto", "important");
        scroller.style.setProperty("overflow-x", "hidden", "important");
      }
    }

    async _showCompletion(completedSession, outcome) {
      if (this._completionShown || !outcome?.ended) return;
      this._completionShown = true;
      const summary = terminalSummary(completedSession, await resolveBlueprintImage(this.chaseApi, completedSession));
      notify("info", format("PF2E_CHASE_FORGE.Runner.ChaseFinishedNotice", { result: summary?.outcomeLabel ?? outcome.outcome }, `Verfolgungsjagd beendet: ${summary?.outcomeLabel ?? outcome.outcome}`));
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      if (!DialogV2?.wait) return;
      const image = summary?.image?.path ? `<img class="chase-completion-dialog-image" src="${escapeHtml(summary.image.path)}" alt="${escapeHtml(summary.image.alt || "")}">` : "";
      const winners = summary?.winnerNames?.length ? `<p><strong>${escapeHtml(i18n("PF2E_CHASE_FORGE.Runner.Winners", "Sieger"))}:</strong> ${summary.winnerNames.map(escapeHtml).join(", ")}</p>` : "";
      const ending = summary?.endingDescription ? `<p>${escapeHtml(summary.endingDescription)}</p>` : "";
      await DialogV2.wait({
        window: { title: i18n("PF2E_CHASE_FORGE.Runner.ChaseFinished", "Verfolgungsjagd beendet") },
        content: `<div class="chase-completion-dialog">${image}<h3>${escapeHtml(summary?.outcomeLabel ?? outcome.outcome)}</h3>${ending}${winners}</div>`,
        buttons: [{ action: "close", label: i18n("PF2E_CHASE_FORGE.Common.Close", "Schließen"), default: true }]
      }).catch(() => null);
    }

    async _saveOrFinish(session, options = {}) {
      const persisted = await maybePersistOutcome(this.chaseApi, session, options);
      this._session = persisted.session;
      await this.chaseApi.sync?.publishSession?.(persisted.session, { open: true });
      if (persisted.completed) {
        await this.chat.postEvent({ title: i18n("PF2E_CHASE_FORGE.Runner.ChaseFinished", "Verfolgungsjagd beendet"), text: `${i18n("PF2E_CHASE_FORGE.Runner.Result", "Ergebnis")}: ${optionLabel(persisted.outcome.outcome)}` }, { flags: { sessionId: session.id } }).catch(() => null);
        await this._showCompletion(persisted.session, persisted.outcome);
      }
      await refreshOpenBuilder(this.chaseApi);
      return persisted;
    }

    async _applyRulesResult(result, { participantName = "", approachLabel = "" } = {}) {
      let consequenceResult = null;
      if ((result.consequenceOccurrences ?? []).length > 0) {
        consequenceResult = await this.chaseApi.consequences.executeRulesResult(result, { autoConfirm: false });
      }
      const session = consequenceResult?.session ?? result.session;
      await this._saveOrFinish(session);
      await this.chat.postRollResult({ sessionId: session.id, participantName, approachLabel, result }).catch(error => console.warn(`${MODULE_ID} | Failed to post chase roll result.`, error));
      return this.render({ force: true });
    }

    static async _actionBeginRound() {
      try {
        let session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const startResolution = this.chaseApi.rules.resolveRuntimeOutcomes?.(session, { phase: "startOfRound" }) ?? { session, evaluation: this.chaseApi.rules.evaluateOutcome(session, { phase: "startOfRound" }) };
        session = startResolution.session;
        const immediate = startResolution.evaluation;
        if (immediate.ended) {
          await this._saveOrFinish(session, { phase: "startOfRound" });
          return this.render({ force: true });
        }
        let initiativeOrder = null;
        if (session.blueprintSnapshot?.settings?.chaseType === "race") {
          const rows = [...(this.element?.querySelectorAll?.("[data-race-initiative-row]") ?? [])];
          if (rows.length > 0) {
            const scored = rows.map((row, index) => ({
              participantId: row.dataset.participantId,
              value: Number(row.querySelector?.("[data-race-initiative-value]")?.value),
              index
            }));
            if (scored.some(item => !item.participantId || !Number.isFinite(item.value))) {
              notify("warn", i18n("PF2E_CHASE_FORGE.Runner.RaceInitiativeMissing", "Bitte für alle würfelnden Beteiligten einen Initiativewert eintragen."));
              return null;
            }
            initiativeOrder = scored.sort((a, b) => (b.value - a.value) || (a.index - b.index)).map(item => item.participantId);
          }
        }
        session = this.chaseApi.rules.beginRound(session, { initiativeOrder });
        await this._saveOrFinish(session, { phase: "immediate" });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionEndRound() {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.endRound(session, { completeOnOutcome: false });
        await this._saveOrFinish(result.session, { phase: "endOfRound" });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionPauseSession() {
      this._session = await this.chaseApi.sessionManager.pauseSession(this.sessionId);
      await this.chaseApi.sync?.publishSession?.(this._session, { open: true });
      await refreshOpenBuilder(this.chaseApi);
      return this.render({ force: true });
    }

    static async _actionResumeSession() {
      this._session = await this.chaseApi.sessionManager.resumeSession(this.sessionId);
      await this.chaseApi.sync?.publishSession?.(this._session, { open: true });
      await refreshOpenBuilder(this.chaseApi);
      return this.render({ force: true });
    }

    static async _actionAbortSession() {
      const ok = await confirmAbortSession();
      if (!ok) return;
      this._session = await this.chaseApi.sessionManager.abortSession(this.sessionId);
      await this.chaseApi.sync?.publishSession?.(this._session, { open: true });
      await this.chat.postEvent({ title: "Verfolgungsjagd abgebrochen" }, { flags: { sessionId: this.sessionId } }).catch(() => null);
      await refreshOpenBuilder(this.chaseApi);
      return this.render({ force: true });
    }

    static async _actionPostObstacle(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const runtimeGroup = session.groups.find(group => group.id === target.dataset.runtimeGroupId);
        const groupDefinition = resolveBlueprintGroup(session, runtimeGroup);
        let obstacle = this.chaseApi.rules.currentObstacle(session, runtimeGroup.id);
        try {
          const visual = await this.chaseApi.images?.resolveCard?.(obstacle.card, { blueprint: session.blueprintSnapshot, fallbackToBlueprint: true });
          if (visual?.path) {
            obstacle = cloneData(obstacle);
            obstacle.card.image = {
              ...(obstacle.card.image ?? {}),
              mode: visual.mode ?? obstacle.card.image?.mode ?? "manual",
              path: visual.path,
              alt: visual.alt || obstacle.card.image?.alt || obstacle.card.name || ""
            };
          }
        } catch { /* Chat can still be posted without art. */ }
        await this.chat.postObstacle({ session, runtimeGroup, groupDefinition, obstacle });
        notify("info", i18n("PF2E_CHASE_FORGE.Runner.Posted", "Hindernis in den Chat gesendet."));
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionRollApproach(_event, target) {
      try {
        let session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const runtimeGroupId = target.dataset.runtimeGroupId;
        const participantId = target.dataset.participantId;
        const approachId = target.dataset.approachId;
        const participant = resolveParticipant(session, participantId);
        if (!participant?.uuid) throw new Error("Für diesen Beteiligten ist kein Actor/Token verknüpft.");
        const obstacle = this.chaseApi.rules.currentObstacle(session, runtimeGroupId);
        const approach = obstacle.card.approaches.find(item => item.id === approachId);
        if (!approach?.statistic) throw new Error("Diese Vorgehensweise besitzt keine würfelbare PF2e-Fertigkeit.");
        const actor = await this.chaseApi.pf2e.adapter.resolveActor(participant.uuid);
        if (!this.chaseApi.pf2e.adapter.meetsMinimumProficiency(actor, approach.statistic, approach.minimumProficiency)) {
          const rankLabel = i18n(`PF2E_CHASE_FORGE.Proficiency.${approach.minimumProficiency}`, approach.minimumProficiency);
          throw new Error(format("PF2E_CHASE_FORGE.Runner.MinimumProficiencyNotMet", { rank: rankLabel }, `Mindestkompetenz ${rankLabel} ist erforderlich.`));
        }
        const groupElement = target.closest?.(".chase-runner-group");
        const gmDcRaw = groupElement?.querySelector?.(`[data-gm-dc][data-approach-id="${approachId}"]`)?.value ?? null;
        const gmDc = gmDcRaw === null || gmDcRaw === "" ? storedGmDc(session, obstacle.card.id, approachId) : Number(gmDcRaw);
        if (Number.isFinite(Number(gmDc)) && approach.dc?.mode === "gm") session = setStoredGmDc(this.chaseApi, session, obstacle.card.id, approachId, gmDc);
        const dc = this.chaseApi.pf2e.dc.resolveApproach(approach, { partyLevel: session.blueprintSnapshot.settings.partyLevel, gmDc });
        if (!Number.isFinite(Number(dc.value))) throw new Error("Für diese Probe ist noch kein SG festgelegt.");
        const pendingBonus = this.chaseApi.rules.pendingCheckBonus(session, runtimeGroupId, participantId);
        const modifiers = [];
        let pendingBonusAlreadyApplied = false;
        if (pendingBonus) {
          try {
            modifiers.push(this.chaseApi.pf2e.adapter.createModifier({
              value: pendingBonus.value,
              type: pendingBonus.type || "circumstance",
              label: i18n("PF2E_CHASE_FORGE.Rules.SeparatedCriticalBonus", "Getrennter SC: Kritischer Erfolg"),
              slug: "chase-forge-separated-critical"
            }));
            pendingBonusAlreadyApplied = true;
          } catch (error) {
            console.warn(`${MODULE_ID} | Typed PF2e separated-PC bonus unavailable; falling back to rules-engine total adjustment.`, error);
          }
        }
        const roll = await this.chaseApi.pf2e.adapter.rollStatistic({ actorUuid: participant.uuid, statistic: approach.statistic, dc: dc.value, label: approach.label || obstacle.card.name, modifiers });
        const total = rollTotal(roll);
        if (!Number.isFinite(total)) throw new Error("Das PF2e-Wurfergebnis konnte nicht ausgewertet werden.");
        const result = this.chaseApi.rules.resolveCheck(session, { runtimeGroupId, participantId, approachId, total, natural: rollNatural(roll), gmDc, pendingBonusAlreadyApplied });
        return this._applyRulesResult(result, { participantName: participant.name, approachLabel: approach.label });
      } catch (error) { console.error(`${MODULE_ID} | Chase roll failed.`, error); notify("error", error.message); }
    }

    static async _actionApplyManualDegree(_event, target) {
      try {
        const row = target.closest?.("[data-runner-participant]");
        const degree = row?.querySelector?.('[data-runner-field="manualDegree"]')?.value ?? "success";
        const approachId = row?.querySelector?.('[data-runner-field="manualApproach"]')?.value ?? target.dataset.approachId;
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const participant = resolveParticipant(session, target.dataset.participantId);
        const obstacle = this.chaseApi.rules.currentObstacle(session, target.dataset.runtimeGroupId);
        const approach = obstacle.card.approaches.find(item => item.id === approachId) ?? null;
        const result = this.chaseApi.rules.applyDegree(session, { runtimeGroupId: target.dataset.runtimeGroupId, participantId: target.dataset.participantId, approachId, degree });
        return this._applyRulesResult(result, { participantName: participant?.name, approachLabel: approach?.label });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionAutomaticContribution(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.applyAutomaticContribution(session, { runtimeGroupId: target.dataset.runtimeGroupId, participantId: target.dataset.participantId, points: 1, label: "GM automatic contribution" });
        await this._saveOrFinish(result.session);
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionSkipParticipant(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.skipParticipantTurn(session, { runtimeGroupId: target.dataset.runtimeGroupId, participantId: target.dataset.participantId, allowNoObstacle: true });
        await this.chaseApi.sessionManager.saveSession(result.session);
        await this.chaseApi.sync?.publishSession?.(result.session, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionChooseRoute(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.chooseRoute(session, { runtimeGroupId: target.dataset.runtimeGroupId, edgeId: target.dataset.edgeId });
        await this._saveOrFinish(result.session);
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionActivateGroup(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const next = this.chaseApi.rules.selectActiveGroup(session, target.dataset.runtimeGroupId);
        await this.chaseApi.sessionManager.saveSession(next);
        await this.chaseApi.sync?.publishSession?.(next, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionSetGroupOrderAutomatic() {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const next = this.chaseApi.rules.setGroupOrderMode(session, "automatic");
        await this.chaseApi.sessionManager.saveSession(next);
        await this.chaseApi.sync?.publishSession?.(next, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionSetGroupOrderManual() {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const next = this.chaseApi.rules.setGroupOrderMode(session, "manual");
        await this.chaseApi.sessionManager.saveSession(next);
        await this.chaseApi.sync?.publishSession?.(next, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionSplitGroup(_event, target) {
      try {
        const section = target.closest?.(".chase-runner-group");
        const selected = [...(section?.querySelectorAll?.("[data-split-participant]:checked") ?? [])].map(input => input.value).filter(Boolean);
        if (selected.length === 0) {
          notify("warn", i18n("PF2E_CHASE_FORGE.Runner.SplitSelectParticipant", "Mindestens einen Beteiligten zum Abtrennen auswählen."));
          return null;
        }
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.splitRuntimeGroup(session, { runtimeGroupId: target.dataset.runtimeGroupId, participantIds: selected });
        await this.chaseApi.sessionManager.saveSession(result.session);
        await this.chaseApi.sync?.publishSession?.(result.session, { open: true });
        notify("info", i18n("PF2E_CHASE_FORGE.Runner.GroupSplitDone", "Gruppe aufgeteilt."));
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }


    static async _actionTransferParticipants(_event, target) {
      try {
        const section = target.closest?.(".chase-runner-group");
        const selected = [...(section?.querySelectorAll?.("[data-split-participant]:checked") ?? [])].map(input => input.value).filter(Boolean);
        if (selected.length === 0) {
          notify("warn", i18n("PF2E_CHASE_FORGE.Runner.SplitSelectParticipant", "Mindestens einen Beteiligten auswählen."));
          return null;
        }
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = this.chaseApi.rules.transferParticipants(session, {
          fromRuntimeGroupId: target.dataset.runtimeGroupId,
          toRuntimeGroupId: target.dataset.otherRuntimeGroupId,
          participantIds: selected
        });
        await this._saveOrFinish(result.session);
        notify("info", i18n("PF2E_CHASE_FORGE.Runner.ParticipantsTransferredDone", "Beteiligte verschoben."));
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionMergeGroups(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const first = target.dataset.runtimeGroupId;
        const second = target.dataset.otherRuntimeGroupId;
        const result = this.chaseApi.rules.mergeRuntimeGroups(session, { runtimeGroupIds: [first, second], targetRuntimeGroupId: first });
        await this._saveOrFinish(result.session);
        notify("info", i18n("PF2E_CHASE_FORGE.Runner.GroupsMergedDone", "Gruppen zusammengeführt."));
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionUnlockEdge(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const next = this.chaseApi.route.unlockEdges(session, [target.dataset.edgeId]);
        await this.chaseApi.sessionManager.saveSession(next);
        await this.chaseApi.sync?.publishSession?.(next, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionLockEdge(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const next = this.chaseApi.route.lockEdges(session, [target.dataset.edgeId]);
        await this.chaseApi.sessionManager.saveSession(next);
        await this.chaseApi.sync?.publishSession?.(next, { open: true });
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionConfirmConsequence(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const record = session.consequenceState.records.find(item => item.occurrenceId === target.dataset.occurrenceId);
        const occurrence = record ? reconstructOccurrence(this.chaseApi, session, record) : null;
        if (!occurrence) throw new Error("Die Konsequenzdefinition konnte nicht wiederhergestellt werden.");
        const result = await this.chaseApi.consequences.execute(session, occurrence, { confirmedOccurrenceIds: [occurrence.occurrenceId], retryFallback: true, retryFailed: true, retryBlocked: true });
        await this._saveOrFinish(result.session);
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionSelectConsequenceRoute(_event, target) {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const record = session.consequenceState.records.find(item => item.occurrenceId === target.dataset.occurrenceId);
        const occurrence = record ? reconstructOccurrence(this.chaseApi, session, record) : null;
        if (!occurrence) throw new Error("Die Konsequenzdefinition konnte nicht wiederhergestellt werden.");
        const result = await this.chaseApi.consequences.execute(session, occurrence, {
          confirmedOccurrenceIds: [occurrence.occurrenceId],
          routeSelections: { [occurrence.occurrenceId]: target.dataset.edgeId },
          retrySkipped: true, retryFallback: true, retryFailed: true, retryBlocked: true
        });
        await this._saveOrFinish(result.session);
        return this.render({ force: true });
      } catch (error) { console.error(error); notify("error", error.message); }
    }

    static async _actionOpenImage(_event, target) {
      try {
        return await openChaseImage(target.dataset.imageSrc, { title: target.dataset.imageTitle || "" });
      } catch (error) {
        console.error(`${MODULE_ID} | Chase image popout failed.`, error);
        notify("error", error?.message ?? String(error));
      }
    }

    static async _actionRefreshRunner() { return this.render({ force: true }); }

    static async _actionSyncPlayers() {
      try {
        const session = await this.chaseApi.sessionManager.getSession(this.sessionId);
        const result = await this.chaseApi.sync?.publishSession?.(session, { open: true, waitForAckMs: 1200 });
        const sent = result?.sent ?? 0;
        const confirmed = result?.confirmed ?? 0;
        const failed = result?.failed ?? 0;
        if (sent === 0) notify("warn", i18n("PF2E_CHASE_FORGE.Runner.NoPlayersToSync", "Keine aktiven Spielerclients gefunden."));
        else if (confirmed < sent || failed > 0) {
          notify("warn", format("PF2E_CHASE_FORGE.Runner.PlayersSyncUnconfirmed", { sent, confirmed }, `Spieleransicht gesendet: ${sent}, bestätigt: ${confirmed}.`));
          console.warn(`${MODULE_ID} | Player View delivery was not fully confirmed.`, { result, sync: this.chaseApi.sync?.status?.() });
        } else notify("info", format("PF2E_CHASE_FORGE.Runner.PlayersSyncedConfirmed", { count: confirmed }, `Spieleransichten geöffnet/aktualisiert: ${confirmed}`));
      } catch (error) { console.error(error); notify("error", error?.message ?? String(error)); }
    }
  };
  return runnerAppClass;
}

export function createChaseRunnerUiService({ getApi = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api ?? null } = {}) {
  return Object.freeze({
    contractVersion: GM_RUNNER_CONTRACT_VERSION,
    async openRunner({ sessionId } = {}) {
      if (!isGm()) { notify("warn", i18n("PF2E_CHASE_FORGE.Runner.GmOnly", "Der Chase Runner ist nur für die Spielleitung verfügbar.")); return null; }
      if (!sessionId) throw new Error("openRunner requires a sessionId.");
      const chaseApi = getApi();
      const session = await chaseApi.sessionManager.getSession(sessionId);
      if (!session) throw new Error(`Chase Session '${sessionId}' does not exist.`);
      let app = openRunnerApps.get(sessionId) ?? null;
      if (!app) {
        const App = getAppClass();
        app = new App(chaseApi, sessionId, { id: `pf2e-chase-forge-runner-${sessionId}` });
        openRunnerApps.set(sessionId, app);
      }
      await app.render({ force: true });
      await chaseApi.sync?.publishSession?.(session, { open: true });
      await bringRunnerToFront(app);
      return app;
    },
    getOpenRunner(sessionId) { return openRunnerApps.get(sessionId) ?? null; },
    getOpenRunners() { return [...openRunnerApps.values()]; },
    async closeRunner(sessionId) {
      const app = openRunnerApps.get(sessionId);
      if (!app) return false;
      await app.close();
      openRunnerApps.delete(sessionId);
      return true;
    },
    async closeAllRunners() {
      for (const [sessionId, app] of [...openRunnerApps]) {
        await app.close();
        openRunnerApps.delete(sessionId);
      }
      return true;
    }
  });
}
