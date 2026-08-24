import { API_VERSION, MODULE_ID, MODULE_VERSION, SCHEMA_VERSIONS } from "../core/constants.js";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createChasePack,
  createChasePublicState,
  createChaseResult,
  createChaseSession,
  createChaseTemplate,
  createConsequence,
  createParticipant,
  createParticipantGroup,
  createRouteGraph
} from "../data/factories.js";
import { buildGraphIndex, findCycle, getReachableNodeIds, topologicalSort } from "../data/graph.js";
import {
  validateChaseBlueprint,
  validateChaseCard,
  validateChasePack,
  validateChasePublicState,
  validateChaseResult,
  validateChaseSession,
  validateChaseTemplate,
  validateConsequence,
  validateParticipantGroup,
  validateRouteGraph
} from "../data/validators.js";
import { createExtensionPublicApi } from "../extensions/extension-service.js";
import { createRegistryService } from "../registries/registry-service.js";

function contentApi(registries) {
  return {
    cards: Object.freeze({
      get: (id, options = {}) => registries.getCard(id, options),
      list: (options = {}) => registries.listCards(options),
      has: (id, options = {}) => Boolean(registries.getCard(id, options))
    }),
    templates: Object.freeze({
      get: (id, options = {}) => registries.getTemplate(id, options),
      list: (options = {}) => registries.listTemplates(options),
      has: (id, options = {}) => Boolean(registries.getTemplate(id, options))
    }),
    packs: Object.freeze({
      get: id => registries.getPack(id),
      list: (options = {}) => registries.listPacks(options),
      setEnabled: (id, enabled) => registries.setPackEnabled(id, enabled),
      isEnabled: id => registries.packs.isEnabled(id)
    }),
    images: Object.freeze({
      providers: Object.freeze({
        get: (id, options = {}) => registries.getImageProvider(id, options),
        list: (options = {}) => registries.listImageProviders(options)
      }),
      collectCandidates: (context = {}, options = {}) => registries.collectImageCandidates(context, options)
    })
  };
}

export function createPublicApi({ registries = createRegistryService() } = {}) {
  const content = contentApi(registries);
  const extensions = createExtensionPublicApi(registries);

  return Object.freeze({
    version: API_VERSION,
    moduleVersion: MODULE_VERSION,
    stability: "development",
    schemas: Object.freeze({ ...SCHEMA_VERSIONS }),
    contracts: Object.freeze({
      graph: 1,
      playerSafeState: 1,
      consequenceReference: 1,
      extension: 1,
      registry: 1,
      imageProvider: 1
    }),
    getCapabilities: () => Object.freeze({
      coreDataModel: true,
      graphValidation: true,
      branchingModel: true,
      consequenceReferences: true,
      playerSafeStateContract: true,
      registries: true,
      extensionApi: true,
      transactionalPackRegistration: true,
      contentPackActivation: true,
      imageProviders: true,
      rulesEngine: false,
      persistence: false,
      gmRunner: false,
      playerView: false,
      effectForgeBridge: false,
      campaignForgeBridge: false
    }),
    factories: Object.freeze({
      card: createChaseCard,
      template: createChaseTemplate,
      pack: createChasePack,
      blueprint: createChaseBlueprint,
      session: createChaseSession,
      result: createChaseResult,
      publicState: createChasePublicState,
      participant: createParticipant,
      participantGroup: createParticipantGroup,
      node: createChaseNode,
      edge: createChaseEdge,
      graph: createRouteGraph,
      consequence: createConsequence
    }),
    validation: Object.freeze({
      card: validateChaseCard,
      template: validateChaseTemplate,
      pack: validateChasePack,
      blueprint: validateChaseBlueprint,
      session: validateChaseSession,
      result: validateChaseResult,
      publicState: validateChasePublicState,
      participantGroup: validateParticipantGroup,
      graph: validateRouteGraph,
      consequence: validateConsequence
    }),
    graph: Object.freeze({
      index: buildGraphIndex,
      reachable: getReachableNodeIds,
      findCycle,
      topologicalSort
    }),
    cards: content.cards,
    templates: content.templates,
    packs: content.packs,
    images: content.images,
    extensions,
    registries: Object.freeze({
      getStats: () => registries.getStats()
    })
  });
}

export function initializePublicApi({ registries = createRegistryService() } = {}) {
  const module = game.modules.get(MODULE_ID);
  if (!module) throw new Error(`Module ${MODULE_ID} is unavailable.`);
  const api = createPublicApi({ registries });
  module.api = api;
  return api;
}
