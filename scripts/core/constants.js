export const MODULE_ID = "pf2e-chase-forge";
export const MODULE_VERSION = "0.1.0-dev.17.3";
export const API_VERSION = 17;
export const EXTENSION_CONTRACT_VERSION = 1;

export const SCHEMA_VERSIONS = Object.freeze({
  card: 1,
  template: 1,
  blueprint: 2,
  session: 4,
  result: 1,
  publicState: 1,
  consequence: 2,
  pack: 1,
  persistence: 1
});

export const EXTENSION_CAPABILITIES = Object.freeze([
  "registries.cards",
  "registries.templates",
  "registries.libraryBlueprints",
  "registries.packs",
  "registries.imageProviders",
  "packs.activation",
  "extensions.boundOwnership",
  "extensions.transactionalRegistration",
  "extensions.registrationDiagnostics",
  "routing.traversal",
  "routing.conditions",
  "routing.multiGroup",
  "rules.chasePoints",
  "rules.rounds",
  "rules.chaseTypes",
  "rules.pf2eDc",
  "consequences.engine",
  "consequences.effectForge",
  "persistence.protectedVault",
  "persistence.blueprints",
  "persistence.sessions",
  "persistence.jsonTransfer",
  "persistence.contentSnapshots",
  "builder.basic",
  "builder.branching",
  "generator.templates",
  "generator.seededSelection",
  "generator.fallbackCards",
  "integrations.weatherForge",
  "integrations.journal",
  "integrations.campaignForge",
  "runner.gm",
  "runner.player",
  "sync.playerIntents",
  "presentation.chat"
]);

export const CHASE_TYPES = Object.freeze([
  "pursuit",
  "escape",
  "againstClock",
  "race"
]);

export const CHASE_LENGTHS = Object.freeze([
  "short",
  "medium",
  "long",
  "custom"
]);

export const CHASE_LENGTH_GUIDELINES = Object.freeze({
  short: 6,
  medium: 8,
  long: 10
});

export const DIFFICULTY_PROFILES = Object.freeze([
  "easy",
  "moderate",
  "hard",
  "extreme",
  "custom"
]);

export const ROUTE_COMPLEXITIES = Object.freeze([
  "linear",
  "shortcuts",
  "branched",
  "highlyBranched"
]);

export const CARD_TYPES = Object.freeze([
  "obstacle",
  "complication",
  "opportunity",
  "finale"
]);

export const NODE_TYPES = Object.freeze([
  "start",
  "card",
  "choice",
  "merge",
  "end"
]);

export const EDGE_TYPES = Object.freeze([
  "normal",
  "branch",
  "shortcut",
  "conditional"
]);

export const EDGE_VISIBILITY = Object.freeze([
  "public",
  "hidden",
  "discoverable"
]);

export const ROUTE_CONDITION_SOURCES = Object.freeze([
  "context",
  "session",
  "group",
  "nodeState"
]);

export const ROUTE_CONDITION_OPERATORS = Object.freeze([
  "equals",
  "notEquals",
  "truthy",
  "falsy",
  "includes",
  "gt",
  "gte",
  "lt",
  "lte"
]);

export const GROUP_ROLES = Object.freeze([
  "quarry",
  "pursuer",
  "competitor",
  "participant"
]);

export const GROUP_PACE_MODES = Object.freeze([
  "roll",
  "steady"
]);

export const PARTICIPANT_KINDS = Object.freeze([
  "actor",
  "token",
  "placeholder",
  "abstract"
]);

export const SESSION_STATUSES = Object.freeze([
  "draft",
  "active",
  "paused",
  "completed",
  "aborted"
]);

export const ROUND_PHASES = Object.freeze([
  "idle",
  "active",
  "ended"
]);

export const RESULT_OUTCOMES = Object.freeze([
  "quarryEscaped",
  "quarryCaught",
  "goalReached",
  "timeExpired",
  "raceWon",
  "raceLost",
  "aborted",
  "custom"
]);

export const APPROACH_TYPES = Object.freeze([
  "check",
  "action",
  "spell",
  "item",
  "custom"
]);

