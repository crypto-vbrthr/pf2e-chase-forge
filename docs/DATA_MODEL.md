# Core Data Model

All top-level contracts use explicit `schemaVersion` fields.

Current versions:

```text
ChaseCard        1
ChaseTemplate    1
ChaseBlueprint   1
ChaseSession     4
ChaseResult      1
ChasePublicState 1
ChaseConsequence 2
ChasePack        1
```

World persistence has not been introduced yet, so the development-only Session/Consequence schema changes do not require a world migration.

## ChaseCard

Reusable obstacle, complication, opportunity, or finale content. Approaches can use fixed, simple, level, GM, or no-DC resolution. Every approach and card carries outcome arrays for all four PF2e degrees of success.

The Rules Engine consumes `chasePoints` immediately and emits all other outcomes as stable consequence occurrences.

## ChaseBlueprint

Prepared chase definition containing settings, groups, a DAG route graph, tags, image data, metadata, and timestamps.

## Route graph

```text
graph.nodes[]
graph.edges[]
graph.startNodeId
graph.endNodeIds[]
```

Node types: `start`, `card`, `choice`, `merge`, `end`.

Edge types: `normal`, `branch`, `shortcut`, `conditional`.

Graph schema v1 remains a DAG and rejects cycles, invalid references, unreachable nodes, non-end dead ends, and nodes that cannot reach an ending.

## ChaseSession v4

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
consequenceState
events[]
timestamps
metadata
```

### consequenceState

```text
records[]
```

Each record is serializable and contains occurrence identity, status, source context, target UUIDs, compact results, and timestamps. Foundry document instances are never stored.

## ChaseConsequence v2

```text
schemaVersion
id
kind
label
severity
optional
gmConfirmation
payload
```

Severity:

```text
info
minor
significant
severe
```

Kinds:

```text
chasePoints
routeUnlock
routeLock
routeSelect
effectForge
narrative
custom
```

### Effect Forge payload

```text
source: embedded | item
required: boolean
targetMode: participant | runtimeGroup | explicit
targetParticipantIds[]
targetUuids[]
definition | uuid
```

The Effect Forge schema version is owned by Critical Forge, not by Chase Forge.

## ChaseResult

Completion record containing outcome, ending node, winner/loser groups, route summaries, rounds, events, timestamps, and metadata.

## ChasePublicState

Dedicated future player-facing transport contract. A raw `ChaseSession` must never be treated as player-safe state.
