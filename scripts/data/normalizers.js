import {
  APPROACH_TYPES,
  BLUEPRINT_CONTENT_MODES,
  CARD_TYPES,
  CHASE_LENGTHS,
  CHASE_TYPES,
  CONSEQUENCE_KINDS,
  CONSEQUENCE_SEVERITIES,
  CONSEQUENCE_STATUSES,
  DC_MODES,
  DEFAULTS,
  DEGREE_KEYS,
  DIFFICULTY_PROFILES,
  EDGE_TYPES,
  EDGE_VISIBILITY,
  EFFECT_FORGE_SOURCES,
  EFFECT_TARGET_MODES,
  GROUP_PACE_MODES,
  GROUP_ROLES,
  IMAGE_MODES,
  NODE_TYPES,
  PARTICIPANT_KINDS,
  PF2E_DIFFICULTY_ADJUSTMENTS,
  RESULT_OUTCOMES,
  ROUND_PHASES,
  ROUTE_COMPLEXITIES,
  SCHEMA_VERSIONS,
  SESSION_STATUSES
} from "../core/constants.js";
import {
  asFiniteNumber,
  asNonNegativeInteger,
  asString,
  cloneData,
  createId,
  isPlainObject,
  normalizeSource,
  nowIso,
  pickEnum,
  uniqueStrings
} from "./utils.js";

function normalizeImage(image = {}) {
  if (!isPlainObject(image)) image = {};
  return {
    mode: pickEnum(image.mode, IMAGE_MODES, DEFAULTS.imageMode),
    path: image.path ? asString(image.path) : null,
    providerId: image.providerId ? asString(image.providerId) : null,
    imageId: image.imageId ? asString(image.imageId) : null,
    alt: asString(image.alt),
    candidates: (Array.isArray(image.candidates) ? image.candidates : []).filter(isPlainObject).map(candidate => ({
      id: asString(candidate.id, createId("image")),
      path: asString(candidate.path),
      providerId: candidate.providerId ? asString(candidate.providerId) : null,
      tags: uniqueStrings(candidate.tags),
      weight: Math.max(0, asFiniteNumber(candidate.weight, 1))
    }))
  };
}

export function normalizeConsequence(input = {}) {
  const consequence = isPlainObject(input) ? input : {};
  const kind = pickEnum(consequence.kind, CONSEQUENCE_KINDS, "custom");
  const normalized = {
    schemaVersion: SCHEMA_VERSIONS.consequence,
    id: asString(consequence.id, createId("consequence")),
    kind,
    label: asString(consequence.label),
    severity: pickEnum(consequence.severity, CONSEQUENCE_SEVERITIES, "info"),
    optional: consequence.optional === true,
    gmConfirmation: consequence.gmConfirmation !== false,
    payload: isPlainObject(consequence.payload) ? cloneData(consequence.payload) : {}
  };

  if (kind === "chasePoints") {
    normalized.payload.value = asFiniteNumber(consequence.payload?.value ?? consequence.value, 0);
  } else if (["routeUnlock", "routeLock", "routeSelect"].includes(kind)) {
    normalized.payload.edgeIds = uniqueStrings(consequence.payload?.edgeIds ?? consequence.edgeIds);
  } else if (kind === "effectForge") {
    const source = pickEnum(consequence.payload?.source ?? consequence.source, EFFECT_FORGE_SOURCES, "embedded");
    const targetMode = pickEnum(consequence.payload?.targetMode ?? consequence.targetMode, EFFECT_TARGET_MODES, "participant");
    normalized.payload = {
      source,
      required: consequence.payload?.required === true || consequence.required === true,
      targetMode,
      targetParticipantIds: uniqueStrings(consequence.payload?.targetParticipantIds ?? consequence.targetParticipantIds),
      targetUuids: uniqueStrings(consequence.payload?.targetUuids ?? consequence.targetUuids),
      definition: source === "embedded" && isPlainObject(consequence.payload?.definition ?? consequence.definition)
        ? cloneData(consequence.payload?.definition ?? consequence.definition)
        : null,
      uuid: source === "item" ? asString(consequence.payload?.uuid ?? consequence.uuid) : null
    };
  } else if (kind === "narrative") {
    normalized.payload.text = asString(consequence.payload?.text ?? consequence.text);
  }

  return normalized;
}

