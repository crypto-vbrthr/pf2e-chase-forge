# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.17.3` keeps the layered Chase architecture while completing final PF2e rules/runtime hardening. UI, transport, persistence, route traversal, PF2e rules, consequences, Journal integration, Campaign Forge integration, and optional Forge Suite bridges remain separate layers. The synchronized GM/Player runtime surfaces remain authoritative for route choices, race initiative, and group-aware Chase Point requirements. Builder ApplicationV2 renders additionally re-assert editability after runtime lifecycle refreshes so stale DOM `disabled` state cannot leak from a prior read-only render.

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
        +---- Journal Links --+
        |   open / start      |
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

Campaign Forge Integration Contract v2 is implemented as an optional bridge. Campaign Forge stores references/provenance while Chase Forge remains authoritative for Blueprints, Library definitions, Sessions, and Results. Journal Integration likewise uses stable custom references and does not move canonical Chase data into ordinary Journal pages.


## Core Card content layer

The `core:cards` pack is registered through the same registry service used by add-ons. Registered cards are immutable source resources. Builder and Generator workflows copy them into Blueprint content snapshots before editing or runtime use. Localization is resolved lazily at display/copy time, and automatic image mode delegates art resolution to registered image providers.

## dev.13 Visual System

Image resolution is centralized in `scripts/images/image-service.js`. UI layers consume resolved view data and do not independently query providers or mutate automatic previews. Registered image providers remain extension-owned runtime functions, while pinned selections and predefined candidates remain ordinary serializable Blueprint/Card image data. GM Runner and Player View share the same resolver, with optional Chase-level fallback art.


## dev.14 Journal Integration

Journal text uses `@ChaseBlueprint[...]` and `@ChaseLibrary[...]` references. Enrichment resolves them into GM-only open/start controls, while non-GM users see a read-only label. World references resolve through protected persistence; Library references resolve through immutable registries. Starting from a Journal creates the same normal independent `ChaseSession` used by the Builder and therefore reuses the existing GM Runner, public-state projection, socket synchronization, and Player View security boundaries.
