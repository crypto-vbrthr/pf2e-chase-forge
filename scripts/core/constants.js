export const MODULE_ID = "pf2e-chase-forge";
export const MODULE_VERSION = "0.1.0-dev.3";
export const API_VERSION = 3;
export const EXTENSION_CONTRACT_VERSION = 1;

export const SCHEMA_VERSIONS = Object.freeze({
  card: 1,
  template: 1,
  blueprint: 1,
  session: 2,
  result: 1,
  publicState: 1,
  consequence: 1,
  pack: 1
});

export const EXTENSION_CAPABILITIES = Object.freeze([
  "registries.cards",
  "registries.templates",
  "registries.packs",
  "registries.imageProviders",
  "packs.activation",
  "extensions.boundOwnership",
  "extensions.transactionalRegistration",
  "extensions.registrationDiagnostics",
  "routing.traversal",
  "routing.conditions",
  "routing.multiGroup"
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

export const DEGREE_KEYS = Object.freeze([
  "criticalSuccess",
  "success",
  "failure",
  "criticalFailure"
]);

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
  imageProviderPriority: 0
});
