import { MODULE_ID, SCHEMA_VERSIONS } from "../core/constants.js";
import { ChaseRegistryError, ChaseValidationError } from "../core/errors.js";
import { normalizeChaseBlueprint, normalizeChaseCard, normalizeChasePack, normalizeChaseTemplate } from "../data/normalizers.js";
import { cloneData, isPlainObject } from "../data/utils.js";
import { validateChaseBlueprint, validateChaseCard, validateChasePack, validateChaseTemplate } from "../data/validators.js";
import { ChaseCardRegistry } from "./card-registry.js";
import { ImageProviderRegistry, normalizeImageProvider } from "./image-provider-registry.js";
import { ChasePackRegistry, MemoryPackStateStore } from "./pack-registry.js";
import { normalizeOwnedResourceId } from "./registry-utils.js";
import { ChaseTemplateRegistry } from "./template-registry.js";
import { ChaseLibraryBlueprintRegistry } from "./library-blueprint-registry.js";

function assertValid(result, label, { code = "CHASE_RESOURCE_INVALID", details = {} } = {}) {
  if (result.valid) return;
  throw new ChaseValidationError(`${label} failed Chase Forge validation.`, {
    code,
    details: { ...details, errors: result.errors, warnings: result.warnings }
  });
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      throw new ChaseRegistryError(`Duplicate ${label} '${value}' in a single registration transaction.`, {
        code: "CHASE_TRANSACTION_DUPLICATE",
        details: { resourceType: label, resourceId: value }
      });
    }
    seen.add(value);
  }
}

export class ChaseRegistryService {
  constructor({ stateStore = new MemoryPackStateStore() } = {}) {
    this.cards = new ChaseCardRegistry();
    this.templates = new ChaseTemplateRegistry();
    this.libraryBlueprints = new ChaseLibraryBlueprintRegistry();
    this.packs = new ChasePackRegistry({ stateStore });
    this.images = new ImageProviderRegistry();
  }

  snapshot() {
    return {
      cards: this.cards.snapshot(),
      templates: this.templates.snapshot(),
      libraryBlueprints: this.libraryBlueprints.snapshot(),
      packs: this.packs.snapshot(),
      images: this.images.snapshot()
    };
  }

  restore(snapshot) {
    this.cards.restore(snapshot.cards);
    this.templates.restore(snapshot.templates);
    this.libraryBlueprints.restore(snapshot.libraryBlueprints ?? new Map());
    this.packs.restore(snapshot.packs);
    this.images.restore(snapshot.images);
  }

  preparePack(owner, rawPack = {}) {
    if (!isPlainObject(rawPack)) {
      throw new ChaseRegistryError("Chase pack must be an object.", { code: "CHASE_PACK_INVALID" });
    }

    const pack = normalizeChasePack(rawPack);
    pack.id = normalizeOwnedResourceId(owner, pack.id, { allowCoreAlias: true });

    const cards = (Array.isArray(rawPack.cards) ? rawPack.cards : []).map(raw => {
      const id = normalizeOwnedResourceId(owner, raw?.id, { allowCoreAlias: true });
      const card = normalizeChaseCard({
        ...raw,
        id,
        source: { moduleId: owner, packId: pack.id, version: pack.version }
      });
      assertValid(validateChaseCard(card), `Chase Card '${id}'`, { code: "CHASE_CARD_INVALID", details: { cardId: id } });
      return card;
    });

    const templates = (Array.isArray(rawPack.templates) ? rawPack.templates : []).map(raw => {
      const id = normalizeOwnedResourceId(owner, raw?.id, { allowCoreAlias: true });
      const template = normalizeChaseTemplate({
        ...raw,
        id,
        source: { moduleId: owner, packId: pack.id, version: pack.version }
      });
      assertValid(validateChaseTemplate(template), `Chase Template '${id}'`, { code: "CHASE_TEMPLATE_INVALID", details: { templateId: id } });
      return template;
    });

    const libraryBlueprints = (Array.isArray(rawPack.blueprints) ? rawPack.blueprints : []).map(raw => {
      const id = normalizeOwnedResourceId(owner, raw?.id, { allowCoreAlias: true });
      const blueprint = normalizeChaseBlueprint({
        ...raw,
        id,
        source: { moduleId: owner, packId: pack.id, version: pack.version },
        metadata: {
          ...(raw?.metadata ?? {}),
          library: {
            ...(raw?.metadata?.library ?? {}),
            readOnly: true,
            sourceModule: owner,
            packId: pack.id,
            sourceVersion: pack.version
          }
        }
      });
      assertValid(validateChaseBlueprint(blueprint), `Chase Library Blueprint '${id}'`, { code: "CHASE_LIBRARY_BLUEPRINT_INVALID", details: { blueprintId: id } });
      return blueprint;
    });

    const imageProviders = (Array.isArray(rawPack.imageProviders) ? rawPack.imageProviders : []).map(raw => {
      const id = normalizeOwnedResourceId(owner, raw?.id, { allowCoreAlias: true });
      return normalizeImageProvider({ ...raw, id });
    });

    assertUnique(cards.map(card => card.id), "card id");
    assertUnique(templates.map(template => template.id), "template id");
    assertUnique(libraryBlueprints.map(blueprint => blueprint.id), "library blueprint id");
    assertUnique(imageProviders.map(provider => provider.id), "image provider id");

    const validationPack = {
      ...pack,
      cards,
      templates,
      blueprints: libraryBlueprints
    };
    assertValid(validateChasePack(validationPack), `Chase Pack '${pack.id}'`, { code: "CHASE_PACK_INVALID", details: { packId: pack.id } });

    const summary = {
      schemaVersion: SCHEMA_VERSIONS.pack,
      id: pack.id,
      label: pack.label,
      description: pack.description,
      version: pack.version,
      priority: pack.priority,
      enabledByDefault: pack.enabledByDefault,
      sourceModule: owner,
      cardIds: cards.map(card => card.id),
      templateIds: templates.map(template => template.id),
      blueprintIds: libraryBlueprints.map(blueprint => blueprint.id),
      imageProviderIds: imageProviders.map(provider => provider.id),
      metadata: cloneData(pack.metadata)
    };

    return { pack: summary, cards, templates, libraryBlueprints, imageProviders };
  }

