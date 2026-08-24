import {
  CARD_TYPES,
  CHASE_LENGTHS,
  CHASE_TYPES,
  CONSEQUENCE_KINDS,
  DEGREE_KEYS,
  DIFFICULTY_PROFILES,
  EDGE_TYPES,
  EDGE_VISIBILITY,
  EFFECT_FORGE_SOURCES,
  GROUP_ROLES,
  IMAGE_MODES,
  NODE_TYPES,
  PARTICIPANT_KINDS,
  RESULT_OUTCOMES,
  ROUTE_COMPLEXITIES,
  SCHEMA_VERSIONS,
  SESSION_STATUSES
} from "../core/constants.js";
import { buildGraphIndex, findCycle, getReachableNodeIds } from "./graph.js";
import { isPlainObject } from "./utils.js";

function issue(code, path, message, details = null) {
  return { code, path, message, details };
}

function createCollector() {
  const errors = [];
  const warnings = [];
  return {
    errors,
    warnings,
    error: (code, path, message, details) => errors.push(issue(code, path, message, details)),
    warn: (code, path, message, details) => warnings.push(issue(code, path, message, details)),
    result: () => ({ valid: errors.length === 0, errors, warnings })
  };
}

function requireObject(value, collector, path) {
  if (!isPlainObject(value)) {
    collector.error("NOT_OBJECT", path, `${path || "value"} must be an object.`);
    return false;
  }
  return true;
}

function requireNonEmptyString(value, collector, path) {
  if (typeof value !== "string" || !value.trim()) {
    collector.error("REQUIRED_STRING", path, `${path} must be a non-empty string.`);
    return false;
  }
  return true;
}

function requireSchema(value, expected, collector, path = "schemaVersion") {
  if (value !== expected) collector.error("SCHEMA_VERSION", path, `Expected schema version ${expected}.`, { actual: value });
}

function validateEnum(value, allowed, collector, path) {
  if (!allowed.includes(value)) collector.error("ENUM", path, `${path} contains an unsupported value.`, { actual: value, allowed });
}

function validateUniqueIds(items, collector, path) {
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const id = item?.id;
    if (!requireNonEmptyString(id, collector, `${path}[${index}].id`)) return;
    if (seen.has(id)) collector.error("DUPLICATE_ID", `${path}[${index}].id`, `Duplicate id '${id}'.`);
    seen.add(id);
  });
}

function validateConsequenceInternal(consequence, collector, path) {
  if (!requireObject(consequence, collector, path)) return;
  requireSchema(consequence.schemaVersion, SCHEMA_VERSIONS.consequence, collector, `${path}.schemaVersion`);
  requireNonEmptyString(consequence.id, collector, `${path}.id`);
  validateEnum(consequence.kind, CONSEQUENCE_KINDS, collector, `${path}.kind`);
  if (!isPlainObject(consequence.payload)) collector.error("PAYLOAD", `${path}.payload`, "Consequence payload must be an object.");
  if (consequence.kind === "effectForge") {
    const source = consequence.payload?.source;
    validateEnum(source, EFFECT_FORGE_SOURCES, collector, `${path}.payload.source`);
    if (source === "embedded" && !isPlainObject(consequence.payload?.definition)) {
      collector.error("EFFECT_DEFINITION", `${path}.payload.definition`, "Embedded Effect Forge consequences require a definition object.");
    }
    if (source === "item" && (typeof consequence.payload?.uuid !== "string" || !consequence.payload.uuid.trim())) {
      collector.error("EFFECT_UUID", `${path}.payload.uuid`, "Item Effect Forge consequences require an Item UUID.");
    }
  }
  if (["routeUnlock", "routeLock", "routeSelect"].includes(consequence.kind)) {
    if (!Array.isArray(consequence.payload?.edgeIds) || consequence.payload.edgeIds.length === 0) {
      collector.error("ROUTE_EDGE_IDS", `${path}.payload.edgeIds`, `${consequence.kind} requires at least one edge id.`);
    }
  }
}

