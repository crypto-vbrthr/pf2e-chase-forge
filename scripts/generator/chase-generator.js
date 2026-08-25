import {
  CHASE_LENGTH_GUIDELINES,
  CHASE_LENGTHS,
  CHASE_TYPES,
  DIFFICULTY_PROFILES,
  ROUTE_COMPLEXITIES
} from "../core/constants.js";
import { createChaseBlueprint, createChaseCard, createChaseTemplate } from "../data/factories.js";
import { cloneData, createId, nowIso, uniqueStrings } from "../data/utils.js";
import {
  addCardToBasicBlueprint,
  createBasicBuilderDraft,
  createManualChaseCard,
  defaultGroupsForChaseType,
  listBasicCards,
  replaceBasicGroupsForChaseType
} from "../builder/basic-builder-model.js";
import {
  addBranchAfterCard,
  isBranchingBuilderBlueprint,
  listBranchGroups,
  updateBuilderCardByRef
} from "../builder/branching-builder-model.js";

export const CHASE_GENERATOR_CONTRACT_VERSION = 1;
function localizeRuntime(key, fallback = "") {
  if (!key) return fallback;
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : fallback;
}

export function localizeChaseTemplate(templateInput) {
  const template = createChaseTemplate(templateInput);
  const keys = template.metadata?.i18n ?? {};
  const generator = { ...template.generator };
  if (keys.fallbackNamePrefix) {
    generator.fallbackNamePrefix = localizeRuntime(keys.fallbackNamePrefix, generator.fallbackNamePrefix ?? "Generated Obstacle");
  }
  return createChaseTemplate({
    ...template,
    name: localizeRuntime(keys.name, template.name),
    description: localizeRuntime(keys.description, template.description),
    generator
  });
}


