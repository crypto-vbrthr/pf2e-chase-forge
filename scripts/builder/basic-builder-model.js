import {
  CHASE_TYPES,
  DEFAULTS,
  GROUP_ROLES,
  MODULE_ID,
  MODULE_VERSION
} from "../core/constants.js";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createParticipant,
  createParticipantGroup,
  createRouteGraph
} from "../data/factories.js";
import { buildGraphIndex } from "../data/graph.js";
import { cloneData, createId, nowIso, uniqueStrings } from "../data/utils.js";
import { validateChaseBlueprint } from "../data/validators.js";

export const BASIC_BUILDER_CONTRACT_VERSION = 1;

const DEFAULT_SKILL = "athletics";

function builderSource() {
  return { moduleId: MODULE_ID, packId: "world-builder", version: MODULE_VERSION };
}

function ensureBuilderMetadata(blueprint, { preserveMode = false } = {}) {
  const existingMode = blueprint.metadata?.builder?.mode;
  blueprint.metadata ??= {};
  blueprint.metadata.builder ??= {};
  blueprint.metadata.builder.mode = preserveMode && ["basic", "branching"].includes(existingMode) ? existingMode : "basic";
  blueprint.metadata.builder.contractVersion = BASIC_BUILDER_CONTRACT_VERSION;
  blueprint.metadata.builder.actionLevel ??= "medium";
  blueprint.metadata.builder.humorLevel ??= "low";
  return blueprint.metadata.builder;
}

export function defaultGroupsForChaseType(chaseType = DEFAULTS.chaseType) {
  if (chaseType === "againstClock") {
    return [createParticipantGroup({
      id: createId("group"),
      name: "Beteiligte",
      role: "participant",
      participants: []
    })];
  }
  if (chaseType === "race") {
    return [
      createParticipantGroup({ id: createId("group"), name: "Wettkämpfer A", role: "competitor", participants: [] }),
      createParticipantGroup({ id: createId("group"), name: "Wettkämpfer B", role: "competitor", participants: [] })
    ];
  }
  return [
    createParticipantGroup({ id: createId("group"), name: "Flüchtige", role: "quarry", participants: [] }),
    createParticipantGroup({ id: createId("group"), name: "Verfolger", role: "pursuer", participants: [] })
  ];
}

function emptyOutcomes() {
  return {
    criticalSuccess: [],
    success: [],
    failure: [],
    criticalFailure: []
  };
}

export function createBasicApproach(input = {}) {
  return {
    id: input.id || createId("approach"),
    label: input.label ?? "Athletik",
    description: input.description ?? "",
    type: input.type ?? "check",
    statistic: input.statistic ?? DEFAULT_SKILL,
    dc: {
      mode: input.dc?.mode ?? "level",
      value: input.dc?.value ?? null,
      levelOffset: Number(input.dc?.levelOffset ?? 0),
      difficultyAdjustment: Number(input.dc?.difficultyAdjustment ?? 0),
      proficiency: input.dc?.proficiency ?? null,
      hidden: input.dc?.hidden !== false
    },
    traits: Array.isArray(input.traits) ? [...input.traits] : [],
    requirements: Array.isArray(input.requirements) ? cloneData(input.requirements) : [],
    outcomes: input.outcomes ? cloneData(input.outcomes) : emptyOutcomes()
  };
}

