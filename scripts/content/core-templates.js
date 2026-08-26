import { MODULE_ID, MODULE_VERSION } from "../core/constants.js";

function coreTemplate({ id, name, nameKey, description, descriptionKey, chaseType, length = "medium", routeComplexity = "linear", branchCount = 0, victory = {}, icon }) {
  return {
    id,
    name,
    description,
    settings: {
      chaseType,
      length,
      difficulty: "moderate",
      routeComplexity,
      movementModes: ["land"],
      environmentTags: [],
      toneTags: [],
      victory
    },
    filters: { cardTypes: ["obstacle", "complication", "opportunity"], requireLevelMatch: true },
    generator: {
      allowDuplicates: false,
      branchCount,
      fallbackNamePrefix: "Generated Obstacle"
    },
    metadata: {
      coreTemplate: true,
      icon,
      i18n: {
        name: nameKey,
        description: descriptionKey,
        fallbackNamePrefix: "PF2E_CHASE_FORGE.Generator.PlaceholderName"
      }
    }
  };
}

export function createCoreTemplatePack() {
  return {
    id: "core:templates",
    label: "Chase Forge Core Templates",
    description: "Structural templates for quickly generating editable Chase Blueprints.",
    version: MODULE_VERSION,
    priority: 100,
    enabledByDefault: true,
    cards: [],
    blueprints: [],
    imageProviders: [],
    templates: [
      coreTemplate({
        id: "core:classic-pursuit",
        name: "Classic Pursuit",
        nameKey: "PF2E_CHASE_FORGE.Generator.TemplateClassicPursuit",
        description: "A straightforward medium pursuit with a clear sequence of obstacles.",
        descriptionKey: "PF2E_CHASE_FORGE.Generator.TemplateClassicPursuitHint",
        chaseType: "pursuit",
        icon: "fa-person-running"
      }),
      coreTemplate({
        id: "core:branching-pursuit",
        name: "Branching Pursuit",
        nameKey: "PF2E_CHASE_FORGE.Generator.TemplateBranchingPursuit",
        description: "A medium pursuit with one visible route decision and a later merge.",
        descriptionKey: "PF2E_CHASE_FORGE.Generator.TemplateBranchingPursuitHint",
        chaseType: "pursuit",
        routeComplexity: "branched",
        branchCount: 1,
        icon: "fa-code-branch"
      }),
      coreTemplate({
        id: "core:escape",
        name: "Escape",
        nameKey: "PF2E_CHASE_FORGE.Generator.TemplateEscape",
        description: "A medium escape in which the player side tries to stay ahead of its pursuers.",
        descriptionKey: "PF2E_CHASE_FORGE.Generator.TemplateEscapeHint",
        chaseType: "escape",
        routeComplexity: "branched",
        branchCount: 1,
        icon: "fa-person-running-arrow-right"
      }),
      coreTemplate({
        id: "core:against-clock",
        name: "Against the Clock",
        nameKey: "PF2E_CHASE_FORGE.Generator.TemplateAgainstClock",
        description: "A shorter objective chase for reaching a destination before time runs out.",
        descriptionKey: "PF2E_CHASE_FORGE.Generator.TemplateAgainstClockHint",
        chaseType: "againstClock",
        length: "short",
        victory: { roundLimit: 6 },
        icon: "fa-clock"
      }),
      coreTemplate({
        id: "core:race",
        name: "Race",
        nameKey: "PF2E_CHASE_FORGE.Generator.TemplateRace",
        description: "A medium race with a route decision for two or more competitors.",
        descriptionKey: "PF2E_CHASE_FORGE.Generator.TemplateRaceHint",
        chaseType: "race",
        routeComplexity: "branched",
        branchCount: 1,
        icon: "fa-flag-checkered"
      })
    ],
    metadata: {
      core: true,
      generatorTemplates: true,
      sourceModule: MODULE_ID,
      i18n: {
        label: "PF2E_CHASE_FORGE.Generator.CorePack",
        description: "PF2E_CHASE_FORGE.Generator.CorePackHint"
      }
    }
  };
}
