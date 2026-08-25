import { cloneData } from "../data/utils.js";

export const CHASE_VISUAL_SYSTEM_CONTRACT_VERSION = 1;

function strings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(value => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeCandidate(candidate = {}, fallbackProviderId = null) {
  if (!candidate || typeof candidate !== "object") return null;
  const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
  if (!path) return null;
  return {
    id: String(candidate.id ?? path),
    path,
    providerId: candidate.providerId ? String(candidate.providerId) : fallbackProviderId,
    alt: String(candidate.alt ?? ""),
    tags: strings(candidate.tags),
    weight: Math.max(0, Number.isFinite(Number(candidate.weight)) ? Number(candidate.weight) : 1),
    metadata: candidate.metadata && typeof candidate.metadata === "object" ? cloneData(candidate.metadata) : {}
  };
}

export function buildChaseImageContext({ blueprint = null, card = null, kind = "card", extra = {} } = {}) {
  const settings = cloneData(blueprint?.settings ?? {});
  const tags = strings([
    ...(blueprint?.tags ?? []),
    ...(settings.environmentTags ?? []),
    ...(settings.toneTags ?? []),
    ...(settings.movementModes ?? []),
    ...(card?.tags ?? []),
    ...(card?.metadata?.imageTags ?? [])
  ]);
  return {
    kind,
    blueprintId: blueprint?.id ?? null,
    blueprintName: blueprint?.name ?? "",
    cardId: card?.id ?? null,
    cardType: card?.type ?? null,
    tags,
    environmentTags: strings(settings.environmentTags),
    toneTags: strings(settings.toneTags),
    movementModes: strings(settings.movementModes),
    timeOfDay: settings.timeOfDay ?? null,
    weather: cloneData(settings.weather ?? null),
    settings,
    blueprint: blueprint ? cloneData(blueprint) : null,
    card: card ? cloneData(card) : null,
    ...cloneData(extra ?? {})
  };
}

export function selectImageCandidate(candidates = [], imageId = null) {
  const list = (Array.isArray(candidates) ? candidates : []).map(candidate => normalizeCandidate(candidate)).filter(Boolean);
  if (!list.length) return null;
  if (imageId) {
    const chosen = list.find(candidate => candidate.id === String(imageId));
    if (chosen) return chosen;
  }
  return list[0];
}

export function applyImageCandidate(image = {}, candidate = {}, { mode = null } = {}) {
  const normalized = normalizeCandidate(candidate, candidate?.providerId ?? image?.providerId ?? null);
  if (!normalized) return cloneData(image ?? {});
  return {
    ...(cloneData(image ?? {})),
    mode: mode ?? image?.mode ?? (normalized.providerId ? "provider" : "predefined"),
    path: normalized.path,
    providerId: normalized.providerId ?? image?.providerId ?? null,
    imageId: normalized.id,
    alt: normalized.alt || image?.alt || ""
  };
}

function resolved(candidate, { mode, fallback = false } = {}) {
  if (!candidate?.path) return null;
  return {
    id: candidate.id ?? candidate.path,
    path: candidate.path,
    providerId: candidate.providerId ?? null,
    alt: candidate.alt ?? "",
    tags: strings(candidate.tags),
    metadata: cloneData(candidate.metadata ?? {}),
    mode,
    fallback
  };
}

export function createChaseImageService({ images = null } = {}) {
  const resolutionCache = new Map();
  const candidateCache = new Map();
  const collect = async (context = {}, options = {}) => {
    if (!images?.collectCandidates) return { candidates: [], errors: [] };
    const result = await images.collectCandidates(context, options);
    return {
      candidates: (result?.candidates ?? []).map(candidate => normalizeCandidate(candidate)).filter(Boolean),
      errors: cloneData(result?.errors ?? [])
    };
  };

  const resolve = async (image = {}, context = {}, { fallbackImage = null, refresh = false } = {}) => {
    const mode = image?.mode ?? "none";
    if (mode === "none") {
      if (fallbackImage) {
        const fallbackResolved = await resolve(fallbackImage, { ...context, fallback: true });
        return fallbackResolved ? { ...fallbackResolved, fallback: true } : null;
      }
      return null;
    }

    if (image?.path) {
      return resolved(normalizeCandidate({
        id: image.imageId ?? image.path,
        path: image.path,
        providerId: image.providerId ?? null,
        alt: image.alt ?? "",
        tags: [],
        metadata: {}
      }), { mode });
    }

    const embedded = selectImageCandidate(image?.candidates ?? [], image?.imageId ?? null);
    if (embedded) return resolved({ ...embedded, alt: embedded.alt || image?.alt || "" }, { mode });

    if (["provider", "automatic"].includes(mode)) {
      const cacheKey = JSON.stringify({
        mode,
        providerId: image?.providerId ?? null,
        imageId: image?.imageId ?? null,
        kind: context?.kind ?? null,
        blueprintId: context?.blueprintId ?? null,
        cardId: context?.cardId ?? null,
        tags: strings(context?.tags).sort(),
        timeOfDay: context?.timeOfDay ?? null,
        weather: context?.weather ?? null
      });
      if (!refresh && resolutionCache.has(cacheKey)) return cloneData(resolutionCache.get(cacheKey));
      const options = image?.providerId ? { providerIds: [image.providerId] } : {};
      const result = await collect(context, options);
      const candidate = selectImageCandidate(result.candidates, image?.imageId ?? null);
      const value = candidate ? resolved({ ...candidate, alt: candidate.alt || image?.alt || "" }, { mode }) : null;
      resolutionCache.set(cacheKey, cloneData(value));
      if (value) return value;
    }

    if (fallbackImage) {
      const fallbackResolved = await resolve(fallbackImage, { ...context, fallback: true });
      return fallbackResolved ? { ...fallbackResolved, fallback: true } : null;
    }
    return null;
  };

  const resolveBlueprint = async (blueprint, options = {}) => {
    if (!blueprint) return null;
    const context = buildChaseImageContext({ blueprint, kind: "blueprint", extra: options.context });
    return resolve(blueprint.image ?? {}, context, options);
  };

  const resolveCard = async (card, { blueprint = null, fallbackToBlueprint = false, context = {} } = {}) => {
    if (!card) return null;
    const imageContext = buildChaseImageContext({ blueprint, card, kind: "card", extra: context });
    return resolve(card.image ?? {}, imageContext, {
      fallbackImage: fallbackToBlueprint ? blueprint?.image ?? null : null
    });
  };

  const candidatesFor = async (image = {}, { blueprint = null, card = null, context = {}, refresh = false } = {}) => {
    const embedded = (image?.candidates ?? []).map(candidate => normalizeCandidate(candidate, image?.providerId ?? null)).filter(Boolean);
    const imageContext = buildChaseImageContext({ blueprint, card, kind: card ? "card" : "blueprint", extra: context });
    const cacheKey = JSON.stringify({
      mode: image?.mode ?? "none",
      providerId: image?.providerId ?? null,
      kind: imageContext.kind,
      blueprintId: imageContext.blueprintId,
      cardId: imageContext.cardId,
      tags: strings(imageContext.tags).sort(),
      timeOfDay: imageContext.timeOfDay ?? null,
      weather: imageContext.weather ?? null,
      embedded: embedded.map(candidate => [candidate.id, candidate.path])
    });
    if (!refresh && candidateCache.has(cacheKey)) return cloneData(candidateCache.get(cacheKey));
    let dynamic = [];
    let errors = [];
    if (["provider", "automatic"].includes(image?.mode)) {
      const result = await collect(imageContext, image?.providerId ? { providerIds: [image.providerId] } : {});
      dynamic = result.candidates;
      errors = result.errors;
    }
    const byKey = new Map();
    for (const candidate of [...embedded, ...dynamic]) {
      const key = `${candidate.providerId ?? "embedded"}:${candidate.id}:${candidate.path}`;
      if (!byKey.has(key)) byKey.set(key, candidate);
    }
    const result = { candidates: [...byKey.values()], errors };
    candidateCache.set(cacheKey, cloneData(result));
    return result;
  };

  return Object.freeze({
    contractVersion: CHASE_VISUAL_SYSTEM_CONTRACT_VERSION,
    buildContext: buildChaseImageContext,
    resolve,
    resolveCard,
    resolveBlueprint,
    candidatesFor,
    selectCandidate: selectImageCandidate,
    applyCandidate: applyImageCandidate,
    clearCache() { resolutionCache.clear(); candidateCache.clear(); return true; }
  });
}
