# Core Data Model

All core contracts use explicit `schemaVersion` fields.

Current versions:

```text
ChaseCard        1
ChaseTemplate    1
ChaseBlueprint   1
ChaseSession     2
ChaseResult      1
ChasePublicState 1
ChaseConsequence 1
ChasePack        1
```

`ChaseSession` moves to schema v2 in dev.3 because runtime groups now carry explicit `edgeHistory` in addition to node history. No persistent session migration is required yet because session persistence has not been introduced.

## ChaseCard

Reusable obstacle, complication, opportunity, or finale content. Approaches reserve DC data and outcome maps for all four PF2e degrees of success. Actual roll/DC processing remains deferred.

## ChaseTemplate

Quick-start preset containing settings, filters, and generator hints, but no runtime progress.

## ChaseBlueprint

Prepared chase definition:

```text
schemaVersion
id / source
name / description / gmNotes
settings
groups[]
graph
tags
image
timestamps
metadata
```

Blueprints are later intended for Journal links and Campaign Forge references.

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

Graph validation requires exactly one start node, declared endings, valid references, no self edges, no cycles, no unreachable nodes, no non-end dead ends, and a path from every node to at least one ending.

Edges may carry route conditions using Route Condition Contract v1.

## Participant groups

Blueprint groups contain participants and roles. Runtime groups reference one blueprint group and may carry all or a subset of its participants.

## ChaseSession v2

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
unlockedEdgeIds[]
lockedEdgeIds[]
events[]
timestamps
metadata
```

Runtime group:

```text
id
groupId
participantIds[]
parentRuntimeGroupId
position.nodeId
position.progress
routeHistory[]
edgeHistory[]
completed
metadata
```

The position is deliberately `nodeId + progress`, never a single flat track number.

## Route history invariant

For a history:

```text
routeHistory = [A, B, C]
edgeHistory  = [AB, BC]
```

edge `AB` must connect A to B and edge `BC` must connect B to C. dev.3 runtime integrity checks this before route mutations.

## ChaseResult

Completion record containing chase outcome, ending node, winner/loser groups, route summaries, rounds, events, and timestamps. The PF2e rules engine will later decide the semantic chase outcome.

## ChasePublicState

Dedicated future player-facing transport contract. A raw ChaseSession must never be treated as player-safe state.

## ChaseConsequence

Schema v1 reserves:

- `chasePoints`
- `routeUnlock`
- `routeLock`
- `routeSelect`
- `effectForge`
- `narrative`
- `custom`

Route lock/unlock execution is now available directly through the Route Graph Engine. General consequence orchestration and Effect Forge execution remain deferred.

## ChasePack

Transactional add-on content unit from dev.2. Packs can contribute cards, templates, and image providers. Pack activation affects content discovery but not active route state.