function validateOutcomes(outcomes, collector, path) {
  if (!requireObject(outcomes, collector, path)) return;
  for (const degree of DEGREE_KEYS) {
    if (!Array.isArray(outcomes[degree])) {
      collector.error("OUTCOME_ARRAY", `${path}.${degree}`, "Outcome degree must be an array.");
      continue;
    }
    validateUniqueIds(outcomes[degree], collector, `${path}.${degree}`);
    outcomes[degree].forEach((consequence, index) => validateConsequenceInternal(consequence, collector, `${path}.${degree}[${index}]`));
  }
}

function validateImage(image, collector, path) {
  if (!requireObject(image, collector, path)) return;
  validateEnum(image.mode, IMAGE_MODES, collector, `${path}.mode`);
  if (!Array.isArray(image.candidates)) collector.error("IMAGE_CANDIDATES", `${path}.candidates`, "Image candidates must be an array.");
}

export function validateChaseCard(card) {
  const c = createCollector();
  if (!requireObject(card, c, "card")) return c.result();
  requireSchema(card.schemaVersion, SCHEMA_VERSIONS.card, c);
  requireNonEmptyString(card.id, c, "id");
  requireNonEmptyString(card.name, c, "name");
  validateEnum(card.type, CARD_TYPES, c, "type");
  if (!Array.isArray(card.tags)) c.error("TAGS", "tags", "Card tags must be an array.");
  if (!Array.isArray(card.approaches)) c.error("APPROACHES", "approaches", "Card approaches must be an array.");
  else {
    validateUniqueIds(card.approaches, c, "approaches");
    card.approaches.forEach((approach, index) => {
      requireNonEmptyString(approach.id, c, `approaches[${index}].id`);
      if (!isPlainObject(approach.dc)) c.error("DC", `approaches[${index}].dc`, "Approach DC must be an object.");
      validateOutcomes(approach.outcomes, c, `approaches[${index}].outcomes`);
    });
  }
  if (!Number.isInteger(card.obstacle?.requiredPoints) || card.obstacle.requiredPoints < 1) {
    c.error("REQUIRED_POINTS", "obstacle.requiredPoints", "Obstacle required points must be an integer of at least 1.");
  }
  validateOutcomes(card.outcomes, c, "outcomes");
  validateImage(card.image, c, "image");
  return c.result();
}

export function validateChaseTemplate(template) {
  const c = createCollector();
  if (!requireObject(template, c, "template")) return c.result();
  requireSchema(template.schemaVersion, SCHEMA_VERSIONS.template, c);
  requireNonEmptyString(template.id, c, "id");
  requireNonEmptyString(template.name, c, "name");
  if (!isPlainObject(template.settings)) c.error("SETTINGS", "settings", "Template settings must be an object.");
  else {
    validateEnum(template.settings.chaseType, CHASE_TYPES, c, "settings.chaseType");
    validateEnum(template.settings.length, CHASE_LENGTHS, c, "settings.length");
    validateEnum(template.settings.difficulty, DIFFICULTY_PROFILES, c, "settings.difficulty");
    validateEnum(template.settings.routeComplexity, ROUTE_COMPLEXITIES, c, "settings.routeComplexity");
    validateEnum(template.settings.imageMode, IMAGE_MODES, c, "settings.imageMode");
  }
  return c.result();
}

export function validateParticipantGroup(group, path = "group") {
  const c = createCollector();
  if (!requireObject(group, c, path)) return c.result();
  requireNonEmptyString(group.id, c, `${path}.id`);
  validateEnum(group.role, GROUP_ROLES, c, `${path}.role`);
  if (!Array.isArray(group.participants)) c.error("PARTICIPANTS", `${path}.participants`, "Participants must be an array.");
  else {
    validateUniqueIds(group.participants, c, `${path}.participants`);
    group.participants.forEach((participant, index) => {
      validateEnum(participant.kind, PARTICIPANT_KINDS, c, `${path}.participants[${index}].kind`);
      if (["actor", "token"].includes(participant.kind) && !participant.uuid) {
        c.warn("MISSING_UUID", `${path}.participants[${index}].uuid`, `${participant.kind} participant has no UUID and will need resolution before play.`);
      }
    });
  }
  return c.result();
}

