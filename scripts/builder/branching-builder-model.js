import { MODULE_ID, MODULE_VERSION } from "../core/constants.js";
import { createChaseBlueprint, createChaseCard, createChaseEdge, createChaseNode } from "../data/factories.js";
import { buildGraphIndex, topologicalSort } from "../data/graph.js";
import { cloneData, createId, nowIso } from "../data/utils.js";
import { validateChaseBlueprint } from "../data/validators.js";
import { createBasicApproach, createManualChaseCard, isBasicLinearBlueprint } from "./basic-builder-model.js";

export const BRANCHING_BUILDER_CONTRACT_VERSION = 1;

function source() {
  return { moduleId: MODULE_ID, packId: "world-builder", version: MODULE_VERSION };
}

function ensureMetadata(blueprint) {
  blueprint.metadata ??= {};
  blueprint.metadata.builder ??= {};
  blueprint.metadata.builder.mode = "branching";
  blueprint.metadata.builder.contractVersion = BRANCHING_BUILDER_CONTRACT_VERSION;
  blueprint.settings.routeComplexity = "branched";
  return blueprint;
}

function snapshotByRef(blueprint) {
  return new Map((blueprint.contentSnapshots?.cards ?? []).map(record => [record.ref, record]));
}

function createCardRecord(blueprint, card, { originCardRef = null, nodeId = createId("node-card"), branchGroupId = null } = {}) {
  const original = createChaseCard(card);
  const ref = `builder:${blueprint.id}:${createId("card")}`;
  const effectiveOrigin = originCardRef ?? (original.source?.packId === "world-builder" ? null : original.id ?? null);
  const data = createChaseCard({
    ...cloneData(original),
    id: ref,
    source: source(),
    metadata: {
      ...(original.metadata ?? {}),
      builderCreated: original.metadata?.builderCreated === true,
      originCardRef: effectiveOrigin,
      originSource: effectiveOrigin ? cloneData(original.source ?? null) : null,
      branchGroupId
    }
  });
  return {
    ref,
    source: source(),
    data,
    capturedAt: nowIso(),
    metadata: { nodeId, originCardRef: effectiveOrigin, branchGroupId }
  };
}

export function isBranchingBuilderBlueprint(input) {
  const blueprint = createChaseBlueprint(input);
  if (blueprint.metadata?.builder?.mode !== "branching") return false;
  const validation = validateChaseBlueprint(blueprint);
  if (!validation.valid) return false;
  const snapshots = snapshotByRef(blueprint);
  for (const node of blueprint.graph?.nodes ?? []) {
    if (node.type === "card" && (!node.cardRef || !snapshots.get(node.cardRef)?.data)) return false;
  }
  return true;
}

export function isBuilderEditableBlueprint(input) {
  return isBasicLinearBlueprint(input) || isBranchingBuilderBlueprint(input);
}

export function convertToBranchingBuilder(input) {
  const blueprint = createChaseBlueprint(input);
  if (!isBasicLinearBlueprint(blueprint) && !isBranchingBuilderBlueprint(blueprint)) {
    throw new Error("Only Basic Builder linear or Branching Builder Blueprints can be converted.");
  }
  const next = ensureMetadata(cloneData(blueprint));
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

function cardInfo(blueprint, node, orderIndex = 0) {
  const snapshots = snapshotByRef(blueprint);
  const record = snapshots.get(node.cardRef) ?? null;
  const { incoming, outgoing } = buildGraphIndex(blueprint.graph);
  const inEdges = incoming.get(node.id) ?? [];
  const outEdges = outgoing.get(node.id) ?? [];
  return {
    index: orderIndex,
    node: cloneData(node),
    nodeId: node.id,
    ref: node.cardRef,
    record: record ? cloneData(record) : null,
    card: record?.data ? createChaseCard(record.data) : null,
    incomingEdges: cloneData(inEdges),
    outgoingEdges: cloneData(outEdges),
    branchGroupId: node.metadata?.branchGroupId ?? record?.metadata?.branchGroupId ?? null,
    canAddBranch: !node.metadata?.branchGroupId && outEdges.length === 1
  };
}

export function listBranchingCards(input) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) return [];
  const order = topologicalSort(blueprint.graph) ?? blueprint.graph.nodes.map(node => node.id);
  const byId = new Map(blueprint.graph.nodes.map(node => [node.id, node]));
  return order.map(id => byId.get(id)).filter(node => node?.type === "card").map((node, index) => cardInfo(blueprint, node, index));
}

