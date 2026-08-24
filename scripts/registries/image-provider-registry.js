import { ChaseRegistryError } from "../core/errors.js";
import { cloneData, isPlainObject, uniqueStrings } from "../data/utils.js";
import { compareByPriorityThenId, normalizeString } from "./registry-utils.js";

function cloneProviderDescriptor(entry) {
  if (!entry) return null;
  const { provider, ...meta } = entry;
  return {
    ...meta,
    id: provider.id,
    label: provider.label,
    version: provider.version,
    priority: provider.priority,
    tags: [...provider.tags],
    metadata: cloneData(provider.metadata)
  };
}

export function normalizeImageProvider(provider = {}) {
  if (!isPlainObject(provider)) {
    throw new ChaseRegistryError("Image provider must be an object.", { code: "CHASE_IMAGE_PROVIDER_INVALID" });
  }
  const id = normalizeString(provider.id);
  const label = normalizeString(provider.label, id || "Unnamed Image Provider");
  if (!id) throw new ChaseRegistryError("Image provider id is required.", { code: "CHASE_IMAGE_PROVIDER_ID" });
  if (typeof provider.getImages !== "function") {
    throw new ChaseRegistryError(`Image provider '${id}' must expose getImages(context, options).`, {
      code: "CHASE_IMAGE_PROVIDER_GET_IMAGES",
      details: { providerId: id }
    });
  }
  if (provider.supports !== undefined && typeof provider.supports !== "function") {
    throw new ChaseRegistryError(`Image provider '${id}' supports must be a function when provided.`, {
      code: "CHASE_IMAGE_PROVIDER_SUPPORTS",
      details: { providerId: id }
    });
  }
  return Object.freeze({
    id,
    label,
    version: provider.version ? String(provider.version) : null,
    priority: Number.isFinite(Number(provider.priority)) ? Number(provider.priority) : 0,
    tags: Object.freeze(uniqueStrings(provider.tags)),
    metadata: Object.freeze(cloneData(isPlainObject(provider.metadata) ? provider.metadata : {})),
    supports: provider.supports ?? (() => true),
    getImages: provider.getImages
  });
}

function normalizeCandidate(candidate, providerId, index) {
  if (!isPlainObject(candidate)) return null;
  const path = normalizeString(candidate.path);
  if (!path) return null;
  return {
    id: normalizeString(candidate.id, `${providerId}:image-${index + 1}`),
    path,
    providerId,
    alt: normalizeString(candidate.alt),
    tags: uniqueStrings(candidate.tags),
    weight: Math.max(0, Number.isFinite(Number(candidate.weight)) ? Number(candidate.weight) : 1),
    metadata: cloneData(isPlainObject(candidate.metadata) ? candidate.metadata : {})
  };
}

export class ImageProviderRegistry {
  #entries = new Map();

  get size() {
    return this.#entries.size;
  }

  has(id) {
    return this.#entries.has(String(id));
  }

  ownerOf(id) {
    return this.#entries.get(String(id))?.owner ?? null;
  }

  assertCanRegister(id, owner, { replace = false } = {}) {
    const existing = this.#entries.get(String(id));
    if (!existing) return true;
    if (!replace) {
      throw new ChaseRegistryError(`Image provider '${id}' is already registered.`, {
        code: "CHASE_IMAGE_PROVIDER_CONFLICT",
        details: { providerId: id, owner: existing.owner }
      });
    }
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`Image provider '${id}' is owned by '${existing.owner}' and cannot be replaced by '${owner}'.`, {
        code: "CHASE_IMAGE_PROVIDER_OWNERSHIP",
        details: { providerId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return true;
  }

  register(provider, { owner, packId = null, replace = false } = {}) {
    const normalized = normalizeImageProvider(provider);
    this.assertCanRegister(normalized.id, owner, { replace });
    this.#entries.set(normalized.id, { owner, packId, provider: normalized });
    return cloneProviderDescriptor(this.#entries.get(normalized.id));
  }

  get(id) {
    return cloneProviderDescriptor(this.#entries.get(String(id)));
  }

  getRuntimeProvider(id) {
    return this.#entries.get(String(id))?.provider ?? null;
  }

  list({ owner = null, packId = null } = {}) {
    return [...this.#entries.values()]
      .filter(entry => !owner || entry.owner === owner)
      .filter(entry => !packId || entry.packId === packId)
      .map(cloneProviderDescriptor)
      .sort(compareByPriorityThenId);
  }

  listRuntime({ owner = null, packId = null } = {}) {
    return [...this.#entries.values()]
      .filter(entry => !owner || entry.owner === owner)
      .filter(entry => !packId || entry.packId === packId)
      .map(entry => entry.provider)
      .sort(compareByPriorityThenId);
  }

  unregister(id, owner) {
    const key = String(id);
    const existing = this.#entries.get(key);
    if (!existing) return false;
    if (existing.owner !== owner) {
      throw new ChaseRegistryError(`Image provider '${id}' is owned by '${existing.owner}' and cannot be removed by '${owner}'.`, {
        code: "CHASE_IMAGE_PROVIDER_OWNERSHIP",
        details: { providerId: id, owner: existing.owner, attemptedOwner: owner }
      });
    }
    return this.#entries.delete(key);
  }

  unregisterByPack(packId, owner) {
    let removed = 0;
    for (const [id, entry] of [...this.#entries.entries()]) {
      if (entry.owner === owner && entry.packId === packId) {
        this.#entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  unregisterAll(owner) {
    let removed = 0;
    for (const [id, entry] of [...this.#entries.entries()]) {
      if (entry.owner === owner) {
        this.#entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async collect(context = {}, { providerIds = null, owner = null, packId = null } = {}) {
    const requested = providerIds ? new Set((Array.isArray(providerIds) ? providerIds : [providerIds]).map(String)) : null;
    const providers = this.listRuntime({ owner, packId }).filter(provider => !requested || requested.has(provider.id));
    const candidates = [];
    const errors = [];

    for (const provider of providers) {
      try {
        const supported = await provider.supports(context);
        if (!supported) continue;
        const raw = await provider.getImages(context, { providerId: provider.id });
        const images = Array.isArray(raw) ? raw : [];
        images.forEach((candidate, index) => {
          const normalized = normalizeCandidate(candidate, provider.id, index);
          if (normalized) candidates.push({ ...normalized, providerPriority: provider.priority });
        });
      } catch (error) {
        errors.push({
          providerId: provider.id,
          code: error?.code ?? "CHASE_IMAGE_PROVIDER_RUNTIME_ERROR",
          message: error?.message ?? String(error)
        });
      }
    }

    candidates.sort((a, b) => {
      const providerPriority = Number(b.providerPriority ?? 0) - Number(a.providerPriority ?? 0);
      if (providerPriority !== 0) return providerPriority;
      const weight = Number(b.weight ?? 1) - Number(a.weight ?? 1);
      if (weight !== 0) return weight;
      return String(a.id).localeCompare(String(b.id));
    });

    return { candidates: candidates.map(({ providerPriority, ...candidate }) => candidate), errors };
  }

  snapshot() {
    return new Map(this.#entries);
  }

  restore(snapshot) {
    this.#entries = new Map(snapshot);
  }
}