export const DC_MODES = Object.freeze([
  "fixed",
  "simple",
  "level",
  "gm",
  "none"
]);

export const PF2E_PROFICIENCY_RANKS = Object.freeze([
  "untrained",
  "trained",
  "expert",
  "master",
  "legendary"
]);

export const PF2E_SIMPLE_DCS = Object.freeze({
  untrained: 10,
  trained: 15,
  expert: 20,
  master: 30,
  legendary: 40
});

export const PF2E_LEVEL_DCS = Object.freeze({
  0: 14,
  1: 15,
  2: 16,
  3: 18,
  4: 19,
  5: 20,
  6: 22,
  7: 23,
  8: 24,
  9: 26,
  10: 27,
  11: 28,
  12: 30,
  13: 31,
  14: 32,
  15: 34,
  16: 35,
  17: 36,
  18: 38,
  19: 39,
  20: 40,
  21: 42,
  22: 44,
  23: 46,
  24: 48,
  25: 50
});

export const PF2E_DIFFICULTY_ADJUSTMENTS = Object.freeze({
  incrediblyEasy: -10,
  veryEasy: -5,
  easy: -2,
  standard: 0,
  hard: 2,
  veryHard: 5,
  incrediblyHard: 10
});

export const DEGREE_KEYS = Object.freeze([
  "criticalSuccess",
  "success",
  "failure",
  "criticalFailure"
]);

export const DEFAULT_CHASE_POINT_DELTAS = Object.freeze({
  criticalSuccess: 2,
  success: 1,
  failure: 0,
  criticalFailure: -1
});

export const CONSEQUENCE_KINDS = Object.freeze([
  "chasePoints",
  "routeUnlock",
  "routeLock",
  "routeSelect",
  "effectForge",
  "narrative",
  "custom"
]);

export const EFFECT_FORGE_SOURCES = Object.freeze([
  "embedded",
  "item"
]);

export const CONSEQUENCE_STATUSES = Object.freeze([
  "pendingConfirmation",
  "pendingSelection",
  "applied",
  "skipped",
  "manualFallback",
  "blocked",
  "failed",
  "rulesHandled",
  "unhandled"
]);

export const CONSEQUENCE_SEVERITIES = Object.freeze([
  "info",
  "minor",
  "significant",
  "severe"
]);

export const EFFECT_TARGET_MODES = Object.freeze([
  "participant",
  "runtimeGroup",
  "explicit"
]);

export const WEATHER_FORGE_MODULE_ID = "pf2e-weather-forge";
export const CRITICAL_FORGE_MODULE_ID = "pf2e-critical-forge";
export const EFFECT_FORGE_MIN_API_SURFACE = Object.freeze([
  "effects.migrate",
  "effects.analyze",
  "effects.apply",
  "effects.readItem"
]);


export const BLUEPRINT_CONTENT_MODES = Object.freeze([
  "references",
  "snapshot"
]);

export const CHASE_REFERENCE_TYPES = Object.freeze([
  "blueprint",
  "session",
  "result"
]);

export const PERSISTENCE_STORAGE = Object.freeze({
  VERSION: 1,
  KIND_VAULT: "vault",
  FLAG_META: "storage",
  FLAG_STATE: "state"
});

export const BLUEPRINT_TRANSFER = Object.freeze({
  FORMAT: "pf2e-chase-forge.blueprint",
  VERSION: 1
});

export const IMAGE_MODES = Object.freeze([
  "none",
  "manual",
  "predefined",
  "provider",
  "automatic"
]);

export const DEFAULTS = Object.freeze({
  chaseType: "pursuit",
  chaseLength: "medium",
  difficulty: "moderate",
  routeComplexity: "linear",
  imageMode: "none",
  round: 0,
  obstacleProgress: 0,
  requiredPoints: 1,
  packEnabled: true,
  packPriority: 0,
  imageProviderPriority: 0,
  roundPhase: "idle",
  groupPaceMode: "roll",
  steadyObstaclesPerRound: 1,
  escapeLead: 3
});
