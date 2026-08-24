import { API_VERSION, MODULE_ID, MODULE_VERSION, SCHEMA_VERSIONS } from "../core/constants.js";
import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
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
  validateChasePublicState,
  validateChaseResult,
  validateChaseSession,
  validateChaseTemplate,
  validateConsequence,
  validateParticipantGroup,
  validateRouteGraph
} from "../data/validators.js";

export function createPublicApi() {
  return Object.freeze({
    version: API_VERSION,
    moduleVersion: MODULE_VERSION,
    stability: "development",
    schemas: Object.freeze({ ...SCHEMA_VERSIONS }),
    contracts: Object.freeze({
      graph: 1,
      playerSafeState: 1,
      consequenceReference: 1
    }),
    getCapabilities: () => Object.freeze({
      coreDataModel: true,
      graphValidation: true,
      branchingModel: true,
      consequenceReferences: true,
      playerSafeStateContract: true,
      registries: false,
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
    })
  });
}

export function initializePublicApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) throw new Error(`Module ${MODULE_ID} is unavailable.`);
  const api = createPublicApi();
  module.api = api;
  return api;
}
