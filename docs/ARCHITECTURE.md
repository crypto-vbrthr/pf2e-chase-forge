# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.13` adds a centralized Visual System on top of the Core Card and template-driven generator layers while keeping source content separate from editable world snapshots. UI, transport, persistence, route traversal, PF2e rules, consequences, and integrations remain separate layers. The synchronized GM/Player runtime surfaces from dev.9 remain authoritative and are reused for interactive route choices.

```text
External Chase Add-ons
        |
        v
Extension Contract / Registries
        |
        +----> Generator / Templates
        |      seeded card selection
        |      split/merge construction
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
 Visual Chase Builder     GM Chase Runner
        |                     |
        v                     v
 Prepared Blueprint      ChaseSession
                              |
                       Public State Projector
                              |
                       Session Sync / Socket
                              |
                       Player Chase View
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

Managed split/merge graphs are editable through the Branching Builder contract introduced in dev.10. Arbitrary foreign/free-form graphs remain protected from Builder rewriting. Dev.11 generation emits only Basic/Branching Builder-compatible graphs.

## Generator boundary

The Generator reads registered `ChaseTemplate` and `ChaseCard` content through the public registry surfaces. It never mutates registry-owned resources. Selected cards are cloned into Blueprint-local snapshots, and insufficient pools become editable placeholder cards. A supplied seed makes weighted selection deterministic. Generated split/merge structures use the same managed Branching Builder contract as hand-authored routes.


## Engine boundaries

The Route Graph Engine answers where runtime groups may move.

The PF2e Rules Engine resolves DCs, degrees of success, Chase Points, rounds, steady pace, and chase-ending rules.

The Consequence Engine applies deferred route, narrative, and Actor consequences.

The Effect Forge bridge never compiles PF2e Rule Elements itself. Critical Forge owns Effect Definition migration, validation, compilation, and Actor effect application.

## Authority and secrecy

Canonical GM state is stored in the protected persistence vault. Player clients must never receive raw `ChaseSession` or Blueprint GM notes.

`0.1.0-dev.9` drives the Player Chase View exclusively through `ChasePublicState` projections and player intents. The GM is authoritative: player clients never read the protected persistence vault and never mutate `ChaseSession` directly. Module-socket payloads contain player-safe presentation state or player intentions only.

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


## Core Card content layer

The `core:cards` pack is registered through the same registry service used by add-ons. Registered cards are immutable source resources. Builder and Generator workflows copy them into Blueprint content snapshots before editing or runtime use. Localization is resolved lazily at display/copy time, and automatic image mode delegates art resolution to registered image providers.

## dev.13 Visual System

Image resolution is centralized in `scripts/images/image-service.js`. UI layers consume resolved view data and do not independently query providers or mutate automatic previews. Registered image providers remain extension-owned runtime functions, while pinned selections and predefined candidates remain ordinary serializable Blueprint/Card image data. GM Runner and Player View share the same resolver, with optional Chase-level fallback art.