export function listEditableCards(input) {
  if (isBasicLinearBlueprint(input)) {
    // Lazy import avoidance: reconstruct in graph order using snapshots.
    const blueprint = createChaseBlueprint(input);
    const order = topologicalSort(blueprint.graph) ?? blueprint.graph.nodes.map(node => node.id);
    const byId = new Map(blueprint.graph.nodes.map(node => [node.id, node]));
    return order.map(id => byId.get(id)).filter(node => node?.type === "card").map((node, index) => cardInfo(blueprint, node, index));
  }
  return listBranchingCards(input);
}

export function listBranchGroups(input) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) return [];
  const { nodeById, outgoing } = buildGraphIndex(blueprint.graph);
  const groupIds = new Set();
  for (const node of blueprint.graph.nodes) if (node.metadata?.branchGroupId) groupIds.add(node.metadata.branchGroupId);
  for (const edge of blueprint.graph.edges) if (edge.metadata?.branchGroupId) groupIds.add(edge.metadata.branchGroupId);
  const snapshots = snapshotByRef(blueprint);
  const groups = [];
  for (const branchGroupId of groupIds) {
    const merge = blueprint.graph.nodes.find(node => node.type === "merge" && node.metadata?.branchGroupId === branchGroupId) ?? null;
    const sourceId = merge?.metadata?.sourceNodeId ?? blueprint.graph.edges.find(edge => edge.metadata?.branchGroupId === branchGroupId && edge.metadata?.branchEntry)?.from ?? null;
    const sourceNode = nodeById.get(sourceId) ?? null;
    const entryEdges = (outgoing.get(sourceId) ?? [])
      .filter(edge => edge.metadata?.branchGroupId === branchGroupId && edge.metadata?.branchEntry)
      // Replacing a branch-entry edge during relative insertion changes its
      // physical array position. The visual lane order must remain stable.
      .sort((a, b) => {
        const laneOrder = lane => lane === "left" ? 0 : lane === "right" ? 1 : 10;
        const laneDelta = laneOrder(a.metadata?.branchLane) - laneOrder(b.metadata?.branchLane);
        if (laneDelta) return laneDelta;
        return String(a.label ?? a.id).localeCompare(String(b.label ?? b.id));
      });
    const routes = entryEdges.map(edge => {
      const nodes = [];
      let currentId = edge.to;
      const seen = new Set();
      while (currentId && currentId !== merge?.id && !seen.has(currentId)) {
        seen.add(currentId);
        const node = nodeById.get(currentId);
        if (!node) break;
        if (node.type === "card") {
          const record = snapshots.get(node.cardRef);
          nodes.push({ nodeId: node.id, ref: node.cardRef, name: record?.data?.name ?? node.label ?? node.id });
        }
        const next = (outgoing.get(currentId) ?? []).find(candidate => candidate.metadata?.branchGroupId === branchGroupId) ?? (outgoing.get(currentId) ?? [])[0];
        currentId = next?.to ?? null;
      }
      return {
        edgeId: edge.id,
        label: edge.label || "Route",
        description: edge.description || "",
        visibility: edge.visibility,
        type: edge.type,
        nodes
      };
    });
    const continuationEdge = merge ? (outgoing.get(merge.id) ?? [])[0] : null;
    const continuation = continuationEdge ? nodeById.get(continuationEdge.to) : null;
    groups.push({
      branchGroupId,
      sourceNodeId: sourceId,
      sourceLabel: sourceNode?.label || snapshots.get(sourceNode?.cardRef)?.data?.name || sourceId,
      mergeNodeId: merge?.id ?? null,
      continuationNodeId: continuation?.id ?? null,
      continuationLabel: continuation?.label || snapshots.get(continuation?.cardRef)?.data?.name || continuation?.id || "",
      routes
    });
  }
  return groups;
}