  #removePackResources(owner, packId) {
    return {
      cards: this.cards.unregisterByPack(packId, owner),
      templates: this.templates.unregisterByPack(packId, owner),
      libraryBlueprints: this.libraryBlueprints.unregisterByPack(packId, owner),
      imageProviders: this.images.unregisterByPack(packId, owner)
    };
  }

  #registerPreparedPack(owner, prepared, { replace = false } = {}) {
    const { pack, cards, templates, libraryBlueprints, imageProviders } = prepared;
    const existing = this.packs.get(pack.id);
    if (existing) {
      this.packs.assertCanRegister(pack.id, owner, { replace });
      if (replace) {
        this.#removePackResources(owner, pack.id);
        this.packs.unregister(pack.id, owner);
      }
    }

    this.packs.assertCanRegister(pack.id, owner, { replace: false });
    for (const card of cards) this.cards.assertCanRegister(card.id, owner, { replace: false });
    for (const template of templates) this.templates.assertCanRegister(template.id, owner, { replace: false });
    for (const blueprint of libraryBlueprints) this.libraryBlueprints.assertCanRegister(blueprint.id, owner, { replace: false });
    for (const provider of imageProviders) this.images.assertCanRegister(provider.id, owner, { replace: false });

    const registeredPack = this.packs.register(pack, { owner, replace: false });
    cards.forEach(card => this.cards.register(card, { owner, packId: pack.id }));
    templates.forEach(template => this.templates.register(template, { owner, packId: pack.id }));
    libraryBlueprints.forEach(blueprint => this.libraryBlueprints.register(blueprint, { owner, packId: pack.id }));
    imageProviders.forEach(provider => this.images.register(provider, { owner, packId: pack.id }));
    return registeredPack;
  }

  registerPack(owner, rawPack, options = {}) {
    const snapshot = this.snapshot();
    try {
      const prepared = this.preparePack(owner, rawPack);
      return this.#registerPreparedPack(owner, prepared, options);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  registerPacks(owner, rawPacks, options = {}) {
    if (!Array.isArray(rawPacks) || rawPacks.length === 0) {
      throw new ChaseRegistryError("registerPacks requires a non-empty array.", { code: "CHASE_PACK_BATCH_REQUIRED" });
    }
    const snapshot = this.snapshot();
    try {
      const prepared = rawPacks.map(pack => this.preparePack(owner, pack));
      assertUnique(prepared.map(item => item.pack.id), "pack id");
      const registered = [];
      for (const item of prepared) registered.push(this.#registerPreparedPack(owner, item, options));
      return registered;
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  unregisterPack(owner, rawPackId) {
    const packId = normalizeOwnedResourceId(owner, rawPackId, { allowCoreAlias: true });
    const snapshot = this.snapshot();
    try {
      if (!this.packs.has(packId)) return false;
      this.#removePackResources(owner, packId);
      this.packs.unregister(packId, owner);
      return true;
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  unregisterAll(owner) {
    const snapshot = this.snapshot();
    try {
      const packs = this.packs.list({ owner }).map(pack => pack.id);
      const removed = { cards: 0, templates: 0, libraryBlueprints: 0, imageProviders: 0 };
      for (const packId of packs) {
        const counts = this.#removePackResources(owner, packId);
        removed.cards += counts.cards;
        removed.templates += counts.templates;
        removed.libraryBlueprints += counts.libraryBlueprints;
        removed.imageProviders += counts.imageProviders;
      }
      const removedPacks = this.packs.unregisterAll(owner);
      removed.cards += this.cards.unregisterAll(owner);
      removed.templates += this.templates.unregisterAll(owner);
      removed.libraryBlueprints += this.libraryBlueprints.unregisterAll(owner);
      removed.imageProviders += this.images.unregisterAll(owner);
      return {
        packs: removedPacks,
        cards: removed.cards,
        templates: removed.templates,
        libraryBlueprints: removed.libraryBlueprints,
        imageProviders: removed.imageProviders
      };
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  listRegistrations(owner) {
    return {
      packs: this.packs.list({ owner }),
      cards: this.cards.list({ owner }),
      templates: this.templates.list({ owner }),
      libraryBlueprints: this.libraryBlueprints.list({ owner }),
      imageProviders: this.images.list({ owner })
    };
  }

  #resourceEnabled(entry) {
    if (!entry?.packId) return true;
    return this.packs.isEnabled(entry.packId);
  }

  listCards({ includeDisabled = false, owner = null, packId = null } = {}) {
    return this.cards.listEntries({ owner, packId })
      .filter(entry => includeDisabled || this.#resourceEnabled(entry))
      .map(entry => entry.resource);
  }

  getCard(id, { includeDisabled = false } = {}) {
    const entry = this.cards.getEntry(id);
    if (!entry || (!includeDisabled && !this.#resourceEnabled(entry))) return null;
    return entry.resource;
  }

  listTemplates({ includeDisabled = false, owner = null, packId = null } = {}) {
    return this.templates.listEntries({ owner, packId })
      .filter(entry => includeDisabled || this.#resourceEnabled(entry))
      .map(entry => entry.resource);
  }

  getTemplate(id, { includeDisabled = false } = {}) {
    const entry = this.templates.getEntry(id);
    if (!entry || (!includeDisabled && !this.#resourceEnabled(entry))) return null;
    return entry.resource;
  }


  listLibraryBlueprints({ includeDisabled = false, owner = null, packId = null } = {}) {
    return this.libraryBlueprints.listEntries({ owner, packId })
      .filter(entry => includeDisabled || this.#resourceEnabled(entry))
      .map(entry => entry.resource);
  }

  getLibraryBlueprint(id, { includeDisabled = false } = {}) {
    const entry = this.libraryBlueprints.getEntry(id);
    if (!entry || (!includeDisabled && !this.#resourceEnabled(entry))) return null;
    return entry.resource;
  }

  listImageProviders({ includeDisabled = false, owner = null, packId = null } = {}) {
    return this.images.list({ owner, packId })
      .filter(provider => includeDisabled || !provider.packId || this.packs.isEnabled(provider.packId));
  }

  getImageProvider(id, { includeDisabled = false } = {}) {
    const provider = this.images.get(id);
    if (!provider) return null;
    if (!includeDisabled && provider.packId && !this.packs.isEnabled(provider.packId)) return null;
    return provider;
  }

  async collectImageCandidates(context = {}, options = {}) {
    const requested = options.providerIds
      ? new Set((Array.isArray(options.providerIds) ? options.providerIds : [options.providerIds]).map(String))
      : null;
    const providerIds = this.listImageProviders(options)
      .map(provider => provider.id)
      .filter(id => !requested || requested.has(id));
    return this.images.collect(context, { providerIds });
  }

  getPack(id) {
    return this.packs.get(id);
  }

  listPacks(options = {}) {
    return this.packs.list(options);
  }

  async setPackEnabled(id, enabled) {
    if (globalThis.game?.user && !game.user.isGM) {
      throw new ChaseRegistryError("Only a GM may change Chase Forge pack activation.", {
        code: "CHASE_GM_REQUIRED",
        details: { packId: id }
      });
    }
    return this.packs.setEnabled(id, enabled);
  }

  getStats() {
    return Object.freeze({
      packs: this.packs.size,
      cards: this.cards.size,
      templates: this.templates.size,
      libraryBlueprints: this.libraryBlueprints.size,
      imageProviders: this.images.size,
      enabledPacks: this.packs.list({ includeDisabled: false }).length
    });
  }
}

export function createRegistryService(options = {}) {
  return new ChaseRegistryService(options);
}

export function isCoreOwner(owner) {
  return owner === MODULE_ID;
}