function normalizeConsequenceRecord(input = {}) {
  const record = isPlainObject(input) ? input : {};
  return {
    occurrenceId: asString(record.occurrenceId, createId("consequence-occurrence")),
    consequenceId: asString(record.consequenceId),
    kind: pickEnum(record.kind, CONSEQUENCE_KINDS, "custom"),
    status: pickEnum(record.status, CONSEQUENCE_STATUSES, "unhandled"),
    sourceEventId: record.sourceEventId ? asString(record.sourceEventId) : null,
    runtimeGroupId: record.runtimeGroupId ? asString(record.runtimeGroupId) : null,
    participantId: record.participantId ? asString(record.participantId) : null,
    nodeId: record.nodeId ? asString(record.nodeId) : null,
    cardId: record.cardId ? asString(record.cardId) : null,
    approachId: record.approachId ? asString(record.approachId) : null,
    degree: record.degree && DEGREE_KEYS.includes(record.degree) ? record.degree : null,
    targetUuids: uniqueStrings(record.targetUuids),
    result: isPlainObject(record.result) ? cloneData(record.result) : null,
    message: asString(record.message),
    createdAt: record.createdAt ?? nowIso(),
    updatedAt: record.updatedAt ?? record.createdAt ?? nowIso()
  };
}

function normalizeOutcomes(outcomes = {}) {
  const normalized = {};
  for (const degree of DEGREE_KEYS) {
    normalized[degree] = (Array.isArray(outcomes?.[degree]) ? outcomes[degree] : []).map(normalizeConsequence);
  }
  return normalized;
}

function normalizeDifficultyAdjustment(value) {
  if (typeof value === "string" && Object.hasOwn(PF2E_DIFFICULTY_ADJUSTMENTS, value)) {
    return PF2E_DIFFICULTY_ADJUSTMENTS[value];
  }
  return asFiniteNumber(value, 0);
}

function normalizeApproach(input = {}) {
  const approach = isPlainObject(input) ? input : {};
  return {
    id: asString(approach.id, createId("approach")),
    label: asString(approach.label),
    description: asString(approach.description),
    type: pickEnum(approach.type, APPROACH_TYPES, "check"),
    statistic: approach.statistic ? asString(approach.statistic) : null,
    dc: {
      mode: pickEnum(approach.dc?.mode, DC_MODES, "gm"),
      value: approach.dc?.value === null || approach.dc?.value === undefined ? null : asFiniteNumber(approach.dc.value, 0),
      levelOffset: asFiniteNumber(approach.dc?.levelOffset, 0),
      difficultyAdjustment: normalizeDifficultyAdjustment(approach.dc?.difficultyAdjustment),
      proficiency: approach.dc?.proficiency ? asString(approach.dc.proficiency) : null,
      hidden: approach.dc?.hidden !== false
    },
    traits: uniqueStrings(approach.traits),
    requirements: Array.isArray(approach.requirements) ? cloneData(approach.requirements) : [],
    outcomes: normalizeOutcomes(approach.outcomes)
  };
}