const DEFAULT_SEED_PREFIX = "chase";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSeed(seed) {
  const raw = String(seed ?? "").trim();
  return raw || `${DEFAULT_SEED_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const text = String(seed ?? "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function mergeSettings(template, options = {}) {
  const base = cloneData(template.settings ?? {});
  const override = cloneData(options.settings ?? {});
  const settings = { ...base, ...override };
  if (options.chaseType && CHASE_TYPES.includes(options.chaseType)) settings.chaseType = options.chaseType;
  if (options.length && CHASE_LENGTHS.includes(options.length)) settings.length = options.length;
  if (options.difficulty && DIFFICULTY_PROFILES.includes(options.difficulty)) settings.difficulty = options.difficulty;
  if (options.routeComplexity && ROUTE_COMPLEXITIES.includes(options.routeComplexity)) settings.routeComplexity = options.routeComplexity;
  if (options.partyLevel !== undefined) settings.partyLevel = Number(options.partyLevel);
  if (options.environmentTags) settings.environmentTags = uniqueStrings(options.environmentTags);
  if (options.toneTags) settings.toneTags = uniqueStrings(options.toneTags);
  if (options.movementModes) settings.movementModes = uniqueStrings(options.movementModes);
  if (options.timeOfDay !== undefined) settings.timeOfDay = options.timeOfDay || null;
  if (options.weather !== undefined) settings.weather = options.weather ? cloneData(options.weather) : null;
  return settings;
}

function branchCountFor(settings, template, targetLength) {
  const explicit = template.generator?.branchCount;
  if (explicit !== undefined && explicit !== null) return clampInteger(explicit, 0, 2, 0);
  if (settings.routeComplexity === "branched") return targetLength >= 4 ? 1 : 0;
  if (settings.routeComplexity === "highlyBranched") return targetLength >= 6 ? 2 : (targetLength >= 4 ? 1 : 0);
  return 0;
}

function targetLengthFor(settings, template, options = {}) {
  const explicit = options.cardCount ?? template.generator?.cardCount;
  if (explicit !== undefined && explicit !== null) return clampInteger(explicit, 1, 40, 6);
  const key = CHASE_LENGTHS.includes(settings.length) ? settings.length : "medium";
  return clampInteger(CHASE_LENGTH_GUIDELINES[key], 1, 40, 8);
}

function cardTagSet(card) {
  return new Set(asArray(card.tags).map(tag => String(tag).trim()).filter(Boolean));
}

function cardMatchesLevel(card, partyLevel) {
  if (!Number.isFinite(Number(partyLevel))) return true;
  const level = Number(partyLevel);
  const min = card.level?.min;
  const max = card.level?.max;
  if (min !== null && min !== undefined && level < Number(min)) return false;
  if (max !== null && max !== undefined && level > Number(max)) return false;
  return true;
}

function normalizedFilter(template) {
  const filters = template.filters ?? {};
  return {
    cardTypes: uniqueStrings(filters.cardTypes?.length ? filters.cardTypes : ["obstacle", "complication", "opportunity", "finale"]),
    requiredTags: uniqueStrings(filters.requiredTags),
    preferredTags: uniqueStrings(filters.preferredTags),
    excludedTags: uniqueStrings(filters.excludedTags),
    requireLevelMatch: filters.requireLevelMatch !== false,
    requireEnvironmentMatch: filters.requireEnvironmentMatch === true,
    requireToneMatch: filters.requireToneMatch === true
  };
}

function scoreCard(card, context, filter) {
  const tags = cardTagSet(card);
  if (!filter.cardTypes.includes(card.type)) return null;
  if (filter.requireLevelMatch && !cardMatchesLevel(card, context.partyLevel)) return null;
  if (filter.requiredTags.some(tag => !tags.has(tag))) return null;
  if (filter.excludedTags.some(tag => tags.has(tag))) return null;

  const environmentTags = uniqueStrings(context.environmentTags);
  const toneTags = uniqueStrings(context.toneTags);
  if (filter.requireEnvironmentMatch && environmentTags.length && !environmentTags.some(tag => tags.has(tag))) return null;
  if (filter.requireToneMatch && toneTags.length && !toneTags.some(tag => tags.has(tag))) return null;

  let score = 1;
  for (const tag of filter.preferredTags) if (tags.has(tag)) score += 5;
  for (const tag of environmentTags) if (tags.has(tag)) score += 4;
  for (const tag of toneTags) if (tags.has(tag)) score += 2;
  for (const mode of uniqueStrings(context.movementModes)) if (tags.has(mode) || tags.has(`movement:${mode}`)) score += 1;
  if (context.timeOfDay && (tags.has(context.timeOfDay) || tags.has(`time:${context.timeOfDay}`))) score += 1;
  if (card.type === "obstacle") score += 1;
  return score;
}

function weightedPick(pool, random) {
  const total = pool.reduce((sum, item) => sum + Math.max(0.001, Number(item.score) || 0), 0);
  if (total <= 0) return pool[Math.floor(random() * pool.length)] ?? null;
  let needle = random() * total;
  for (const item of pool) {
    needle -= Math.max(0.001, Number(item.score) || 0);
    if (needle <= 0) return item;
  }
  return pool.at(-1) ?? null;
}

export function inspectGenerationCandidates(templateInput, cards = [], options = {}) {
  const template = createChaseTemplate(templateInput);
  const settings = mergeSettings(template, options);
  const filter = normalizedFilter(template);
  const context = {
    partyLevel: settings.partyLevel,
    environmentTags: settings.environmentTags,
    toneTags: settings.toneTags,
    movementModes: settings.movementModes,
    timeOfDay: settings.timeOfDay
  };
  const eligible = [];
  const rejected = [];
  for (const raw of cards ?? []) {
    const card = createChaseCard(raw);
    const score = scoreCard(card, context, filter);
    if (score === null) rejected.push(card.id);
    else eligible.push({ card, score });
  }
  eligible.sort((a, b) => b.score - a.score || String(a.card.name).localeCompare(String(b.card.name)));
  return Object.freeze({ template, settings, filter, eligible, rejected });
}

export function selectGenerationCards(templateInput, cards = [], options = {}) {
  const inspected = inspectGenerationCandidates(templateInput, cards, options);
  const seed = normalizeSeed(options.seed);
  const random = seededRandom(seed);
  const count = clampInteger(options.count, 0, 80, 0);
  const allowDuplicates = options.allowDuplicates ?? inspected.template.generator?.allowDuplicates === true;
  const remaining = [...inspected.eligible];
  const selected = [];
  while (selected.length < count && remaining.length > 0) {
    const chosen = weightedPick(remaining, random);
    if (!chosen) break;
    selected.push(createChaseCard(chosen.card));
    if (!allowDuplicates) {
      const index = remaining.findIndex(item => item.card.id === chosen.card.id);
      if (index >= 0) remaining.splice(index, 1);
    }
  }
  if (allowDuplicates && inspected.eligible.length > 0) {
    while (selected.length < count) {
      const chosen = weightedPick(inspected.eligible, random);
      if (!chosen) break;
      selected.push(createChaseCard(chosen.card));
    }
  }
  return Object.freeze({ seed, selected, candidateCount: inspected.eligible.length, rejectedCount: inspected.rejected.length });
}

function generationFallbackCard(index, requiredPoints = 1, prefix = "Generated Obstacle") {
  return createManualChaseCard({ requiredPoints, name: `${prefix} ${index + 1}` });
}

function attachGeneratorOrigin(card, templateId) {
  const clone = createChaseCard(card);
  return createChaseCard({
    ...cloneData(clone),
    metadata: {
      ...(clone.metadata ?? {}),
      generatorOriginCardRef: clone.id,
      generatorTemplateId: templateId
    }
  });
}

function preserveGroups(next, sourceBlueprint, chaseType) {
  if (!sourceBlueprint?.groups?.length) return next;
  const source = createChaseBlueprint(sourceBlueprint);
  const sameType = source.settings?.chaseType === chaseType;
  if (sameType) {
    const candidate = createChaseBlueprint({ ...cloneData(next), groups: cloneData(source.groups) });
    return candidate;
  }
  const withPrior = createChaseBlueprint({ ...cloneData(next), groups: cloneData(source.groups) });
  return replaceBasicGroupsForChaseType(withPrior, chaseType, { preserveParticipants: true });
}

function replaceGeneratedBranchCards(blueprint, group, replacements, templateId) {
  let next = blueprint;
  const refs = group.routes.flatMap(route => route.nodes.map(node => node.ref)).filter(Boolean);
  for (let index = 0; index < refs.length; index += 1) {
    const replacement = replacements[index];
    if (!replacement) continue;
    next = updateBuilderCardByRef(next, refs[index], () => attachGeneratorOrigin(replacement, templateId));
    const record = next.contentSnapshots?.cards?.find(candidate => candidate.ref === refs[index]);
    if (record) {
      record.metadata ??= {};
      record.metadata.originCardRef = replacement.id;
      record.metadata.generatorTemplateId = templateId;
    }
  }
  return createChaseBlueprint(next);
}

function branchPositions(mainlineCount, branchCount) {
  if (branchCount <= 0 || mainlineCount <= 1) return [];
  if (branchCount === 1) return [Math.max(0, Math.min(mainlineCount - 2, Math.floor(mainlineCount / 2) - 1))];
  const first = Math.max(0, Math.min(mainlineCount - 2, Math.floor(mainlineCount / 3) - 1));
  const second = Math.max(first + 1, Math.min(mainlineCount - 2, Math.floor((mainlineCount * 2) / 3) - 1));
  return [...new Set([first, second])].slice(0, branchCount);
}

export function generateChaseFromTemplate(templateInput, cards = [], options = {}) {
  const template = createChaseTemplate(templateInput);
  const settings = mergeSettings(template, options);
  const targetLength = targetLengthFor(settings, template, options);
  const branchCount = branchCountFor(settings, template, targetLength);
  const mainlineCount = Math.max(1, targetLength - branchCount);
  const uniqueCardSlots = mainlineCount + branchCount * 2;
  const selection = selectGenerationCards(template, cards, { ...options, count: uniqueCardSlots });
  const selectedQueue = [...selection.selected];
  const largestGroup = Math.max(1, ...(options.sourceBlueprint?.groups ?? []).map(group => group.participants?.length ?? 0));
  const requiredPoints = Math.max(1, largestGroup - 1);
  let fallbackCount = 0;
  const takeCard = index => {
    const card = selectedQueue.shift();
    if (card) return attachGeneratorOrigin(card, template.id);
    fallbackCount += 1;
    return createChaseCard({
      ...generationFallbackCard(index, requiredPoints, template.generator?.fallbackNamePrefix ?? "Generated Obstacle"),
      metadata: { builderCreated: true, generatorFallback: true, generatorTemplateId: template.id }
    });
  };

  const sourceBlueprint = options.sourceBlueprint ? createChaseBlueprint(options.sourceBlueprint) : null;
  const inputName = String(options.name ?? sourceBlueprint?.name ?? "").trim();
  const name = inputName || template.name;
  let blueprint = createBasicBuilderDraft({
    id: options.blueprintId ?? sourceBlueprint?.id ?? undefined,
    name,
    description: options.description ?? sourceBlueprint?.description ?? template.description ?? "",
    gmNotes: options.gmNotes ?? sourceBlueprint?.gmNotes ?? "",
    chaseType: settings.chaseType,
    length: settings.length,
    difficulty: settings.difficulty,
    partyLevel: settings.partyLevel,
    startDistance: settings.startDistance,
    movementModes: settings.movementModes,
    environmentTags: settings.environmentTags,
    toneTags: settings.toneTags,
    timeOfDay: settings.timeOfDay,
    weather: settings.weather,
    imageMode: settings.imageMode,
    image: cloneData(options.image ?? sourceBlueprint?.image ?? undefined),
    tags: cloneData(options.tags ?? sourceBlueprint?.tags ?? []),
    roundDuration: settings.roundDuration,
    victory: settings.victory,
    gmOptions: settings.gmOptions,
    groups: defaultGroupsForChaseType(settings.chaseType),
    actionLevel: options.actionLevel ?? sourceBlueprint?.metadata?.builder?.actionLevel ?? "medium",
    humorLevel: options.humorLevel ?? sourceBlueprint?.metadata?.builder?.humorLevel ?? "low",
    metadata: cloneData(options.metadata ?? sourceBlueprint?.metadata ?? {})
  });
  blueprint = preserveGroups(blueprint, sourceBlueprint, settings.chaseType);

  for (let index = 0; index < mainlineCount; index += 1) {
    const card = takeCard(index);
    blueprint = addCardToBasicBlueprint(blueprint, card, { originCardRef: card.metadata?.generatorOriginCardRef ?? null }).blueprint;
  }

  const baseMainline = listBasicCards(blueprint);
  const positions = branchPositions(baseMainline.length, branchCount);
  for (let branchIndex = 0; branchIndex < positions.length; branchIndex += 1) {
    const source = baseMainline[positions[branchIndex]];
    if (!source?.node?.id) continue;
    const before = new Set(listBranchGroups(blueprint).map(group => group.branchGroupId));
    const labels = asArray(template.generator?.branchLabels?.[branchIndex]);
    blueprint = addBranchAfterCard(blueprint, source.node.id, {
      leftLabel: labels[0] ?? `Route ${branchIndex + 1}A`,
      rightLabel: labels[1] ?? `Route ${branchIndex + 1}B`,
      leftCardName: `Route ${branchIndex + 1}A`,
      rightCardName: `Route ${branchIndex + 1}B`
    });
    const group = listBranchGroups(blueprint).find(item => !before.has(item.branchGroupId));
    if (!group) continue;
    blueprint = replaceGeneratedBranchCards(blueprint, group, [takeCard(mainlineCount + branchIndex * 2), takeCard(mainlineCount + branchIndex * 2 + 1)], template.id);
  }

  const generatedAt = nowIso();
  const next = cloneData(blueprint);
  next.settings.routeComplexity = isBranchingBuilderBlueprint(next) ? (branchCount > 1 ? "highlyBranched" : "branched") : "linear";
  next.metadata ??= {};
  if (sourceBlueprint?.createdAt) next.createdAt = sourceBlueprint.createdAt;
  next.metadata.generator = {
    contractVersion: CHASE_GENERATOR_CONTRACT_VERSION,
    templateId: template.id,
    templateSource: cloneData(template.source ?? null),
    seed: selection.seed,
    generatedAt,
    targetLength,
    branchCount: positions.length,
    candidateCount: selection.candidateCount,
    selectedRegisteredCards: selection.selected.length,
    fallbackCards: fallbackCount,
    options: {
      partyLevel: settings.partyLevel,
      environmentTags: cloneData(settings.environmentTags ?? []),
      toneTags: cloneData(settings.toneTags ?? []),
      movementModes: cloneData(settings.movementModes ?? []),
      timeOfDay: settings.timeOfDay ?? null
    }
  };
  next.updatedAt = generatedAt;
  return Object.freeze({
    blueprint: createChaseBlueprint(next),
    template,
    report: Object.freeze({
      seed: selection.seed,
      targetLength,
      branchCount: positions.length,
      candidateCount: selection.candidateCount,
      selectedRegisteredCards: selection.selected.length,
      fallbackCards: fallbackCount
    })
  });
}

export function createChaseGenerator({ templates, cards } = {}) {
  const listCards = () => cards?.list?.({ includeDisabled: false }) ?? [];
  const resolveTemplate = input => {
    const raw = typeof input === "string"
      ? (templates?.get?.(input, { includeDisabled: false }) ?? null)
      : (input ? createChaseTemplate(input) : null);
    return raw ? localizeChaseTemplate(raw) : null;
  };
  const generate = (templateOrId, options = {}) => {
    const template = resolveTemplate(templateOrId);
    if (!template) throw new Error(`Unknown Chase Template '${templateOrId}'.`);
    return generateChaseFromTemplate(template, listCards(), options);
  };
  return Object.freeze({
    contractVersion: CHASE_GENERATOR_CONTRACT_VERSION,
    listTemplates: (options = {}) => (templates?.list?.(options) ?? []).map(localizeChaseTemplate),
    inspect: (templateOrId, options = {}) => {
      const template = resolveTemplate(templateOrId);
      if (!template) return null;
      return inspectGenerationCandidates(template, listCards(), options);
    },
    generate,
    reroll: (blueprintInput, options = {}) => {
      const blueprint = createChaseBlueprint(blueprintInput);
      const templateId = options.templateId ?? blueprint.metadata?.generator?.templateId;
      if (!templateId) throw new Error("The Chase does not record a generator template.");
      return generate(templateId, {
        sourceBlueprint: options.sourceBlueprint ?? blueprint,
        name: options.name ?? blueprint.name,
        description: options.description ?? blueprint.description,
        chaseType: options.chaseType ?? blueprint.settings?.chaseType,
        length: options.length ?? blueprint.settings?.length,
        difficulty: options.difficulty ?? blueprint.settings?.difficulty,
        routeComplexity: options.routeComplexity ?? blueprint.settings?.routeComplexity,
        partyLevel: options.partyLevel ?? blueprint.settings?.partyLevel,
        environmentTags: options.environmentTags ?? blueprint.settings?.environmentTags,
        toneTags: options.toneTags ?? blueprint.settings?.toneTags,
        movementModes: options.movementModes ?? blueprint.settings?.movementModes,
        timeOfDay: options.timeOfDay ?? blueprint.settings?.timeOfDay,
        weather: options.weather ?? blueprint.settings?.weather,
        ...options
      });
    }
  });
}
