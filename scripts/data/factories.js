import {
  normalizeChaseBlueprint,
  normalizeChaseCard,
  normalizeChaseEdge,
  normalizeChaseNode,
  normalizeChasePublicState,
  normalizeChaseResult,
  normalizeChaseSession,
  normalizeChaseTemplate,
  normalizeConsequence,
  normalizeParticipant,
  normalizeParticipantGroup,
  normalizeRouteGraph
} from "./normalizers.js";

export const createChaseCard = data => normalizeChaseCard(data);
export const createChaseTemplate = data => normalizeChaseTemplate(data);
export const createChaseBlueprint = data => normalizeChaseBlueprint(data);
export const createChaseSession = data => normalizeChaseSession(data);
export const createChaseResult = data => normalizeChaseResult(data);
export const createChasePublicState = data => normalizeChasePublicState(data);
export const createChaseNode = data => normalizeChaseNode(data);
export const createChaseEdge = data => normalizeChaseEdge(data);
export const createRouteGraph = data => normalizeRouteGraph(data);
export const createParticipant = data => normalizeParticipant(data);
export const createParticipantGroup = data => normalizeParticipantGroup(data);
export const createConsequence = data => normalizeConsequence(data);