export function normalizeChaseCard(input = {}) {
  const card = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.card,
    id: asString(card.id, createId("card")),
    source: normalizeSource(card.source),
    type: pickEnum(card.type, CARD_TYPES, "obstacle"),
    name: asString(card.name, "Unnamed Chase Card"),
    description: asString(card.description),
    gmNotes: asString(card.gmNotes),
    tags: uniqueStrings(card.tags),
    level: {
      min: card.level?.min === null || card.level?.min === undefined ? null : asFiniteNumber(card.level.min, 0),
      max: card.level?.max === null || card.level?.max === undefined ? null : asFiniteNumber(card.level.max, 0)
    },
    obstacle: {
      requiredPoints: Math.max(1, asNonNegativeInteger(card.obstacle?.requiredPoints, DEFAULTS.requiredPoints)),
      scalable: card.obstacle?.scalable !== false
    },
    approaches: (Array.isArray(card.approaches) ? card.approaches : []).map(normalizeApproach),
    outcomes: normalizeOutcomes(card.outcomes),
    image: normalizeImage(card.image),
    metadata: isPlainObject(card.metadata) ? cloneData(card.metadata) : {}
  };
}

export function normalizeParticipant(input = {}) {
  const participant = isPlainObject(input) ? input : {};
  return {
    id: asString(participant.id, createId("participant")),
    kind: pickEnum(participant.kind, PARTICIPANT_KINDS, "actor"),
    uuid: participant.uuid ? asString(participant.uuid) : null,
    name: asString(participant.name),
    image: participant.image ? asString(participant.image) : null,
    ownerUserIds: uniqueStrings(participant.ownerUserIds),
    metadata: isPlainObject(participant.metadata) ? cloneData(participant.metadata) : {}
  };
}

export function normalizeParticipantGroup(input = {}) {
  const group = isPlainObject(input) ? input : {};
  return {
    id: asString(group.id, createId("group")),
    name: asString(group.name, "Chase Group"),
    role: pickEnum(group.role, GROUP_ROLES, "participant"),
    participants: (Array.isArray(group.participants) ? group.participants : []).map(normalizeParticipant),
    parentGroupId: group.parentGroupId ? asString(group.parentGroupId) : null,
    public: group.public !== false,
    metadata: isPlainObject(group.metadata) ? cloneData(group.metadata) : {}
  };
}

export function normalizeChaseNode(input = {}) {
  const node = isPlainObject(input) ? input : {};
  const type = pickEnum(node.type, NODE_TYPES, "card");
  return {
    id: asString(node.id, createId("node")),
    type,
    label: asString(node.label),
    description: asString(node.description),
    cardRef: type === "card" && node.cardRef ? asString(node.cardRef) : null,
    public: node.public !== false,
    metadata: isPlainObject(node.metadata) ? cloneData(node.metadata) : {}
  };
}

export function normalizeChaseEdge(input = {}) {
  const edge = isPlainObject(input) ? input : {};
  return {
    id: asString(edge.id, createId("edge")),
    from: asString(edge.from),
    to: asString(edge.to),
    type: pickEnum(edge.type, EDGE_TYPES, "normal"),
    visibility: pickEnum(edge.visibility, EDGE_VISIBILITY, "public"),
    label: asString(edge.label),
    description: asString(edge.description),
    conditions: Array.isArray(edge.conditions) ? cloneData(edge.conditions) : [],
    metadata: isPlainObject(edge.metadata) ? cloneData(edge.metadata) : {}
  };
}

export function normalizeRouteGraph(input = {}) {
  const graph = isPlainObject(input) ? input : {};
  const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []).map(normalizeChaseNode);
  const inferredStart = nodes.find(node => node.type === "start")?.id ?? null;
  const inferredEnds = nodes.filter(node => node.type === "end").map(node => node.id);
  return {
    nodes,
    edges: (Array.isArray(graph.edges) ? graph.edges : []).map(normalizeChaseEdge),
    startNodeId: graph.startNodeId ? asString(graph.startNodeId) : inferredStart,
    endNodeIds: uniqueStrings(graph.endNodeIds?.length ? graph.endNodeIds : inferredEnds)
  };
}

