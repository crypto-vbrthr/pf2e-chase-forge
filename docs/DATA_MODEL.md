# Core Data Model

All top-level contracts use explicit `schemaVersion` fields.

Current versions:

```text
ChaseCard        1
ChaseTemplate    1
ChaseBlueprint   1
ChaseSession     3
ChaseResult      1
ChasePublicState 1
ChaseConsequence 1
ChasePack        1
```

Session persistence has not been introduced yet, so the development-only Session schema changes do not require a world migration.

## ChaseCard

Reusable obstacle, complication, opportunity, or finale content. Approaches can use these DC modes:

```text
fixed
simple
level
gm
none
```

Every approach and card carries outcome arrays for all four PF2e degrees of success. Dev.4 consumes explicit `chasePoints` consequences and returns all other consequences for the later Consequence Engine.

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

Node types: `start`, `card`, `choice`, `merge`, `end`.

Edge types: `normal`, `branch`, `shortcut`, `conditional`.

Visibility: `public`, `hidden`, `discoverable`.

Graph schema v1 remains a DAG and rejects cycles, invalid references, unreachable nodes, non-end dead ends, and nodes that cannot reach an ending.

## ChaseSession v3

```text
schemaVersion
id
blueprintId
blueprintSnapshot
status
round
activeGroupId
groups[]
roundState
rules
nodeState
unlockedEdgeIds[]
lockedEdgeIds[]
events[]
timestamps
metadata
```

### roundState

```text
phase: idle | active | ended
actedParticipantIds[]
skippedParticipantIds[]
initiativeOrder[]
startedAt
endedAt
```

### session rules

```text
roundLimit: null | integer >= 1
escapeLead: integer >= 1
```

The default escape lead is 3 obstacles.

### runtime group

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
rules
metadata
```

Group rules:

```text
paceMode: roll | steady
obstaclesPerRound: number >= 0
steadyProgress: number >= 0
pendingCheckBonus: null | {
  value,
  type,
  source,
  grantedAtRound
}
```

The position remains `nodeId + progress`, never a flat numeric track.

## nodeState

The data model intentionally leaves node state extensible. Dev.4 records per-runtime-group obstacle clearance under a node so a cleared card can wait for a later route decision without allowing it to be resolved twice.

## Route history invariant

For:

```text
routeHistory = [A, B, C]
edgeHistory  = [AB, BC]
```

edge `AB` must connect A to B and `BC` must connect B to C. Runtime integrity validates this before route mutations.

## ChaseResult

Completion record containing outcome, ending node, winner/loser groups, route summaries, rounds, events, timestamps, and metadata. Dev.4 can now create this directly from a completed rules evaluation.

## ChasePublicState

Dedicated future player-facing transport contract. A raw `ChaseSession` must never be treated as player-safe state.

## ChaseConsequence

Schema v1 reserves:

- `chasePoints`
- `routeUnlock`
- `routeLock`
- `routeSelect`
- `effectForge`
- `narrative`
- `custom`

Dev.4 resolves Chase Point consequences only. General consequence execution comes next.