export function validateRouteGraph(graph, { allowEmpty = false } = {}) {
  const c = createCollector();
  if (!requireObject(graph, c, "graph")) return c.result();
  if (!Array.isArray(graph.nodes)) {
    c.error("NODES", "graph.nodes", "Graph nodes must be an array.");
    return c.result();
  }
  if (!Array.isArray(graph.edges)) {
    c.error("EDGES", "graph.edges", "Graph edges must be an array.");
    return c.result();
  }
  if (allowEmpty && graph.nodes.length === 0) return c.result();
  if (graph.nodes.length === 0) c.error("EMPTY_GRAPH", "graph.nodes", "A chase graph must contain nodes.");

  validateUniqueIds(graph.nodes, c, "graph.nodes");
  validateUniqueIds(graph.edges, c, "graph.edges");
  const nodeIds = new Set(graph.nodes.map(node => node.id));

  graph.nodes.forEach((node, index) => {
    validateEnum(node.type, NODE_TYPES, c, `graph.nodes[${index}].type`);
    if (node.type === "card" && !node.cardRef) c.warn("CARD_REF", `graph.nodes[${index}].cardRef`, "Card node has no card reference yet.");
  });

  graph.edges.forEach((edge, index) => {
    validateEnum(edge.type, EDGE_TYPES, c, `graph.edges[${index}].type`);
    validateEnum(edge.visibility, EDGE_VISIBILITY, c, `graph.edges[${index}].visibility`);
    if (!nodeIds.has(edge.from)) c.error("EDGE_FROM", `graph.edges[${index}].from`, `Unknown source node '${edge.from}'.`);
    if (!nodeIds.has(edge.to)) c.error("EDGE_TO", `graph.edges[${index}].to`, `Unknown target node '${edge.to}'.`);
    if (edge.from === edge.to) c.error("SELF_EDGE", `graph.edges[${index}]`, "Self-referencing graph edges are not allowed.");
  });

  const startNodes = graph.nodes.filter(node => node.type === "start");
  if (startNodes.length !== 1) c.error("START_COUNT", "graph.nodes", "A chase graph must contain exactly one start node.", { count: startNodes.length });
  if (!graph.startNodeId || !nodeIds.has(graph.startNodeId)) c.error("START_NODE", "graph.startNodeId", "Graph startNodeId must reference an existing node.");
  else if (startNodes.length === 1 && graph.startNodeId !== startNodes[0].id) c.error("START_MISMATCH", "graph.startNodeId", "startNodeId must reference the node whose type is 'start'.");

  if (!Array.isArray(graph.endNodeIds) || graph.endNodeIds.length === 0) c.error("END_NODES", "graph.endNodeIds", "A chase graph must define at least one end node.");
  const declaredEnds = new Set(Array.isArray(graph.endNodeIds) ? graph.endNodeIds : []);
  for (const endId of declaredEnds) {
    if (!nodeIds.has(endId)) c.error("END_NODE", "graph.endNodeIds", `Unknown end node '${endId}'.`);
    else if (graph.nodes.find(node => node.id === endId)?.type !== "end") c.error("END_TYPE", "graph.endNodeIds", `Declared end node '${endId}' must have type 'end'.`);
  }
  const typedEnds = graph.nodes.filter(node => node.type === "end").map(node => node.id);
  for (const id of typedEnds) if (!declaredEnds.has(id)) c.warn("UNDECLARED_END", "graph.endNodeIds", `End node '${id}' is not listed in endNodeIds.`);

  const cycle = findCycle(graph);
  if (cycle) c.error("GRAPH_CYCLE", "graph", "Chase route graphs must be acyclic.", { cycle });

  if (!c.errors.some(error => ["START_NODE", "START_COUNT", "EDGE_FROM", "EDGE_TO"].includes(error.code))) {
    const reachable = getReachableNodeIds(graph, graph.startNodeId);
    for (const id of nodeIds) if (!reachable.has(id)) c.error("UNREACHABLE_NODE", "graph", `Node '${id}' is unreachable from the start node.`);
    for (const id of declaredEnds) if (nodeIds.has(id) && !reachable.has(id)) c.error("UNREACHABLE_END", "graph.endNodeIds", `End node '${id}' is unreachable from the start node.`);
  }

  const { incoming, outgoing } = buildGraphIndex(graph);
  if (graph.startNodeId && (incoming.get(graph.startNodeId)?.length ?? 0) > 0) c.error("START_INCOMING", "graph", "Start node must not have incoming edges.");
  for (const endId of declaredEnds) if ((outgoing.get(endId)?.length ?? 0) > 0) c.error("END_OUTGOING", "graph", `End node '${endId}' must not have outgoing edges.`);

  graph.nodes.forEach(node => {
    const inCount = incoming.get(node.id)?.length ?? 0;
    const outCount = outgoing.get(node.id)?.length ?? 0;
    if (node.type === "choice" && outCount < 2) c.warn("CHOICE_ARITY", `graph.nodes.${node.id}`, "Choice node should have at least two outgoing edges.");
    if (node.type === "merge" && inCount < 2) c.warn("MERGE_ARITY", `graph.nodes.${node.id}`, "Merge node should have at least two incoming edges.");
  });

  return c.result();
}