function normalizeChaseSettings(settings = {}) {
  return {
    chaseType: pickEnum(settings.chaseType, CHASE_TYPES, DEFAULTS.chaseType),
    length: pickEnum(settings.length, CHASE_LENGTHS, DEFAULTS.chaseLength),
    difficulty: pickEnum(settings.difficulty, DIFFICULTY_PROFILES, DEFAULTS.difficulty),
    routeComplexity: pickEnum(settings.routeComplexity, ROUTE_COMPLEXITIES, DEFAULTS.routeComplexity),
    partyLevel: settings.partyLevel === null || settings.partyLevel === undefined ? null : asFiniteNumber(settings.partyLevel, 1),
    roundDuration: settings.roundDuration ? cloneData(settings.roundDuration) : null,
    startDistance: Math.max(0, asNonNegativeInteger(settings.startDistance, 1)),
    movementModes: uniqueStrings(settings.movementModes),
    environmentTags: uniqueStrings(settings.environmentTags),
    toneTags: uniqueStrings(settings.toneTags),
    timeOfDay: settings.timeOfDay ? asString(settings.timeOfDay) : null,
    weather: settings.weather ? cloneData(settings.weather) : null,
    imageMode: pickEnum(settings.imageMode, IMAGE_MODES, DEFAULTS.imageMode),
    victory: isPlainObject(settings.victory) ? cloneData(settings.victory) : {},
    gmOptions: isPlainObject(settings.gmOptions) ? cloneData(settings.gmOptions) : {}
  };
}

export function normalizeChaseTemplate(input = {}) {
  const template = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.template,
    id: asString(template.id, createId("template")),
    source: normalizeSource(template.source),
    name: asString(template.name, "Unnamed Chase Template"),
    description: asString(template.description),
    settings: normalizeChaseSettings(template.settings),
    filters: isPlainObject(template.filters) ? cloneData(template.filters) : {},
    generator: isPlainObject(template.generator) ? cloneData(template.generator) : {},
    metadata: isPlainObject(template.metadata) ? cloneData(template.metadata) : {}
  };
}


function normalizeContentSnapshotRecord(input = {}, kind = "resource") {
  const record = isPlainObject(input) ? input : {};
  return {
    ref: asString(record.ref),
    source: normalizeSource(record.source),
    data: isPlainObject(record.data) ? cloneData(record.data) : null,
    capturedAt: record.capturedAt ?? nowIso(),
    metadata: isPlainObject(record.metadata) ? cloneData(record.metadata) : {},
    kind
  };
}

function normalizeBlueprintContentSnapshots(input = {}) {
  const snapshots = isPlainObject(input) ? input : {};
  return {
    mode: pickEnum(snapshots.mode, BLUEPRINT_CONTENT_MODES, "references"),
    cards: (Array.isArray(snapshots.cards) ? snapshots.cards : []).map(record => {
      const normalized = normalizeContentSnapshotRecord(record, "card");
      if (normalized.data) normalized.data = normalizeChaseCard(normalized.data);
      return normalized;
    }),
    images: (Array.isArray(snapshots.images) ? snapshots.images : []).map(record => normalizeContentSnapshotRecord(record, "image")),
    effects: (Array.isArray(snapshots.effects) ? snapshots.effects : []).map(record => normalizeContentSnapshotRecord(record, "effect")),
    metadata: isPlainObject(snapshots.metadata) ? cloneData(snapshots.metadata) : {}
  };
}

export function normalizeChaseBlueprint(input = {}) {
  const blueprint = isPlainObject(input) ? input : {};
  const timestamp = blueprint.createdAt ?? nowIso();
  return {
    schemaVersion: SCHEMA_VERSIONS.blueprint,
    id: asString(blueprint.id, createId("blueprint")),
    source: normalizeSource(blueprint.source),
    name: asString(blueprint.name, "Unnamed Chase"),
    description: asString(blueprint.description),
    gmNotes: asString(blueprint.gmNotes),
    settings: normalizeChaseSettings(blueprint.settings),
    groups: (Array.isArray(blueprint.groups) ? blueprint.groups : []).map(normalizeParticipantGroup),
    graph: normalizeRouteGraph(blueprint.graph),
    tags: uniqueStrings(blueprint.tags),
    image: normalizeImage(blueprint.image),
    contentSnapshots: normalizeBlueprintContentSnapshots(blueprint.contentSnapshots),
    createdAt: timestamp,
    updatedAt: blueprint.updatedAt ?? timestamp,
    metadata: isPlainObject(blueprint.metadata) ? cloneData(blueprint.metadata) : {}
  };
}

