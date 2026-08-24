# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.5` adds consequence orchestration and an optional Effect Forge bridge while retaining the system-neutral Route Graph Engine and the PF2e Chase Rules Engine as separate layers.

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
          Future Session Manager
                 |
        +--------+---------+
        |                  |
    GM Runner        Player View
```

## Engine boundaries

The Route Graph Engine answers where runtime groups may move.

The PF2e Rules Engine resolves DCs, degrees of success, Chase Points, rounds, steady pace, and chase-ending rules.

The Consequence Engine applies the non-point consequences emitted by the Rules Engine and owns confirmation, idempotency, route-consequence execution, and external-effect fallback behavior.

The Effect Forge bridge never compiles PF2e Rule Elements itself. Critical Forge owns Effect Definition migration, validation, compilation, and Actor effect application.

## Authority boundary

All route/rules/consequence mutations remain snapshot-in/snapshot-out. A later `ChaseSessionManager` will make the GM-side session authoritative and persist the snapshots.

Stable consequence occurrence ids are specifically intended to protect the future socket layer from duplicate requests.

Players will never receive raw `ChaseSession` data. `ChasePublicState` remains the security boundary for hidden routes, hidden DCs, GM notes, undiscovered content, and opponent-only state.

## Optional integrations

Critical Forge is optional and discovered at runtime through its public API. Missing optional effects degrade to manual fallbacks. Chase Forge contains no direct imports from Critical Forge.

Campaign Forge and Journal integration remain later milestones.
