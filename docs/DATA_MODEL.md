# Core Data Model

All core contracts use explicit `schemaVersion` fields. Schema v1 is the development baseline.

## ChaseCard

Reusable chase content. A card may be an obstacle, complication, opportunity, or finale.

Key fields:

```text
schemaVersion
id
source
name / description / gmNotes
type
tags
level
obstacle.requiredPoints
approaches[]
outcomes
image
metadata
```

Each approach reserves a DC contract and outcome map for all four PF2e degrees of success. Actual PF2e DC calculation and rolling are deferred to the PF2e adapter/rules engine.

## ChaseTemplate

A reusable quick-start preset. It stores settings, filters, and generator hints, but no runtime progress.

## ChaseBlueprint

A prepared chase that can later be saved, linked from Journals, referenced from Campaign Forge, or instantiated as a session.

Key fields:

```text
schemaVersion
id
source
name / description / gmNotes
settings
groups[]
graph
tags
image
createdAt / updatedAt
metadata
```

## Route graph

```text
graph.nodes[]
graph.edges[]
graph.startNodeId
graph.endNodeIds[]
```

Node types:

- `start`
- `card`
- `choice`
- `merge`
- `end`

Edge types:

- `normal`
- `branch`
- `shortcut`
- `conditional`

Visibility:

- `public`
- `hidden`
- `discoverable`

Graph validation requires exactly one start node, at least one declared end node, valid edge references, no self edges, no cycles, no unreachable nodes, no incoming edge to the start, and no outgoing edge from a declared end.

Choice/merge arity issues are warnings rather than errors so partially authored blueprints remain inspectable.

## Participant groups

A blueprint group contains participants and a role. Runtime session groups refer back to those groups but carry their own position and route history.

This separation allows a later session to split a blueprint group into multiple runtime groups without rewriting the blueprint.

Runtime position:

```text
position.nodeId
position.progress
```

This is intentionally not a single numeric track position.

## ChaseSession

Mutable runtime state:

```text
schemaVersion
id
blueprintId
blueprintSnapshot
status
round
activeGroupId
groups[]
nodeState
unlockedEdgeIds
lockedEdgeIds
events
timestamps
metadata
```

The optional blueprint snapshot is designed to keep a running chase stable even when its source blueprint changes later.

## ChaseResult

Completion record containing outcome, ending node, winner/loser groups, route summaries, rounds, event summary, and timestamps.

## ChasePublicState

Player-facing transport contract for the future Player Chase View:

```text
schemaVersion
sessionId
title
status
round
current
groups
visibleRoutes
availableActions
personalEffects
log
metadata
```

This structure is not generated from a session in dev.1. A dedicated projector will be required later. Code must never expose a full `ChaseSession` to player clients and call it public state.

## ChaseConsequence

Supported consequence kinds in schema v1:

- `chasePoints`
- `routeUnlock`
- `routeLock`
- `routeSelect`
- `effectForge`
- `narrative`
- `custom`

Effect Forge references support `embedded` definitions and `item` UUIDs. Their execution is deferred to the planned integration bridge.