function normalizeGroupState(input = {}) {
  const state = isPlainObject(input) ? input : {};
  const rawRules = isPlainObject(state.rules) ? state.rules : {};
  const pending = isPlainObject(rawRules.pendingCheckBonus) ? rawRules.pendingCheckBonus : null;
  return {
    id: asString(state.id, createId("runtime-group")),
    groupId: asString(state.groupId),
    participantIds: uniqueStrings(state.participantIds),
    parentRuntimeGroupId: state.parentRuntimeGroupId ? asString(state.parentRuntimeGroupId) : null,
    position: {
      nodeId: state.position?.nodeId ? asString(state.position.nodeId) : null,
      progress: Math.max(0, asNonNegativeInteger(state.position?.progress, DEFAULTS.obstacleProgress))
    },
    routeHistory: uniqueStrings(state.routeHistory),
    edgeHistory: uniqueStrings(state.edgeHistory),
    completed: state.completed === true,
    rules: {
      paceMode: pickEnum(rawRules.paceMode, GROUP_PACE_MODES, DEFAULTS.groupPaceMode),
      obstaclesPerRound: Math.max(0, asFiniteNumber(rawRules.obstaclesPerRound, DEFAULTS.steadyObstaclesPerRound)),
      steadyProgress: Math.max(0, asFiniteNumber(rawRules.steadyProgress, 0)),
      pendingCheckBonus: pending ? {
        value: asFiniteNumber(pending.value, 0),
        type: asString(pending.type, "circumstance"),
        source: asString(pending.source),
        grantedAtRound: Math.max(0, asNonNegativeInteger(pending.grantedAtRound, 0))
      } : null
    },
    metadata: isPlainObject(state.metadata) ? cloneData(state.metadata) : {}
  };
}

export function normalizeChaseSession(input = {}) {
  const session = isPlainObject(input) ? input : {};
  const timestamp = session.createdAt ?? nowIso();
  const rawRoundState = isPlainObject(session.roundState) ? session.roundState : {};
  const rawRules = isPlainObject(session.rules) ? session.rules : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.session,
    id: asString(session.id, createId("session")),
    blueprintId: session.blueprintId ? asString(session.blueprintId) : null,
    blueprintSnapshot: isPlainObject(session.blueprintSnapshot) ? normalizeChaseBlueprint(session.blueprintSnapshot) : null,
    status: pickEnum(session.status, SESSION_STATUSES, "draft"),
    round: Math.max(0, asNonNegativeInteger(session.round, DEFAULTS.round)),
    activeGroupId: session.activeGroupId ? asString(session.activeGroupId) : null,
    groups: (Array.isArray(session.groups) ? session.groups : []).map(normalizeGroupState),
    roundState: {
      phase: pickEnum(rawRoundState.phase, ROUND_PHASES, DEFAULTS.roundPhase),
      actedParticipantIds: uniqueStrings(rawRoundState.actedParticipantIds),
      skippedParticipantIds: uniqueStrings(rawRoundState.skippedParticipantIds),
      initiativeOrder: uniqueStrings(rawRoundState.initiativeOrder),
      startedAt: rawRoundState.startedAt ?? null,
      endedAt: rawRoundState.endedAt ?? null
    },
    rules: {
      roundLimit: rawRules.roundLimit === null || rawRules.roundLimit === undefined
        ? null
        : Math.max(1, asNonNegativeInteger(rawRules.roundLimit, 1)),
      escapeLead: Math.max(1, asNonNegativeInteger(rawRules.escapeLead, DEFAULTS.escapeLead))
    },
    nodeState: isPlainObject(session.nodeState) ? cloneData(session.nodeState) : {},
    unlockedEdgeIds: uniqueStrings(session.unlockedEdgeIds),
    lockedEdgeIds: uniqueStrings(session.lockedEdgeIds),
    consequenceState: {
      records: (Array.isArray(session.consequenceState?.records) ? session.consequenceState.records : []).map(normalizeConsequenceRecord)
    },
    events: Array.isArray(session.events) ? cloneData(session.events) : [],
    createdAt: timestamp,
    startedAt: session.startedAt ?? null,
    pausedAt: session.pausedAt ?? null,
    endedAt: session.endedAt ?? null,
    updatedAt: session.updatedAt ?? timestamp,
    metadata: isPlainObject(session.metadata) ? cloneData(session.metadata) : {}
  };
}

