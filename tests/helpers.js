import {
  createChaseBlueprint,
  createChaseCard,
  createChaseEdge,
  createChaseNode,
  createChaseSession,
  createConsequence,
  createParticipant,
  createParticipantGroup
} from "../scripts/data/factories.js";

export function linearGraph() {
  return {
    nodes: [
      createChaseNode({ id: "start", type: "start", label: "Start" }),
      createChaseNode({ id: "obstacle-1", type: "card", cardRef: "core:market-crowd" }),
      createChaseNode({ id: "end", type: "end", label: "End" })
    ],
    edges: [
      createChaseEdge({ id: "e1", from: "start", to: "obstacle-1" }),
      createChaseEdge({ id: "e2", from: "obstacle-1", to: "end" })
    ],
    startNodeId: "start",
    endNodeIds: ["end"]
  };
}

export function branchedGraph() {
  return {
    nodes: [
      createChaseNode({ id: "start", type: "start" }),
      createChaseNode({ id: "choice", type: "choice" }),
      createChaseNode({ id: "roof", type: "card", cardRef: "core:roof" }),
      createChaseNode({ id: "alley", type: "card", cardRef: "core:alley" }),
      createChaseNode({ id: "merge", type: "merge" }),
      createChaseNode({ id: "end-a", type: "end" }),
      createChaseNode({ id: "end-b", type: "end" })
    ],
    edges: [
      createChaseEdge({ id: "e1", from: "start", to: "choice" }),
      createChaseEdge({ id: "e2", from: "choice", to: "roof", type: "branch" }),
      createChaseEdge({ id: "e3", from: "choice", to: "alley", type: "branch" }),
      createChaseEdge({ id: "e4", from: "roof", to: "merge" }),
      createChaseEdge({ id: "e5", from: "alley", to: "merge" }),
      createChaseEdge({ id: "e6", from: "merge", to: "end-a", type: "normal" }),
      createChaseEdge({ id: "e7", from: "merge", to: "end-b", type: "shortcut", visibility: "discoverable" })
    ],
    startNodeId: "start",
    endNodeIds: ["end-a", "end-b"]
  };
}

export function sampleGroup(overrides = {}) {
  return createParticipantGroup({
    id: "heroes",
    name: "Heroes",
    role: "pursuer",
    participants: [
      createParticipant({ id: "hero-1", kind: "actor", uuid: "Actor.hero1", name: "Hero One" }),
      createParticipant({ id: "hero-2", kind: "actor", uuid: "Actor.hero2", name: "Hero Two" })
    ],
    ...overrides
  });
}

export function sampleCard(overrides = {}) {
  return createChaseCard({
    id: "core:market-crowd",
    source: { moduleId: "pf2e-chase-forge", packId: "core" },
    type: "obstacle",
    name: "Market Crowd",
    obstacle: { requiredPoints: 3 },
    approaches: [
      {
        id: "athletics",
        label: "Push through",
        type: "check",
        statistic: "athletics",
        dc: { mode: "fixed", value: 15 },
        outcomes: {
          criticalSuccess: [createConsequence({ id: "cs", kind: "chasePoints", value: 2 })],
          success: [createConsequence({ id: "s", kind: "chasePoints", value: 1 })],
          failure: [],
          criticalFailure: [createConsequence({ id: "cf", kind: "chasePoints", value: -1 })]
        }
      }
    ],
    ...overrides
  });
}

export function sampleBlueprint(graph = linearGraph(), overrides = {}) {
  return createChaseBlueprint({
    id: "blueprint-1",
    name: "Test Chase",
    settings: {
      chaseType: "pursuit",
      length: "short",
      difficulty: "moderate",
      routeComplexity: "linear",
      startDistance: 1
    },
    groups: [sampleGroup()],
    graph,
    ...overrides
  });
}

export function sampleSession(overrides = {}) {
  const blueprint = sampleBlueprint();
  return createChaseSession({
    id: "session-1",
    blueprintId: blueprint.id,
    blueprintSnapshot: blueprint,
    status: "active",
    round: 1,
    groups: [
      {
        id: "runtime-heroes",
        groupId: "heroes",
        participantIds: ["hero-1", "hero-2"],
        position: { nodeId: "obstacle-1", progress: 1 },
        routeHistory: ["start", "obstacle-1"]
      }
    ],
    ...overrides
  });
}
