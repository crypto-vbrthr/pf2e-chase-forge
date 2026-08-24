# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.1` establishes data contracts and structural invariants. It intentionally does not implement gameplay services or UI.

The architecture is layered so that later systems do not own each other's responsibilities:

```text
External Add-ons                    Future Integrations
      |                                    |
      v                                    v
Registries (dev.2)                 Effect / Journal / Campaign bridges
      |                                    |
      +----------------+-------------------+
                       |
                 Public Chase API
                       |
       +---------------+----------------+
       |               |                |
   Generator        Services         Projections
   (later)          (later)           (later)
                       |
          +------------+------------+
          |            |            |
      Route Engine  Rules Engine  Session Manager
       (dev.3)       (dev.4)       (later)
          |            |            |
          +------------+------------+
                       |
                Core Data Model
                    (dev.1)
```

## Ownership rules

- `ChaseCard` describes reusable content. It never stores runtime chase progress.
- `ChaseTemplate` describes generator defaults. It is not a running chase.
- `ChaseBlueprint` is a prepared, linkable chase definition.
- `ChaseSession` is mutable runtime state created from a blueprint or generated setup.
- `ChaseResult` is immutable-style completion data for journals and future Campaign Forge integration.
- `ChasePublicState` is the future player-view transport contract. It must be built by a projector and must never be assumed safe merely because a `ChaseSession` was normalized.

## Route model

Routes are modeled as a directed acyclic graph (DAG), never as a flat card list. A linear chase is the simplest graph:

```text
Start -> A -> B -> C -> End
```

Branches and merges are native:

```text
             -> Roof A -> Roof B -\
Start -> Choice                    -> Merge -> End
             -> Alley A -> Alley B /
```

Multiple endings are valid. Cycles are invalid in schema v1.

This model reserves support for:

- explicit player route choices;
- hidden or discoverable shortcuts;
- conditional edges;
- groups taking different routes;
- party splitting and later merging;
- route history in session/result data.

## Authority and player safety

The future GM/session owner is authoritative for mutations. Player clients will submit intents, not direct state changes.

`ChasePublicState` exists as a separate contract so the player view can later receive only deliberately projected data. The full session may contain secret DCs, hidden edges, future cards, GM notes, and unrevealed consequences and must never be sent wholesale to players.

No public-state projector or socket layer is implemented in dev.1.

## Consequences and Effect Forge

Chase-specific consequences are represented by `ChaseConsequence`:

- chase point changes;
- route unlock/lock/select operations;
- narrative results;
- Effect Forge references;
- future custom providers.

Chase Forge will own chase-state consequences. It will not reimplement the Critical Forge Effect Engine.

An `effectForge` consequence may store either:

- an embedded Effect Definition; or
- a UUID reference to an Effect Item.

The runtime bridge to Critical Forge is deliberately deferred. dev.1 only defines and validates the reference contract.

## Images

Images are presentation data and never part of rules resolution. The image model reserves these modes:

- none;
- manual;
- predefined;
- provider;
- automatic.

Future image providers can therefore be added without changing route or rules state.

## Persistence boundary

Persistence is deliberately absent from dev.1. The later repository/session manager may choose Foundry Documents/flags/compendia, but it must preserve these contracts and schema versions.

## Public API policy

External modules must eventually use `game.modules.get("pf2e-chase-forge").api` instead of importing internal implementation files.

In dev.1 only factories, validators, graph inspection helpers, schema versions, and capability flags are exposed. Registries arrive in dev.2.