export function addBranchAfterCard(input, sourceNodeId, {
  leftLabel = "Route A",
  rightLabel = "Route B",
  leftCardName = "Route A – Hindernis",
  rightCardName = "Route B – Hindernis"
} = {}) {
  let blueprint = createChaseBlueprint(input);
  if (isBasicLinearBlueprint(blueprint)) blueprint = convertToBranchingBuilder(blueprint);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Branching Builder.");
  const next = cloneData(blueprint);
  const { nodeById, outgoing } = buildGraphIndex(next.graph);
  const sourceNode = nodeById.get(sourceNodeId);
  if (!sourceNode || sourceNode.type !== "card") throw new Error("A branch must start after a Chase card.");
  if (sourceNode.metadata?.branchGroupId) throw new Error("Nested branch creation is not supported in this development build.");
  const sourceEdges = outgoing.get(sourceNodeId) ?? [];
  if (sourceEdges.length !== 1) throw new Error("This card already has a route choice or no unique continuation.");
  const originalEdge = sourceEdges[0];
  const continuationId = originalEdge.to;
  const branchGroupId = createId("branch");
  const leftNodeId = createId("node-card");
  const rightNodeId = createId("node-card");
  const mergeNodeId = createId("node-merge");

  const largestGroup = Math.max(1, ...(next.groups ?? []).map(group => group.participants?.length ?? 0));
  const requiredPoints = Math.max(1, largestGroup - 1);
  const leftRecord = createCardRecord(next, createManualChaseCard({ requiredPoints, name: leftCardName }), { nodeId: leftNodeId, branchGroupId });
  const rightRecord = createCardRecord(next, createManualChaseCard({ requiredPoints, name: rightCardName }), { nodeId: rightNodeId, branchGroupId });
  next.contentSnapshots.cards.push(leftRecord, rightRecord);

  next.graph.nodes.push(
    createChaseNode({ id: leftNodeId, type: "card", label: leftCardName, cardRef: leftRecord.ref, metadata: { branchGroupId, branchLane: "left" } }),
    createChaseNode({ id: rightNodeId, type: "card", label: rightCardName, cardRef: rightRecord.ref, metadata: { branchGroupId, branchLane: "right" } }),
    createChaseNode({ id: mergeNodeId, type: "merge", label: "Zusammenführung", metadata: { branchGroupId, sourceNodeId, continuationNodeId: continuationId } })
  );
  next.graph.edges = next.graph.edges.filter(edge => edge.id !== originalEdge.id);
  next.graph.edges.push(
    createChaseEdge({ id: createId("edge"), from: sourceNodeId, to: leftNodeId, type: "branch", visibility: "public", label: leftLabel, metadata: { branchGroupId, branchEntry: true, branchLane: "left" } }),
    createChaseEdge({ id: createId("edge"), from: sourceNodeId, to: rightNodeId, type: "branch", visibility: "public", label: rightLabel, metadata: { branchGroupId, branchEntry: true, branchLane: "right" } }),
    createChaseEdge({ id: createId("edge"), from: leftNodeId, to: mergeNodeId, type: "normal", visibility: "public", metadata: { branchGroupId, branchLane: "left" } }),
    createChaseEdge({ id: createId("edge"), from: rightNodeId, to: mergeNodeId, type: "normal", visibility: "public", metadata: { branchGroupId, branchLane: "right" } }),
    createChaseEdge({ id: createId("edge"), from: mergeNodeId, to: continuationId, type: originalEdge.type, visibility: originalEdge.visibility, label: originalEdge.label, description: originalEdge.description, conditions: originalEdge.conditions, metadata: { ...(originalEdge.metadata ?? {}), branchGroupId, branchContinuation: true } })
  );
  ensureMetadata(next);
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function appendCardToBranchRoute(input, edgeId, { name = "Weiteres Hindernis" } = {}) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Branching Builder.");
  const next = cloneData(blueprint);
  const entryEdge = next.graph.edges.find(edge => edge.id === edgeId && edge.metadata?.branchEntry);
  if (!entryEdge) throw new Error("Unknown branch route.");
  const branchGroupId = entryEdge.metadata.branchGroupId;
  const lane = entryEdge.metadata.branchLane ?? null;
  const { nodeById, outgoing } = buildGraphIndex(next.graph);
  const merge = next.graph.nodes.find(node => node.type === "merge" && node.metadata?.branchGroupId === branchGroupId);
  if (!merge) throw new Error("Branch merge node is missing.");
  let currentId = entryEdge.to;
  let tailEdge = null;
  const seen = new Set();
  while (currentId && currentId !== merge.id && !seen.has(currentId)) {
    seen.add(currentId);
    const candidates = (outgoing.get(currentId) ?? []).filter(edge => edge.metadata?.branchGroupId === branchGroupId);
    tailEdge = candidates[0] ?? (outgoing.get(currentId) ?? [])[0] ?? null;
    if (!tailEdge || tailEdge.to === merge.id) break;
    currentId = tailEdge.to;
  }
  // An empty branch is represented by the branch-entry edge connecting the
  // decision source directly to the merge. In that case the entry edge is
  // itself the route segment that must be split by the new card.
  if (!tailEdge && entryEdge.to === merge.id) tailEdge = entryEdge;
  if (!tailEdge) throw new Error("Branch route has no merge connection.");
  const tailNode = nodeById.get(tailEdge.from);
  if (!tailNode) throw new Error("Branch route tail is invalid.");
  const newNodeId = createId("node-card");
  const largestGroup = Math.max(1, ...(next.groups ?? []).map(group => group.participants?.length ?? 0));
  const record = createCardRecord(next, createManualChaseCard({ requiredPoints: Math.max(1, largestGroup - 1), name }), { nodeId: newNodeId, branchGroupId });
  next.contentSnapshots.cards.push(record);
  next.graph.nodes.push(createChaseNode({ id: newNodeId, type: "card", label: name, cardRef: record.ref, metadata: { branchGroupId, branchLane: lane } }));
  next.graph.edges = next.graph.edges.filter(edge => edge.id !== tailEdge.id);
  const emptyRoute = tailEdge.id === entryEdge.id && entryEdge.to === merge.id;
  next.graph.edges.push(
    emptyRoute
      ? createChaseEdge({
          id: tailEdge.id,
          from: tailEdge.from,
          to: newNodeId,
          type: tailEdge.type,
          visibility: tailEdge.visibility,
          label: tailEdge.label,
          description: tailEdge.description,
          conditions: tailEdge.conditions,
          metadata: { ...(tailEdge.metadata ?? {}), branchGroupId, branchLane: lane, branchEntry: true }
        })
      : createChaseEdge({ id: createId("edge"), from: tailEdge.from, to: newNodeId, type: "normal", visibility: "public", metadata: { branchGroupId, branchLane: lane } }),
    createChaseEdge({
      id: createId("edge"),
      from: newNodeId,
      to: tailEdge.to,
      type: emptyRoute ? "normal" : tailEdge.type,
      visibility: emptyRoute ? "public" : tailEdge.visibility,
      label: emptyRoute ? "" : tailEdge.label,
      description: emptyRoute ? "" : tailEdge.description,
      conditions: emptyRoute ? [] : tailEdge.conditions,
      metadata: emptyRoute
        ? { branchGroupId, branchLane: lane }
        : { ...(tailEdge.metadata ?? {}), branchGroupId, branchLane: lane }
    })
  );
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function updateBranchRoute(input, edgeId, updates = {}) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Branching Builder.");
  const next = cloneData(blueprint);
  const edge = next.graph.edges.find(candidate => candidate.id === edgeId);
  if (!edge || !edge.metadata?.branchEntry) return blueprint;
  if (updates.label !== undefined) edge.label = String(updates.label ?? "").trim();
  if (updates.description !== undefined) edge.description = String(updates.description ?? "");
  if (["public", "hidden", "discoverable"].includes(updates.visibility)) edge.visibility = updates.visibility;
  if (["branch", "shortcut", "conditional"].includes(updates.type)) edge.type = updates.type;
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function updateBuilderCardByRef(input, cardRef, updater) {
  const blueprint = createChaseBlueprint(input);
  if (!isBuilderEditableBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Chase Builder.");
  const next = cloneData(blueprint);
  const record = next.contentSnapshots?.cards?.find(candidate => candidate.ref === cardRef);
  if (!record?.data) return blueprint;
  const candidate = typeof updater === "function" ? updater(cloneData(record.data)) : updater;
  record.data = createChaseCard({ ...cloneData(candidate), id: record.ref, source: source() });
  record.capturedAt = nowIso();
  const node = next.graph.nodes.find(candidateNode => candidateNode.cardRef === cardRef);
  if (node) {
    node.label = record.data.name;
    node.description = record.data.description ?? "";
  }
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function addApproachToBuilderCard(input, cardRef, approach = {}) {
  return updateBuilderCardByRef(input, cardRef, card => ({ ...card, approaches: [...(card.approaches ?? []), createBasicApproach(approach)] }));
}

export function removeApproachFromBuilderCard(input, cardRef, approachIndex) {
  return updateBuilderCardByRef(input, cardRef, card => {
    const approaches = [...(card.approaches ?? [])];
    const index = Math.trunc(Number(approachIndex));
    if (index >= 0 && index < approaches.length) approaches.splice(index, 1);
    return { ...card, approaches };
  });
}



/**
 * Insert a card immediately before or after an existing card in a managed
 * branching graph. Branch-lane membership and branch-entry/continuation
 * edge semantics are preserved. If the target card owns a branch, an
 * "after" insertion is placed after the branch merge so the branch remains
 * attached directly to the obstacle that triggers it.
 */
export function insertCardRelativeToBuilderCard(input, targetCardRef, card, { position = "after", originCardRef = null } = {}) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("Relative card insertion requires a Branching Builder Blueprint.");
  if (!["before", "after"].includes(position)) throw new Error(`Unsupported relative insertion position '${position}'.`);

  const next = cloneData(blueprint);
  const targetNode = next.graph.nodes.find(node => node.type === "card" && node.cardRef === targetCardRef);
  if (!targetNode) throw new Error("Unknown Chase card for relative insertion.");

  const branchGroupId = targetNode.metadata?.branchGroupId ?? null;
  const branchLane = targetNode.metadata?.branchLane ?? null;
  const nodeId = createId("node-card");
  const record = createCardRecord(next, card, { originCardRef, nodeId, branchGroupId });
  const nodeMetadata = branchGroupId ? { branchGroupId, branchLane } : {};
  const newNode = createChaseNode({
    id: nodeId,
    type: "card",
    label: record.data.name,
    description: record.data.description ?? "",
    cardRef: record.ref,
    metadata: nodeMetadata
  });

  const copyEdge = (edge, { id = edge.id, from = edge.from, to = edge.to, metadata = edge.metadata } = {}) => createChaseEdge({
    id, from, to,
    type: edge.type,
    visibility: edge.visibility,
    label: edge.label,
    description: edge.description,
    conditions: edge.conditions,
    metadata: cloneData(metadata ?? {})
  });
  const laneMetadata = branchGroupId ? { branchGroupId, branchLane } : {};

  next.contentSnapshots.cards.push(record);
  next.graph.nodes.push(newNode);

  if (position === "before") {
    const incoming = next.graph.edges.filter(edge => edge.to === targetNode.id);
    if (incoming.length !== 1) throw new Error("The Builder cannot determine a unique route immediately before this card.");
    const edge = incoming[0];
    next.graph.edges = next.graph.edges.filter(candidate => candidate.id !== edge.id);
    next.graph.edges.push(
      copyEdge(edge, { to: nodeId }),
      createChaseEdge({ id: createId("edge"), from: nodeId, to: targetNode.id, type: "normal", visibility: "public", metadata: laneMetadata })
    );
    const incomingMerge = next.graph.nodes.find(candidate => candidate.id === edge.from && candidate.type === "merge");
    if (incomingMerge?.metadata?.continuationNodeId === targetNode.id) incomingMerge.metadata.continuationNodeId = nodeId;
  } else {
    // A mainline card that owns a branch must continue to own that branch.
    // Therefore "after" means after the complete split/merge block rather
    // than re-anchoring the decision to the newly inserted obstacle.
    const ownedMerge = next.graph.nodes.find(node =>
      node.type === "merge"
      && node.metadata?.sourceNodeId === targetNode.id
      && node.metadata?.branchGroupId
    );
    if (ownedMerge) {
      const outgoing = next.graph.edges.filter(edge => edge.from === ownedMerge.id);
      if (outgoing.length !== 1) throw new Error("The Builder cannot determine a unique continuation after this branch.");
      const edge = outgoing[0];
      next.graph.edges = next.graph.edges.filter(candidate => candidate.id !== edge.id);
      next.graph.edges.push(
        copyEdge(edge, { to: nodeId }),
        createChaseEdge({ id: createId("edge"), from: nodeId, to: edge.to, type: "normal", visibility: "public" })
      );
      ownedMerge.metadata ??= {};
      ownedMerge.metadata.continuationNodeId = nodeId;
    } else {
      const outgoing = next.graph.edges.filter(edge => edge.from === targetNode.id);
      if (outgoing.length !== 1) throw new Error("The Builder cannot determine a unique route immediately after this card.");
      const edge = outgoing[0];
      next.graph.edges = next.graph.edges.filter(candidate => candidate.id !== edge.id);
      next.graph.edges.push(
        createChaseEdge({ id: createId("edge"), from: targetNode.id, to: nodeId, type: "normal", visibility: "public", metadata: laneMetadata }),
        copyEdge(edge, { from: nodeId })
      );
    }
  }

  next.updatedAt = nowIso();
  return { blueprint: createChaseBlueprint(next), ref: record.ref, nodeId };
}

export function insertManualCardRelativeToBuilderCard(input, targetCardRef, { position = "after", name = "Neues Hindernis", requiredPoints = null } = {}) {
  const blueprint = createChaseBlueprint(input);
  const largestGroup = Math.max(1, ...(blueprint.groups ?? []).map(group => group.participants?.length ?? 0));
  const points = requiredPoints ?? Math.max(1, largestGroup - 1);
  return insertCardRelativeToBuilderCard(blueprint, targetCardRef, createManualChaseCard({ requiredPoints: points, name }), { position });
}

export function removeBuilderCardByRef(input, cardRef) {
  const blueprint = createChaseBlueprint(input);
  if (isBasicLinearBlueprint(blueprint)) {
    const cards = listEditableCards(blueprint);
    const index = cards.findIndex(item => item.ref === cardRef);
    if (index < 0) return blueprint;
    const next = cloneData(blueprint);
    const records = [...(next.contentSnapshots?.cards ?? [])];
    const recordIndex = records.findIndex(record => record.ref === cardRef);
    if (recordIndex >= 0) records.splice(recordIndex, 1);
    next.contentSnapshots.cards = records;
    // Rebuild the simple linear graph without importing the basic helper and
    // creating a circular module dependency. The caller normally uses the
    // Basic Builder helper for linear blueprints; this branch is defensive.
    const start = next.graph.nodes.find(node => node.id === next.graph.startNodeId);
    const endIds = new Set(next.graph.endNodeIds ?? []);
    const end = next.graph.nodes.find(node => endIds.has(node.id) && node.type === "end");
    if (!start || !end) return blueprint;
    const snapshots = new Map(records.map(record => [record.ref, record]));
    const cardNodes = cards.filter(item => item.ref !== cardRef).map(item => {
      const node = cloneData(item.node);
      const record = snapshots.get(item.ref);
      if (record?.data) {
        node.label = record.data.name;
        node.description = record.data.description ?? "";
      }
      return node;
    });
    next.graph.nodes = [cloneData(start), ...cardNodes, cloneData(end)];
    next.graph.edges = [];
    let priorId = start.id;
    for (const node of cardNodes) {
      next.graph.edges.push(createChaseEdge({ id: createId("edge"), from: priorId, to: node.id, type: "normal", visibility: "public" }));
      priorId = node.id;
    }
    next.graph.edges.push(createChaseEdge({ id: createId("edge"), from: priorId, to: end.id, type: "normal", visibility: "public" }));
    next.updatedAt = nowIso();
    return createChaseBlueprint(next);
  }
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Chase Builder.");

  const next = cloneData(blueprint);
  const node = next.graph.nodes.find(candidate => candidate.type === "card" && candidate.cardRef === cardRef);
  if (!node) return blueprint;

  const isBranchSource = next.graph.nodes.some(candidate =>
    candidate.type === "merge"
    && candidate.metadata?.sourceNodeId === node.id
    && candidate.metadata?.branchGroupId
  );
  if (isBranchSource) {
    const error = new Error("A card that owns a branch cannot be removed until the branch is removed.");
    error.code = "BRANCH_SOURCE_CARD";
    throw error;
  }

  const incoming = next.graph.edges.filter(edge => edge.to === node.id);
  const outgoing = next.graph.edges.filter(edge => edge.from === node.id);
  if (incoming.length !== 1 || outgoing.length !== 1) {
    const error = new Error("The Builder cannot safely reconnect this card's route edges.");
    error.code = "CARD_ROUTE_AMBIGUOUS";
    throw error;
  }

  const inEdge = incoming[0];
  const outEdge = outgoing[0];
  const reconnect = createChaseEdge({
    id: inEdge.id,
    from: inEdge.from,
    to: outEdge.to,
    type: inEdge.metadata?.branchEntry ? inEdge.type : outEdge.type,
    visibility: inEdge.metadata?.branchEntry ? inEdge.visibility : outEdge.visibility,
    label: inEdge.metadata?.branchEntry ? inEdge.label : outEdge.label,
    description: inEdge.metadata?.branchEntry ? inEdge.description : outEdge.description,
    conditions: inEdge.metadata?.branchEntry ? inEdge.conditions : outEdge.conditions,
    metadata: { ...(outEdge.metadata ?? {}), ...(inEdge.metadata ?? {}) }
  });

  next.graph.nodes = next.graph.nodes.filter(candidate => candidate.id !== node.id);
  next.graph.edges = next.graph.edges.filter(edge => edge.id !== inEdge.id && edge.id !== outEdge.id);
  next.graph.edges.push(reconnect);
  next.contentSnapshots.cards = (next.contentSnapshots?.cards ?? []).filter(record => record.ref !== cardRef);
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}

export function removeBranchGroup(input, branchGroupId) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("The Blueprint is not editable by the Branching Builder.");
  const next = cloneData(blueprint);
  const merge = next.graph.nodes.find(node => node.type === "merge" && node.metadata?.branchGroupId === branchGroupId);
  if (!merge) return blueprint;
  const sourceNodeId = merge.metadata?.sourceNodeId;
  const continuationNodeId = merge.metadata?.continuationNodeId ?? next.graph.edges.find(edge => edge.from === merge.id)?.to;
  if (!sourceNodeId || !continuationNodeId) throw new Error("Branch metadata is incomplete.");
  const branchNodes = new Set(next.graph.nodes.filter(node => node.metadata?.branchGroupId === branchGroupId).map(node => node.id));
  const branchRefs = new Set(next.graph.nodes.filter(node => branchNodes.has(node.id) && node.type === "card").map(node => node.cardRef));
  next.graph.nodes = next.graph.nodes.filter(node => !branchNodes.has(node.id));
  next.graph.edges = next.graph.edges.filter(edge => !branchNodes.has(edge.from) && !branchNodes.has(edge.to) && edge.metadata?.branchGroupId !== branchGroupId);
  next.graph.edges.push(createChaseEdge({ id: createId("edge"), from: sourceNodeId, to: continuationNodeId, type: "normal", visibility: "public" }));
  next.contentSnapshots.cards = (next.contentSnapshots.cards ?? []).filter(record => !branchRefs.has(record.ref));
  const remainingBranches = next.graph.nodes.some(node => node.metadata?.branchGroupId) || next.graph.edges.some(edge => edge.metadata?.branchGroupId);
  if (!remainingBranches) {
    next.metadata.builder.mode = "basic";
    next.settings.routeComplexity = "linear";
  }
  next.updatedAt = nowIso();
  return createChaseBlueprint(next);
}


export function appendMainlineCard(input, card, { originCardRef = null } = {}) {
  const blueprint = createChaseBlueprint(input);
  if (!isBranchingBuilderBlueprint(blueprint)) throw new Error("Mainline append requires a Branching Builder Blueprint.");
  const next = cloneData(blueprint);
  if ((next.graph.endNodeIds?.length ?? 0) !== 1) throw new Error("Branching Builder mainline append requires exactly one end node.");
  const endId = next.graph.endNodeIds[0];
  const incoming = next.graph.edges.filter(edge => edge.to === endId);
  if (incoming.length !== 1) throw new Error("The Builder cannot determine a unique mainline continuation before the end node.");
  const priorEdge = incoming[0];
  const nodeId = createId("node-card");
  const record = createCardRecord(next, card, { originCardRef, nodeId });
  next.contentSnapshots.cards.push(record);
  next.graph.nodes.push(createChaseNode({ id: nodeId, type: "card", label: record.data.name, description: record.data.description ?? "", cardRef: record.ref }));
  next.graph.edges = next.graph.edges.filter(edge => edge.id !== priorEdge.id);
  next.graph.edges.push(
    createChaseEdge({ id: createId("edge"), from: priorEdge.from, to: nodeId, type: priorEdge.type, visibility: priorEdge.visibility, label: priorEdge.label, description: priorEdge.description, conditions: priorEdge.conditions, metadata: cloneData(priorEdge.metadata ?? {}) }),
    createChaseEdge({ id: createId("edge"), from: nodeId, to: endId, type: "normal", visibility: "public" })
  );
  next.updatedAt = nowIso();
  return { blueprint: createChaseBlueprint(next), ref: record.ref, nodeId };
}

export function appendMainlineManualCard(input, options = {}) {
  const blueprint = createChaseBlueprint(input);
  const largestGroup = Math.max(1, ...(blueprint.groups ?? []).map(group => group.participants?.length ?? 0));
  return appendMainlineCard(blueprint, createManualChaseCard({ requiredPoints: options.requiredPoints ?? Math.max(1, largestGroup - 1), name: options.name ?? "Neues Hindernis" }), options);
}

export function validateBranchingBuilderBlueprint(input, { forStart = false } = {}) {
  const blueprint = createChaseBlueprint(input);
  const base = validateChaseBlueprint(blueprint);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  if (!isBranchingBuilderBlueprint(blueprint)) {
    errors.push({ code: "BRANCHING_BUILDER_UNSUPPORTED", path: "graph", message: "The Branching Chase Builder can only edit its own managed route graphs." });
  }
  const cards = listBranchingCards(blueprint);
  if (cards.some(item => !item.card)) errors.push({ code: "BRANCHING_BUILDER_CARD_MISSING", path: "contentSnapshots.cards", message: "A route card snapshot is missing." });
  if (forStart && cards.length === 0) errors.push({ code: "BRANCHING_BUILDER_NO_CARDS", path: "graph", message: "A chase needs at least one card before it can start." });
  return Object.freeze({ valid: errors.length === 0, errors, warnings, blueprint });
}