export function createManualChaseCard({ requiredPoints = 1, name = "Neues Hindernis" } = {}) {
  const id = createId("builder-card");
  return createChaseCard({
    id,
    source: builderSource(),
    type: "obstacle",
    name,
    description: "",
    gmNotes: "",
    tags: [],
    obstacle: { requiredPoints: Math.max(1, Math.trunc(Number(requiredPoints) || 1)), scalable: true },
    approaches: [createBasicApproach()],
    outcomes: emptyOutcomes(),
    image: { mode: "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] },
    metadata: { builderCreated: true }
  });
}

function cardRecordFromCard(blueprint, inputCard, { originCardRef = null } = {}) {
  const original = createChaseCard(inputCard);
  const ref = `builder:${blueprint.id}:${createId("card")}`;
  const nodeId = createId("node-card");
  const effectiveOrigin = originCardRef ?? (original.source?.packId === "world-builder" ? null : (original.id ?? null));
  const data = createChaseCard({
    ...cloneData(original),
    id: ref,
    source: builderSource(),
    metadata: {
      ...(original.metadata ?? {}),
      builderCreated: original.metadata?.builderCreated === true,
      originCardRef: effectiveOrigin,
      originSource: effectiveOrigin ? cloneData(original.source ?? null) : null
    }
  });
  return {
    ref,
    source: builderSource(),
    data,
    capturedAt: nowIso(),
    metadata: { nodeId, originCardRef: effectiveOrigin }
  };
}

function linearGraphForRecords(records = [], { startNodeId = null, endNodeId = null } = {}) {
  const start = createChaseNode({ id: startNodeId || createId("node-start"), type: "start", label: "Start" });
  const end = createChaseNode({ id: endNodeId || createId("node-end"), type: "end", label: "Ziel" });
  const cardNodes = records.map((record, index) => createChaseNode({
    id: record.metadata?.nodeId || createId("node-card"),
    type: "card",
    label: record.data?.name || `Hindernis ${index + 1}`,
    description: record.data?.description ?? "",
    cardRef: record.ref,
    metadata: { builderIndex: index }
  }));
  const nodes = [start, ...cardNodes, end];
  const edges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createChaseEdge({
      id: createId("edge"),
      from: nodes[index].id,
      to: nodes[index + 1].id,
      type: "normal",
      visibility: "public"
    }));
  }
  return createRouteGraph({ nodes, edges, startNodeId: start.id, endNodeIds: [end.id] });
}

export function rebuildBasicLinearGraph(input) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) {
    const hasBuilderFlag = blueprint.metadata?.builder?.mode === "basic";
    if (!hasBuilderFlag && blueprint.graph?.nodes?.length > 2) {
      throw new Error("Basic Chase Builder cannot rebuild a branched or non-linear route graph.");
    }
  }
  const records = blueprint.contentSnapshots?.cards ?? [];
  const previousStart = blueprint.graph?.nodes?.find(node => node.type === "start") ?? null;
  const previousEnd = blueprint.graph?.nodes?.find(node => node.id === blueprint.graph?.endNodeIds?.[0]) ?? blueprint.graph?.nodes?.find(node => node.type === "end") ?? null;
  const startNodeId = previousStart?.id ?? null;
  const endNodeId = previousEnd?.id ?? null;
  const next = cloneData(blueprint);
  next.graph = linearGraphForRecords(records, { startNodeId, endNodeId });
  const rebuiltStart = next.graph.nodes.find(node => node.id === startNodeId);
  const rebuiltEnd = next.graph.nodes.find(node => node.id === endNodeId);
  if (previousStart && rebuiltStart) {
    rebuiltStart.label = previousStart.label;
    rebuiltStart.description = previousStart.description;
    rebuiltStart.image = cloneData(previousStart.image ?? rebuiltStart.image);
    rebuiltStart.public = previousStart.public;
    rebuiltStart.metadata = cloneData(previousStart.metadata ?? {});
  }
  if (previousEnd && rebuiltEnd) {
    rebuiltEnd.label = previousEnd.label;
    rebuiltEnd.description = previousEnd.description;
    rebuiltEnd.image = cloneData(previousEnd.image ?? rebuiltEnd.image);
    rebuiltEnd.public = previousEnd.public;
    rebuiltEnd.metadata = cloneData(previousEnd.metadata ?? {});
  }
  next.settings.routeComplexity = "linear";
  next.contentSnapshots.mode = "snapshot";
  ensureBuilderMetadata(next);
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function createBasicBuilderDraft(input = {}) {
  if (input?.schemaVersion) {
    const blueprint = createChaseBlueprint(input);
    ensureBuilderMetadata(blueprint);
    return blueprint;
  }
  const chaseType = CHASE_TYPES.includes(input.chaseType) ? input.chaseType : DEFAULTS.chaseType;
  const blueprint = createChaseBlueprint({
    id: input.id || createId("blueprint"),
    source: builderSource(),
    name: input.name ?? "Neue Verfolgungsjagd",
    description: input.description ?? "",
    gmNotes: input.gmNotes ?? "",
    settings: {
      chaseType,
      length: input.length ?? "medium",
      difficulty: input.difficulty ?? "moderate",
      routeComplexity: "linear",
      partyLevel: input.partyLevel ?? 1,
      roundDuration: input.roundDuration ?? { value: 1, unit: "rounds" },
      startDistance: input.startDistance ?? 1,
      movementModes: input.movementModes ?? ["land"],
      environmentTags: input.environmentTags ?? [],
      toneTags: input.toneTags ?? [],
      timeOfDay: input.timeOfDay ?? null,
      weather: input.weather ?? null,
      imageMode: input.imageMode ?? "none",
      victory: input.victory ?? {},
      gmOptions: input.gmOptions ?? {}
    },
    groups: input.groups ?? defaultGroupsForChaseType(chaseType),
    graph: linearGraphForRecords([]),
    tags: input.tags ?? [],
    image: input.image ?? { mode: input.imageMode ?? "none", path: null, providerId: null, imageId: null, alt: "", candidates: [] },
    contentSnapshots: { mode: "snapshot", cards: [], images: [], effects: [], metadata: {} },
    metadata: {
      ...(input.metadata ?? {}),
      builder: {
        mode: "basic",
        contractVersion: BASIC_BUILDER_CONTRACT_VERSION,
        actionLevel: input.actionLevel ?? "medium",
        humorLevel: input.humorLevel ?? "low"
      }
    }
  });
  return blueprint;
}

