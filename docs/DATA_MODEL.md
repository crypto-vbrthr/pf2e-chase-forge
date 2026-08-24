# Core Data Model

All top-level contracts use explicit `schemaVersion` fields.

Current versions:

```text
ChaseCard        1
ChaseTemplate    1
ChaseBlueprint   2
ChaseSession     4
ChaseResult      1
ChasePublicState 1
ChaseConsequence 2
ChasePack        1
PersistenceState 1
```

dev.6 introduced canonical protected world persistence. dev.7 adds a Basic Builder layer without changing any core schema versions. Older Blueprint payloads are normalized to Blueprint schema v2 when imported or loaded through the persistence layer; future unsupported schema versions are rejected.

## ChaseCard

Reusable obstacle, complication, opportunity, or finale content. Approaches can use fixed, simple, level, GM, or no-DC resolution. Every approach and card carries outcome arrays for all four PF2e degrees of success.

The Rules Engine consumes `chasePoints` immediately and emits all other outcomes as stable consequence occurrences.

## ChaseBlueprint

Prepared chase definition containing settings, groups, a DAG route graph, tags, image data, content snapshot policy, metadata, and timestamps.

### contentSnapshots

```text
mode: references | snapshot
cards[]
images[]
effects[]
metadata
```

Snapshot mode freezes currently captured content for repeatable prepared chases. Card snapshots include full normalized `ChaseCard` data and are preferred by the Rules Engine while snapshot mode is active.

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

Dedicated player-facing transport contract used by the synchronized Player Chase View. A raw `ChaseSession` must never be treated as player-safe state.


## PersistenceState v1

Canonical GM world storage contains:

```text
schemaVersion
revision
blueprints[]
sessions[]
results[]
createdAt
updatedAt
metadata
```

The state lives in an ownership-protected internal JournalEntry flag. World settings hold only the storage schema marker and vault document id.

Every Session stores a normalized Blueprint snapshot, so running a prepared chase never mutates its source Blueprint and multiple sessions from one Blueprint remain independent.