export function normalizeChaseResult(input = {}) {
  const result = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.result,
    id: asString(result.id, createId("result")),
    sessionId: asString(result.sessionId),
    blueprintId: result.blueprintId ? asString(result.blueprintId) : null,
    outcome: pickEnum(result.outcome, RESULT_OUTCOMES, "custom"),
    endingNodeId: result.endingNodeId ? asString(result.endingNodeId) : null,
    winnerGroupIds: uniqueStrings(result.winnerGroupIds),
    loserGroupIds: uniqueStrings(result.loserGroupIds),
    rounds: Math.max(0, asNonNegativeInteger(result.rounds, 0)),
    routes: isPlainObject(result.routes) ? cloneData(result.routes) : {},
    summary: asString(result.summary),
    events: Array.isArray(result.events) ? cloneData(result.events) : [],
    startedAt: result.startedAt ?? null,
    endedAt: result.endedAt ?? nowIso(),
    metadata: isPlainObject(result.metadata) ? cloneData(result.metadata) : {}
  };
}

export function normalizeChasePublicState(input = {}) {
  const state = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.publicState,
    sessionId: asString(state.sessionId),
    title: asString(state.title),
    status: pickEnum(state.status, SESSION_STATUSES, "draft"),
    round: Math.max(0, asNonNegativeInteger(state.round, 0)),
    current: isPlainObject(state.current) ? cloneData(state.current) : null,
    groups: Array.isArray(state.groups) ? cloneData(state.groups) : [],
    visibleRoutes: Array.isArray(state.visibleRoutes) ? cloneData(state.visibleRoutes) : [],
    availableActions: Array.isArray(state.availableActions) ? cloneData(state.availableActions) : [],
    personalEffects: Array.isArray(state.personalEffects) ? cloneData(state.personalEffects) : [],
    log: Array.isArray(state.log) ? cloneData(state.log) : [],
    metadata: isPlainObject(state.metadata) ? cloneData(state.metadata) : {}
  };
}

export function normalizeChasePack(input = {}) {
  const pack = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSIONS.pack,
    id: asString(pack.id, createId("pack")),
    label: asString(pack.label, "Unnamed Chase Pack"),
    description: asString(pack.description),
    version: pack.version ? asString(pack.version) : null,
    priority: asFiniteNumber(pack.priority, DEFAULTS.packPriority),
    enabledByDefault: pack.enabledByDefault !== false,
    cards: (Array.isArray(pack.cards) ? pack.cards : []).map(normalizeChaseCard),
    templates: (Array.isArray(pack.templates) ? pack.templates : []).map(normalizeChaseTemplate),
    blueprints: (Array.isArray(pack.blueprints) ? pack.blueprints : []).map(normalizeChaseBlueprint),
    metadata: isPlainObject(pack.metadata) ? cloneData(pack.metadata) : {}
  };
}
