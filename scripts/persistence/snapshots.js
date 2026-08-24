import { createChaseBlueprint } from "../data/factories.js";
import { cloneData, nowIso } from "../data/utils.js";

function cardRefs(blueprint) {
  return [...new Set((blueprint?.graph?.nodes ?? []).filter(node => node?.type === "card" && node.cardRef).map(node => node.cardRef))];
}

export function snapshotBlueprintContent(input, { registries } = {}) {
  const blueprint = createChaseBlueprint(input);
  const cards = [];
  for (const ref of cardRefs(blueprint)) {
    const card = registries?.getCard?.(ref, { includeDisabled: true }) ?? null;
    if (!card) continue;
    cards.push({
      ref,
      source: cloneData(card.source ?? {}),
      data: cloneData(card),
      capturedAt: nowIso(),
      metadata: {}
    });
  }
  return createChaseBlueprint({
    ...blueprint,
    contentSnapshots: {
      ...(blueprint.contentSnapshots ?? {}),
      mode: "snapshot",
      cards,
      images: blueprint.contentSnapshots?.images ?? [],
      effects: blueprint.contentSnapshots?.effects ?? [],
      metadata: {
        ...(blueprint.contentSnapshots?.metadata ?? {}),
        capturedAt: nowIso()
      }
    },
    updatedAt: nowIso()
  });
}

export function useLiveBlueprintContent(input, { keepSnapshots = true } = {}) {
  const blueprint = createChaseBlueprint(input);
  return createChaseBlueprint({
    ...blueprint,
    contentSnapshots: {
      ...(blueprint.contentSnapshots ?? {}),
      mode: "references",
      cards: keepSnapshots ? blueprint.contentSnapshots?.cards ?? [] : [],
      images: keepSnapshots ? blueprint.contentSnapshots?.images ?? [] : [],
      effects: keepSnapshots ? blueprint.contentSnapshots?.effects ?? [] : [],
      metadata: blueprint.contentSnapshots?.metadata ?? {}
    },
    updatedAt: nowIso()
  });
}

export function resolveBlueprintCard(input, ref, { registries } = {}) {
  const blueprint = createChaseBlueprint(input);
  const live = registries?.getCard?.(ref, { includeDisabled: true }) ?? null;
  if (live && blueprint.contentSnapshots?.mode !== "snapshot") return { source: "live", card: cloneData(live) };
  const snap = blueprint.contentSnapshots?.cards?.find(record => record.ref === ref)?.data ?? null;
  if (snap) return { source: "snapshot", card: cloneData(snap) };
  return live ? { source: "live", card: cloneData(live) } : { source: null, card: null };
}