export function isBasicLinearBlueprint(input) {
  const blueprint = createChaseBlueprint(input);
  const graph = blueprint.graph;
  if (!graph?.nodes?.length || !graph?.startNodeId || graph.endNodeIds?.length !== 1) return false;
  if (graph.nodes.some(node => !["start", "card", "end"].includes(node.type))) return false;
  if (graph.edges.some(edge => edge.type !== "normal")) return false;
  const { incoming, outgoing, nodeById } = buildGraphIndex(graph);
  const start = nodeById.get(graph.startNodeId);
  const end = nodeById.get(graph.endNodeIds[0]);
  if (!start || start.type !== "start" || !end || end.type !== "end") return false;
  for (const node of graph.nodes) {
    const inCount = incoming.get(node.id)?.length ?? 0;
    const outCount = outgoing.get(node.id)?.length ?? 0;
    if (node.type === "start" && (inCount !== 0 || outCount !== 1)) return false;
    if (node.type === "end" && (inCount !== 1 || outCount !== 0)) return false;
    if (node.type === "card" && (inCount !== 1 || outCount !== 1)) return false;
  }
  const visited = new Set();
  let nodeId = graph.startNodeId;
  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    if (nodeId === graph.endNodeIds[0]) break;
    const edge = outgoing.get(nodeId)?.[0];
    if (!edge) return false;
    nodeId = edge.to;
  }
  return nodeId === graph.endNodeIds[0] && visited.size === graph.nodes.length;
}

export function listBasicCards(input) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) return [];
  const snapshotByRef = new Map((blueprint.contentSnapshots?.cards ?? []).map(record => [record.ref, record]));
  const { outgoing, nodeById } = buildGraphIndex(blueprint.graph);
  const result = [];
  let nodeId = blueprint.graph.startNodeId;
  const visited = new Set();
  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    const edge = outgoing.get(nodeId)?.[0];
    if (!edge) break;
    const target = nodeById.get(edge.to);
    if (!target) break;
    if (target.type === "card") {
      const record = snapshotByRef.get(target.cardRef);
      result.push({
        index: result.length,
        node: cloneData(target),
        ref: target.cardRef,
        record: record ? cloneData(record) : null,
        card: record?.data ? createChaseCard(record.data) : null
      });
    }
    if (target.type === "end") break;
    nodeId = target.id;
  }
  return result;
}

export function addCardToBasicBlueprint(input, card, { index = null, originCardRef = null } = {}) {
  let blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) throw new Error("Basic Chase Builder only supports linear Blueprints in dev.7.");
  const next = cloneData(blueprint);
  const record = cardRecordFromCard(next, card, { originCardRef });
  const records = [...(next.contentSnapshots?.cards ?? [])];
  const position = index === null ? records.length : Math.max(0, Math.min(records.length, Math.trunc(index)));
  records.splice(position, 0, record);
  next.contentSnapshots.cards = records;
  blueprint = rebuildBasicLinearGraph(next);
  return { blueprint, ref: record.ref, index: position };
}

