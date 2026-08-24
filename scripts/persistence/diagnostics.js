import { createChaseBlueprint } from "../data/factories.js";
import { cloneData } from "../data/utils.js";
import { resolveBlueprintCard } from "./snapshots.js";

async function resolveUuid(uuid, resolver) {
  if (!uuid) return null;
  try {
    if (resolver) return await resolver(uuid);
    if (typeof globalThis.fromUuid === "function") return await globalThis.fromUuid(uuid);
  } catch { /* noop */ }
  return null;
}

export async function inspectBlueprintReferences(input, { registries = null, resolver = null } = {}) {
  const blueprint = createChaseBlueprint(input);
  const issues = [];
  const resources = [];

  for (const group of blueprint.groups) {
    for (const participant of group.participants) {
      if (!["actor", "token"].includes(participant.kind) || !participant.uuid) continue;
      const document = await resolveUuid(participant.uuid, resolver);
      resources.push({ kind: participant.kind, ref: participant.uuid, available: Boolean(document) });
      if (!document) issues.push({ severity: "warning", code: "MISSING_PARTICIPANT_DOCUMENT", ref: participant.uuid, participantId: participant.id, groupId: group.id });
    }
  }

  for (const node of blueprint.graph.nodes.filter(node => node.type === "card" && node.cardRef)) {
    const resolved = resolveBlueprintCard(blueprint, node.cardRef, { registries });
    resources.push({ kind: "card", ref: node.cardRef, available: Boolean(resolved.card), source: resolved.source });
    if (!resolved.card) issues.push({ severity: "error", code: "MISSING_CARD", ref: node.cardRef, nodeId: node.id });
    else if (resolved.source === "snapshot" && !registries?.getCard?.(node.cardRef, { includeDisabled: true })) {
      issues.push({ severity: "info", code: "SNAPSHOT_CARD_FALLBACK", ref: node.cardRef, nodeId: node.id });
    }
  }

  const providerIds = new Set();
  if (blueprint.image?.providerId) providerIds.add(blueprint.image.providerId);
  for (const candidate of blueprint.image?.candidates ?? []) if (candidate.providerId) providerIds.add(candidate.providerId);
  for (const providerId of providerIds) {
    const provider = registries?.getImageProvider?.(providerId, { includeDisabled: true }) ?? null;
    resources.push({ kind: "imageProvider", ref: providerId, available: Boolean(provider) });
    if (!provider) issues.push({ severity: "warning", code: "MISSING_IMAGE_PROVIDER", ref: providerId });
  }

  return Object.freeze({
    valid: !issues.some(issue => issue.severity === "error"),
    blueprintId: blueprint.id,
    issues: cloneData(issues),
    resources: cloneData(resources)
  });
}