export function validateChaseBlueprint(blueprint) {
  const c = createCollector();
  if (!requireObject(blueprint, c, "blueprint")) return c.result();
  requireSchema(blueprint.schemaVersion, SCHEMA_VERSIONS.blueprint, c);
  requireNonEmptyString(blueprint.id, c, "id");
  requireNonEmptyString(blueprint.name, c, "name");
  if (!isPlainObject(blueprint.settings)) c.error("SETTINGS", "settings", "Blueprint settings must be an object.");
  else {
    validateEnum(blueprint.settings.chaseType, CHASE_TYPES, c, "settings.chaseType");
    validateEnum(blueprint.settings.length, CHASE_LENGTHS, c, "settings.length");
    validateEnum(blueprint.settings.difficulty, DIFFICULTY_PROFILES, c, "settings.difficulty");
    validateEnum(blueprint.settings.routeComplexity, ROUTE_COMPLEXITIES, c, "settings.routeComplexity");
  }
  if (!Array.isArray(blueprint.groups)) c.error("GROUPS", "groups", "Blueprint groups must be an array.");
  else {
    validateUniqueIds(blueprint.groups, c, "groups");
    blueprint.groups.forEach((group, index) => {
      const result = validateParticipantGroup(group, `groups[${index}]`);
      c.errors.push(...result.errors);
      c.warnings.push(...result.warnings);
    });
  }
  const graph = validateRouteGraph(blueprint.graph);
  c.errors.push(...graph.errors);
  c.warnings.push(...graph.warnings);
  validateImage(blueprint.image, c, "image");
  return c.result();
}

