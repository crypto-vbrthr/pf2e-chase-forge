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
import { createWeatherForgeBridge, inspectWeatherForgeApi, WEATHER_FORGE_BRIDGE_CONTRACT_VERSION } from "../integrations/weather-forge-bridge.js";
import { createChasePersistenceService } from "../persistence/persistence-service.js";
import { createMemoryChaseStore } from "../persistence/memory-store.js";
import { CHASE_LIFECYCLE_HOOKS, createChaseSessionManager } from "../persistence/session-manager.js";
import { validatePersistenceState } from "../persistence/state.js";
import { CHASE_CHAT_PRESENTER_CONTRACT_VERSION, createChaseChatPresenter } from "../presentation/chat-presenter.js";
import { GM_RUNNER_CONTRACT_VERSION } from "../app/chase-runner-app.js";
import { PLAYER_CHASE_VIEW_CONTRACT_VERSION } from "../app/chase-player-app.js";
import { CHASE_SESSION_SYNC_CONTRACT_VERSION } from "../sync/chase-session-sync.js";
import { PLAYER_STATE_PROJECTOR_CONTRACT_VERSION, projectChasePublicState } from "../player/public-state-projector.js";
import { CHASE_GENERATOR_CONTRACT_VERSION, createChaseGenerator, generateChaseFromTemplate, inspectGenerationCandidates, selectGenerationCards } from "../generator/chase-generator.js";
import { CHASE_VISUAL_SYSTEM_CONTRACT_VERSION, createChaseImageService } from "../images/image-service.js";
import { CHASE_JOURNAL_CONTRACT_VERSION, createChaseJournalBridge } from "../integrations/journal-bridge.js";
import { CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION, createCampaignForgeBridge, inspectCampaignForgeApi } from "../integrations/campaign-forge-bridge.js";
import {
  BASIC_BUILDER_CONTRACT_VERSION,
  addApproachToBasicCard,
  addCardToBasicBlueprint,
  addManualCardToBasicBlueprint,
  addParticipantToBasicBlueprint,
  basicBuilderSummary,
  createBasicApproach,
  createBasicBuilderDraft,
  createManualChaseCard,
  isBasicLinearBlueprint,
  listBasicCards,
  moveCardInBasicBlueprint,
  participantFromDocument,
  rebuildBasicLinearGraph,
  removeApproachFromBasicCard,
  removeCardFromBasicBlueprint,
  removeParticipantFromBasicBlueprint,
  replaceBasicGroupsForChaseType,
  updateBasicCard,
  validateBasicBuilderBlueprint
} from "../builder/basic-builder-model.js";
import {
  BRANCHING_BUILDER_CONTRACT_VERSION,
  addApproachToBuilderCard,
  addBranchAfterCard,
  appendCardToBranchRoute,
  appendMainlineCard,
  appendMainlineManualCard,
  convertToBranchingBuilder,
  isBranchingBuilderBlueprint,
  isBuilderEditableBlueprint,
  listBranchGroups,
  listBranchingCards,
  listEditableCards,
  removeApproachFromBuilderCard,
  removeBranchGroup,
  updateBranchRoute,
  updateBuilderCardByRef,
  validateBranchingBuilderBlueprint
} from "../builder/branching-builder-model.js";

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
    library: Object.freeze({
      get: (id, options = {}) => registries.getLibraryBlueprint(id, options),
      list: (options = {}) => registries.listLibraryBlueprints(options),
      has: (id, options = {}) => Boolean(registries.getLibraryBlueprint(id, options))
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

export function createPublicApi({ registries = createRegistryService(), persistenceStore = createMemoryChaseStore(), ui = null, sync = null } = {}) {
  const content = contentApi(registries);
  const visual = createChaseImageService({ images: content.images });
  const images = Object.freeze({
    ...content.images,
    contractVersion: CHASE_VISUAL_SYSTEM_CONTRACT_VERSION,
    buildContext: visual.buildContext,
    resolve: visual.resolve,
    resolveCard: visual.resolveCard,
    resolveBlueprint: visual.resolveBlueprint,
    candidatesFor: visual.candidatesFor,
    selectCandidate: visual.selectCandidate,
    applyCandidate: visual.applyCandidate,
    clearCache: visual.clearCache
  });
  const generator = createChaseGenerator({ templates: content.templates, cards: content.cards });
  const extensions = createExtensionPublicApi(registries);
  const route = createRouteGraphEngine();
  const rules = createChaseRulesEngine({ registries, routeEngine: route });
  const pf2eAdapter = createPf2eChaseAdapter();
  const effectForgeBridge = createEffectForgeBridge();
  const weatherForgeBridge = createWeatherForgeBridge();
  const consequences = createConsequenceEngine({ routeEngine: route, effectForgeBridge });
  const persistence = createChasePersistenceService({ store: persistenceStore, routeEngine: route, rulesEngine: rules, registries });
  const sessionManager = createChaseSessionManager(persistence, { emit: (hook, payload) => globalThis.Hooks?.callAll?.(hook, payload) });
  const chatPresenter = createChaseChatPresenter();
  let publicApi = null;
  const journalBridge = createChaseJournalBridge({ getApi: () => publicApi });
  const campaignForgeBridge = createCampaignForgeBridge({ getApi: () => publicApi });

  publicApi = Object.freeze({
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
      effectForgeBridge: 1,
      weatherForgeBridge: WEATHER_FORGE_BRIDGE_CONTRACT_VERSION,
      protectedPersistence: 1,
      blueprintTransfer: 1,
      chaseReference: 1,
      basicBuilder: BASIC_BUILDER_CONTRACT_VERSION,
      gmRunner: GM_RUNNER_CONTRACT_VERSION,
      playerView: PLAYER_CHASE_VIEW_CONTRACT_VERSION,
      playerStateProjector: PLAYER_STATE_PROJECTOR_CONTRACT_VERSION,
      sessionSync: CHASE_SESSION_SYNC_CONTRACT_VERSION,
      chatPresenter: CHASE_CHAT_PRESENTER_CONTRACT_VERSION,
      generator: CHASE_GENERATOR_CONTRACT_VERSION,
      visualSystem: CHASE_VISUAL_SYSTEM_CONTRACT_VERSION,
      journalIntegration: CHASE_JOURNAL_CONTRACT_VERSION,
      campaignForgeIntegration: CHASE_CAMPAIGN_INTEGRATION_CONTRACT_VERSION,
      sessionLifecycle: 1
    }),
    hooks: Object.freeze({
      ready: "pf2eChaseForge.ready",
      ...CHASE_LIFECYCLE_HOOKS
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
      chaseLibrary: true,
      readOnlyLibraryBlueprints: true,
      imageProviders: true,
      visualSystem: true,
      resolvedCardImages: true,
      predefinedImageCandidates: true,
      automaticImageProviders: true,
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
      persistence: true,
      protectedPersistence: persistence.status().protected === true,
      blueprintJsonTransfer: true,
      contentSnapshots: true,
      sessionLifecycle: true,
      basicBuilder: true,
      branchingBuilder: true,
      interactiveRouteDecisions: true,
      generatorTemplates: true,
      seededGeneration: true,
      generatorFallbackCards: true,
      builderUi: Boolean(ui?.openBuilder),
      gmRunner: Boolean(ui?.openRunner),
      chatWorkflow: true,
      playerView: Boolean(ui?.openPlayerView),
      sessionSync: Boolean(sync?.sendIntent && sync?.publishSession),
      playerIntents: Boolean(sync?.sendIntent),
      consequenceEngine: true,
      effectForgeBridge: true,
      effectForgeAvailable: effectForgeBridge.inspect().compatible,
      weatherForgeBridge: true,
      weatherForgeAvailable: weatherForgeBridge.inspect().compatible,
      journalIntegration: true,
      journalLinks: true,
      journalStartActions: true,
      campaignForgeBridge: true,
      campaignForgeAvailable: campaignForgeBridge.inspect().compatible,
      campaignPreparedChases: true,
      campaignDirectStart: true,
      campaignResultReturn: true,
      campaignRunStatus: true
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
      persistenceState: validatePersistenceState,
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
    generator: Object.freeze({
      contractVersion: CHASE_GENERATOR_CONTRACT_VERSION,
      listTemplates: generator.listTemplates,
      inspect: generator.inspect,
      generate: generator.generate,
      reroll: generator.reroll,
      generateFromTemplate: generateChaseFromTemplate,
      inspectCandidates: inspectGenerationCandidates,
      selectCards: selectGenerationCards
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
      }),
      weatherForge: Object.freeze({
        moduleId: weatherForgeBridge.moduleId,
        contractVersion: weatherForgeBridge.contractVersion,
        inspect: weatherForgeBridge.inspect,
        isAvailable: weatherForgeBridge.isAvailable,
        readCurrent: weatherForgeBridge.readCurrent,
        inspectApi: inspectWeatherForgeApi,
        createBridge: createWeatherForgeBridge
      }),
      journal: journalBridge,
      campaignForge: Object.freeze({
        ...campaignForgeBridge,
        inspectApi: inspectCampaignForgeApi,
        createBridge: createCampaignForgeBridge
      })
    }),
    builder: Object.freeze({
      contractVersion: BASIC_BUILDER_CONTRACT_VERSION,
      branchingContractVersion: BRANCHING_BUILDER_CONTRACT_VERSION,
      createDraft: createBasicBuilderDraft,
      createManualCard: createManualChaseCard,
      createApproach: createBasicApproach,
      isEditable: isBuilderEditableBlueprint,
      isLinear: isBasicLinearBlueprint,
      isBranching: isBranchingBuilderBlueprint,
      listCards: listEditableCards,
      listLinearCards: listBasicCards,
      listBranchingCards,
      listBranchGroups,
      rebuildLinearGraph: rebuildBasicLinearGraph,
      convertToBranching: convertToBranchingBuilder,
      addBranchAfterCard,
      appendBranchCard: appendCardToBranchRoute,
      appendMainlineCard,
      appendMainlineManualCard,
      updateBranchRoute,
      removeBranch: removeBranchGroup,
      addCard: addCardToBasicBlueprint,
      addManualCard: addManualCardToBasicBlueprint,
      updateCard: updateBasicCard,
      updateCardByRef: updateBuilderCardByRef,
      removeCard: removeCardFromBasicBlueprint,
      moveCard: moveCardInBasicBlueprint,
      addApproach: addApproachToBasicCard,
      addApproachByRef: addApproachToBuilderCard,
      removeApproach: removeApproachFromBasicCard,
      removeApproachByRef: removeApproachFromBuilderCard,
      addParticipant: addParticipantToBasicBlueprint,
      removeParticipant: removeParticipantFromBasicBlueprint,
      participantFromDocument,
      resetGroupsForType: replaceBasicGroupsForChaseType,
      validate: input => isBranchingBuilderBlueprint(input) ? validateBranchingBuilderBlueprint(input) : validateBasicBuilderBlueprint(input),
      validateBranching: validateBranchingBuilderBlueprint,
      summary: basicBuilderSummary
    }),
    ui: Object.freeze({
      openBuilder: options => ui?.openBuilder?.(options) ?? null,
      closeBuilder: () => ui?.closeBuilder?.() ?? false,
      getOpenBuilder: () => ui?.getOpenBuilder?.() ?? null,
      debugBuilderLayout: options => ui?.debugLayout?.(options) ?? null,
      openRunner: options => ui?.openRunner?.(options) ?? null,
      closeRunner: sessionId => ui?.closeRunner?.(sessionId) ?? false,
      closeAllRunners: () => ui?.closeAllRunners?.() ?? false,
      getOpenRunner: sessionId => ui?.getOpenRunner?.(sessionId) ?? null,
      getOpenRunners: () => ui?.getOpenRunners?.() ?? [],
      openPlayerView: options => ui?.openPlayerView?.(options) ?? null,
      closePlayerView: sessionId => ui?.closePlayerView?.(sessionId) ?? false,
      closeAllPlayerViews: () => ui?.closeAllPlayerViews?.() ?? false,
      getOpenPlayerView: sessionId => ui?.getOpenPlayerView?.(sessionId) ?? null,
      getOpenPlayerViews: () => ui?.getOpenPlayerViews?.() ?? [],
      getPlayerState: sessionId => ui?.getPlayerState?.(sessionId) ?? null
    }),
    player: Object.freeze({
      projectState: (session, options = {}) => projectChasePublicState({ cards: content.cards, images, rules, route }, session, options)
    }),
    sync: sync ?? Object.freeze({}),
    presentation: Object.freeze({ chat: chatPresenter }),
    journal: journalBridge,
    persistence,
    sessionManager,
    cards: content.cards,
    templates: content.templates,
    library: content.library,
    packs: content.packs,
    images,
    extensions,
    registries: Object.freeze({
      getStats: () => registries.getStats()
    })
  });
  return publicApi;
}

export function initializePublicApi({ registries = createRegistryService(), persistenceStore = createMemoryChaseStore(), ui = null, sync = null } = {}) {
  const module = game.modules.get(MODULE_ID);
  if (!module) throw new Error(`Module ${MODULE_ID} is unavailable.`);
  const api = createPublicApi({ registries, persistenceStore, ui, sync });
  module.api = api;
  return api;
}
