# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.7.4.2` adds the first GM-facing Basic Chase Builder while keeping UI, persistence, route traversal, PF2e rules, consequences, and integrations as separate layers.

```text
External Chase Add-ons
        |
        v
Extension Contract / Registries
        |
        v
+----------------------------------+
| Core Data Model                  |
| Blueprint DAG / ChaseSession v4  |
+----------------+-----------------+
                 |
        +--------+---------+
        |                  |
        v                  v
 Route Graph Engine   PF2e Rules Engine
 routes / branches    DC / degree / points
        |                  |
        +--------+---------+
                 |
          Consequence Engine
                 |
        +--------+---------+
        |                  |
        v                  v
   Route outcomes     Effect Forge Bridge
                     optional Critical Forge
                 |
         Persistence Service
                 |
         Protected Journal Vault
                 |
        +--------+---------+
        |                  |
        v                  v
 Basic Chase Builder   Future GM Runner
        |                  |
        v                  v
 Prepared Blueprint    Future Player View
```

## Basic Builder boundary

The Basic Builder edits only linear route graphs. It never bypasses the data model or persistence services.

```text
ApplicationV2 UI
      |
      v
Basic Builder Model
      |
      v
ChaseBlueprint v2
      |
      v
BlueprintRepository
```

Registered add-on cards are cloned into Blueprint-local snapshots before editing. The Builder therefore never mutates a registry-owned card.

Advanced route graphs are detected and treated as read/start-only in dev.7. The later advanced Route Builder will own branch/merge editing.

## Engine boundaries

The Route Graph Engine answers where runtime groups may move.

The PF2e Rules Engine resolves DCs, degrees of success, Chase Points, rounds, steady pace, and chase-ending rules.

The Consequence Engine applies deferred route, narrative, and Actor consequences.

The Effect Forge bridge never compiles PF2e Rule Elements itself. Critical Forge owns Effect Definition migration, validation, compilation, and Actor effect application.

## Authority and secrecy

Canonical GM state is stored in the protected persistence vault. Player clients must never receive raw `ChaseSession` or Blueprint GM notes.

The later Player Chase View will be driven by `ChasePublicState` projections and player intents. dev.7 does not add any player-facing transport.

## Protected persistence

```text
BlueprintRepository ─┐
SessionManager ──────┼─> Persistence Service ─> Protected Journal Vault
ResultRepository ────┘
```

Stable references are storage-location independent:

```text
ChaseBlueprint.*
ChaseSession.*
ChaseResult.*
```

## Optional integrations

Critical Forge remains optional and is discovered through its public Effect API. Missing optional effects degrade to manual fallback.

Campaign Forge and Journal embedding remain later milestones.