export function validateChaseSession(session) {
  const c = createCollector();
  if (!requireObject(session, c, "session")) return c.result();
  requireSchema(session.schemaVersion, SCHEMA_VERSIONS.session, c);
  requireNonEmptyString(session.id, c, "id");
  validateEnum(session.status, SESSION_STATUSES, c, "status");
  if (!Number.isInteger(session.round) || session.round < 0) c.error("ROUND", "round", "Session round must be a non-negative integer.");
  if (!Array.isArray(session.groups)) c.error("GROUP_STATES", "groups", "Session groups must be an array.");
  else {
    validateUniqueIds(session.groups, c, "groups");
    session.groups.forEach((group, index) => {
      requireNonEmptyString(group.groupId, c, `groups[${index}].groupId`);
      if (!isPlainObject(group.position)) c.error("POSITION", `groups[${index}].position`, "Runtime group position must be an object.");
      else if (!Number.isInteger(group.position.progress) || group.position.progress < 0) c.error("PROGRESS", `groups[${index}].position.progress`, "Progress must be a non-negative integer.");
    });
  }
  if (session.blueprintSnapshot) {
    const result = validateChaseBlueprint(session.blueprintSnapshot);
    if (!result.valid) c.error("BLUEPRINT_SNAPSHOT", "blueprintSnapshot", "Session blueprint snapshot is invalid.", { errors: result.errors });
  }
  return c.result();
}

export function validateChaseResult(result) {
  const c = createCollector();
  if (!requireObject(result, c, "result")) return c.result();
  requireSchema(result.schemaVersion, SCHEMA_VERSIONS.result, c);
  requireNonEmptyString(result.id, c, "id");
  requireNonEmptyString(result.sessionId, c, "sessionId");
  validateEnum(result.outcome, RESULT_OUTCOMES, c, "outcome");
  if (!Number.isInteger(result.rounds) || result.rounds < 0) c.error("ROUNDS", "rounds", "Result rounds must be a non-negative integer.");
  return c.result();
}

export function validateChasePublicState(state) {
  const c = createCollector();
  if (!requireObject(state, c, "publicState")) return c.result();
  requireSchema(state.schemaVersion, SCHEMA_VERSIONS.publicState, c);
  requireNonEmptyString(state.sessionId, c, "sessionId");
  validateEnum(state.status, SESSION_STATUSES, c, "status");
  if (!Array.isArray(state.visibleRoutes)) c.error("VISIBLE_ROUTES", "visibleRoutes", "visibleRoutes must be an array.");
  if (!Array.isArray(state.availableActions)) c.error("AVAILABLE_ACTIONS", "availableActions", "availableActions must be an array.");
  return c.result();
}

export function validateConsequence(consequence) {
  const c = createCollector();
  validateConsequenceInternal(consequence, c, "consequence");
  return c.result();
}

export function validateChasePack(pack) {
  const c = createCollector();
  if (!requireObject(pack, c, "pack")) return c.result();
  requireSchema(pack.schemaVersion, SCHEMA_VERSIONS.pack, c);
  requireNonEmptyString(pack.id, c, "id");
  requireNonEmptyString(pack.label, c, "label");
  if (!Array.isArray(pack.cards)) c.error("PACK_CARDS", "cards", "Pack cards must be an array.");
  else {
    validateUniqueIds(pack.cards, c, "cards");
    pack.cards.forEach((card, index) => {
      const result = validateChaseCard(card);
      if (!result.valid) c.error("PACK_CARD_INVALID", `cards[${index}]`, `Card '${card?.id ?? index}' is invalid.`, { errors: result.errors });
      result.warnings.forEach(warning => c.warn(warning.code, `cards[${index}].${warning.path}`, warning.message, warning.details));
    });
  }
  if (!Array.isArray(pack.templates)) c.error("PACK_TEMPLATES", "templates", "Pack templates must be an array.");
  else {
    validateUniqueIds(pack.templates, c, "templates");
    pack.templates.forEach((template, index) => {
      const result = validateChaseTemplate(template);
      if (!result.valid) c.error("PACK_TEMPLATE_INVALID", `templates[${index}]`, `Template '${template?.id ?? index}' is invalid.`, { errors: result.errors });
      result.warnings.forEach(warning => c.warn(warning.code, `templates[${index}].${warning.path}`, warning.message, warning.details));
    });
  }
  if (!Number.isFinite(pack.priority)) c.error("PACK_PRIORITY", "priority", "Pack priority must be a finite number.");
  return c.result();
}