export function addManualCardToBasicBlueprint(input, options = {}) {
  const blueprint = createChaseBlueprint(input);
  const largestGroup = Math.max(1, ...(blueprint.groups ?? []).map(group => group.participants?.length ?? 0));
  const defaultPoints = Math.max(1, largestGroup - 1);
  return addCardToBasicBlueprint(blueprint, createManualChaseCard({ requiredPoints: options.requiredPoints ?? defaultPoints, name: options.name }), { index: options.index });
}

export function removeCardFromBasicBlueprint(input, index) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) throw new Error("Basic Chase Builder only supports linear Blueprints in dev.7.");
  const next = cloneData(blueprint);
  const records = [...(next.contentSnapshots?.cards ?? [])];
  const position = Math.trunc(Number(index));
  if (position < 0 || position >= records.length) return blueprint;
  records.splice(position, 1);
  next.contentSnapshots.cards = records;
  return rebuildBasicLinearGraph(next);
}

export function moveCardInBasicBlueprint(input, fromIndex, toIndex) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) throw new Error("Basic Chase Builder only supports linear Blueprints in dev.7.");
  const next = cloneData(blueprint);
  const records = [...(next.contentSnapshots?.cards ?? [])];
  const from = Math.trunc(Number(fromIndex));
  const to = Math.trunc(Number(toIndex));
  if (from < 0 || from >= records.length || to < 0 || to >= records.length || from === to) return blueprint;
  const [record] = records.splice(from, 1);
  records.splice(to, 0, record);
  next.contentSnapshots.cards = records;
  return rebuildBasicLinearGraph(next);
}

export function updateBasicCard(input, index, updater) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint)) throw new Error("Basic Chase Builder only supports linear Blueprints in dev.7.");
  const next = cloneData(blueprint);
  const record = next.contentSnapshots?.cards?.[Math.trunc(Number(index))];
  if (!record?.data) return blueprint;
  const candidate = typeof updater === "function" ? updater(cloneData(record.data)) : updater;
  record.data = createChaseCard({ ...cloneData(candidate), id: record.ref, source: builderSource() });
  record.capturedAt = nowIso();
  return rebuildBasicLinearGraph(next);
}

export function addApproachToBasicCard(input, cardIndex, approach = {}) {
  return updateBasicCard(input, cardIndex, card => ({
    ...card,
    approaches: [...(card.approaches ?? []), createBasicApproach(approach)]
  }));
}

export function removeApproachFromBasicCard(input, cardIndex, approachIndex) {
  return updateBasicCard(input, cardIndex, card => {
    const approaches = [...(card.approaches ?? [])];
    const index = Math.trunc(Number(approachIndex));
    if (index >= 0 && index < approaches.length) approaches.splice(index, 1);
    return { ...card, approaches };
  });
}

