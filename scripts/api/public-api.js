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
import { buildGraphIndex, findCycle, getNodeIdsReachingAnyEnd, getReachableNodeIds, getShortestDistancesToEnds, topologicalSort } from "../data/graph.js";
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
import { createRouteGraphEngine } from "../engine/route-graph-engine.js";
import { createPf2eChaseAdapter } from "../pf2e/pf2e-adapter.js";
import { createChaseRulesEngine, deriveChaseStartPositions, getChaseLengthGuideline, getTurnPolicy, recommendObstaclePoints } from "../rules/chase-rules-engine.js";
import { degreeOfSuccess, stepDegree } from "../rules/degree-of-success.js";
import { applyDifficultyAdjustment, getDifficultyAdjustment, getLevelDc, getPf2eDcTables, getSimpleDc, resolveApproachDc } from "../rules/pf2e-dc.js";
import { evaluateRouteCondition, evaluateRouteConditions } from "../engine/route-conditions.js";
import { createRegistryService } from "../registries/registry-service.js";
import { createConsequenceEngine, createConsequenceOccurrence } from "../consequences/consequence-engine.js";
import { createEffectForgeBridge, inspectEffectForgeApi } from "../integrations/effect-forge-bridge.js";

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
  const route = createRouteGraphEngine();
  const rules = createChaseRulesEngine({ registries, routeEngine: route });
  const pf2eAdapter = createPf2eChaseAdapter();
  const effectForgeBridge = createEffectForgeBridge();
  const consequences = createConsequenceEngine({ routeEngine: route, effectForgeBridge });

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
      imageProvider: 1,
      routeTraversal: 1,
      routeCondition: 1,
      chaseRules: 1,
      pf2eDc: 1,
      degreeOfSuccess: 1,
      pf2eAdapter: 1,
      consequenceEngine: 1,
      effectForgeBridge: 1
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
      routeGraphEngine: true,
      deterministicRouteResolution: true,
      routeConditions: true,
      multiGroupRouting: true,
      rulesEngine: true,
      chasePoints: true,
      roundTracking: true,
      chaseTypeOutcomes: true,
      steadyPace: true,
      separatedParticipantRule: true,
      pf2eDcTables: true,
      degreeOfSuccess: true,
      pf2eAdapter: true,
      persistence: false,
      gmRunner: false,
      playerView: false,
      consequenceEngine: true,
      effectForgeBridge: true,
      effectForgeAvailable: effectForgeBridge.inspect().compatible,
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
      topologicalSort,
      reachingEnds: getNodeIdsReachingAnyEnd,
      shortestDistancesToEnds: getShortestDistancesToEnds
    }),
    route,
    rules,
    pf2e: Object.freeze({
      dc: Object.freeze({
        simple: getSimpleDc,
        level: getLevelDc,
        adjustment: getDifficultyAdjustment,
        applyAdjustment: applyDifficultyAdjustment,
        resolveApproach: resolveApproachDc,
        tables: getPf2eDcTables
      }),
      degree: Object.freeze({
        resolve: degreeOfSuccess,
        step: stepDegree
      }),
      adapter: pf2eAdapter,
      createAdapter: createPf2eChaseAdapter
    }),
    guidelines: Object.freeze({
      obstaclePoints: recommendObstaclePoints,
      chaseLength: getChaseLengthGuideline,
      turnPolicy: getTurnPolicy,
      startPositions: deriveChaseStartPositions
    }),
    routeConditions: Object.freeze({
      evaluate: evaluateRouteCondition,
      evaluateAll: evaluateRouteConditions
    }),
    consequences: Object.freeze({
      createOccurrence: createConsequenceOccurrence,
      fromRulesResult: consequences.fromRulesResult,
      plan: consequences.plan,
      execute: consequences.execute,
      executeRulesResult: consequences.executeRulesResult,
      records: consequences.records
    }),
    integrations: Object.freeze({
      effectForge: Object.freeze({
        moduleId: effectForgeBridge.moduleId,
        inspect: effectForgeBridge.inspect,
        isAvailable: effectForgeBridge.isAvailable,
        resolveDefinition: effectForgeBridge.resolveDefinition,
        analyze: effectForgeBridge.analyze,
        apply: effectForgeBridge.apply,
        openEditor: effectForgeBridge.openEditor,
        inspectApi: inspectEffectForgeApi,
        createBridge: createEffectForgeBridge
      })
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