export function addParticipantToBasicBlueprint(input, groupId, participantInput) {
  const blueprint = createChaseBlueprint(input);
  const next = cloneData(blueprint);
  const group = next.groups.find(candidate => candidate.id === groupId);
  if (!group) throw new Error(`Unknown Chase group '${groupId}'.`);
  const participant = createParticipant(participantInput);
  const duplicate = group.participants.some(candidate =>
    (participant.uuid && candidate.uuid === participant.uuid) || candidate.id === participant.id
  );
  if (!duplicate) group.participants.push(participant);
  // Participant mutations are valid for both the linear and branching Builder.
  // Do not collapse a branching Blueprint back to `basic` metadata here: doing
  // so makes isBuilderEditableBlueprint() reject the still-branched graph and
  // the UI consequently renders the entire document read-only.
  ensureBuilderMetadata(next, { preserveMode: true });
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function removeParticipantFromBasicBlueprint(input, groupId, participantId) {
  const blueprint = createChaseBlueprint(input);
  const next = cloneData(blueprint);
  const group = next.groups.find(candidate => candidate.id === groupId);
  if (!group) return blueprint;
  group.participants = group.participants.filter(candidate => candidate.id !== participantId);
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function replaceBasicGroupsForChaseType(input, chaseType, { preserveParticipants = true } = {}) {
  const blueprint = createChaseBlueprint(input);
  if (!CHASE_TYPES.includes(chaseType)) return blueprint;
  const next = cloneData(blueprint);
  const priorParticipants = preserveParticipants
    ? next.groups.flatMap(group => group.participants ?? [])
    : [];
  const groups = defaultGroupsForChaseType(chaseType);
  if (preserveParticipants && priorParticipants.length > 0) groups[0].participants = priorParticipants;
  next.groups = groups;
  next.settings.chaseType = chaseType;
  // Group resets are also allowed on branching Blueprints, so retain the
  // existing Builder mode instead of invalidating the visual route editor.
  ensureBuilderMetadata(next, { preserveMode: true });
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function validateBasicBuilderBlueprint(input, { forStart = false } = {}) {
  const blueprint = createChaseBlueprint(input);
  const base = validateChaseBlueprint(blueprint);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  if (!isBasicLinearBlueprint(blueprint)) {
    errors.push({ code: "BASIC_BUILDER_NON_LINEAR", path: "graph", message: "The Basic Chase Builder can only edit linear route graphs in dev.7." });
  }
  const cards = listBasicCards(blueprint);
  if (cards.some(item => !item.card)) {
    errors.push({ code: "BASIC_BUILDER_CARD_MISSING", path: "contentSnapshots.cards", message: "One or more linear route cards do not have a local snapshot." });
  }
  const refs = new Set(cards.map(item => item.ref));
  const extraSnapshots = (blueprint.contentSnapshots?.cards ?? []).filter(record => !refs.has(record.ref));
  if (extraSnapshots.length > 0) {
    warnings.push({ code: "BASIC_BUILDER_UNUSED_SNAPSHOTS", path: "contentSnapshots.cards", message: "The Blueprint contains card snapshots that are not used by the linear route.", details: { refs: extraSnapshots.map(record => record.ref) } });
  }
  const type = blueprint.settings?.chaseType;
  const roles = new Set((blueprint.groups ?? []).map(group => group.role));
  if (["pursuit", "escape"].includes(type) && (!roles.has("quarry") || !roles.has("pursuer"))) {
    errors.push({ code: "BASIC_BUILDER_CHASE_ROLES", path: "groups", message: "Pursuit and escape chases require at least one quarry and one pursuer group." });
  }
  if (type === "race" && (blueprint.groups ?? []).filter(group => group.role === "competitor").length < 2) {
    errors.push({ code: "BASIC_BUILDER_RACE_GROUPS", path: "groups", message: "Race chases require at least two competitor groups." });
  }
  if (forStart) {
    if (cards.length === 0) errors.push({ code: "BASIC_BUILDER_NO_CARDS", path: "graph", message: "A chase needs at least one card before it can start." });
    const participantCount = (blueprint.groups ?? []).reduce((total, group) => total + (group.participants?.length ?? 0), 0);
    if (participantCount === 0) warnings.push({ code: "BASIC_BUILDER_NO_PARTICIPANTS", path: "groups", message: "The chase has no concrete participants yet." });
  }
  return Object.freeze({ valid: errors.length === 0, errors, warnings, blueprint });
}

export function participantFromDocument(document, { ownerUserIds = [] } = {}) {
  const actor = document?.actor ?? (document?.documentName === "Actor" ? document : null);
  const tokenLike = document?.documentName === "Token" || document?.documentName === "TokenDocument" || Boolean(document?.actor && document?.documentName !== "Actor");
  return createParticipant({
    id: createId("participant"),
    kind: tokenLike ? "token" : "actor",
    uuid: document?.uuid ?? actor?.uuid ?? null,
    name: document?.name ?? actor?.name ?? "Unbenannter Beteiligter",
    image: document?.texture?.src ?? actor?.img ?? document?.img ?? null,
    ownerUserIds: uniqueStrings(ownerUserIds),
    metadata: { actorUuid: actor?.uuid ?? null }
  });
}

export function basicBuilderSummary(input) {
  const blueprint = createChaseBlueprint(input);
  const cards = isBasicLinearBlueprint(blueprint) ? listBasicCards(blueprint) : [];
  return Object.freeze({
    id: blueprint.id,
    name: blueprint.name,
    chaseType: blueprint.settings.chaseType,
    partyLevel: blueprint.settings.partyLevel,
    difficulty: blueprint.settings.difficulty,
    cardCount: cards.length,
    participantCount: (blueprint.groups ?? []).reduce((sum, group) => sum + (group.participants?.length ?? 0), 0),
    editable: isBasicLinearBlueprint(blueprint),
    updatedAt: blueprint.updatedAt
  });
}

export const BASIC_BUILDER_GROUP_ROLES = GROUP_ROLES;
