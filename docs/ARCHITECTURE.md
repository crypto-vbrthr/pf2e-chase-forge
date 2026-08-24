# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.4` adds a PF2e Chase Rules Engine while retaining the system-neutral Route Graph Engine and extension registries beneath it.

```text
External Chase Add-ons
        |
        v
Extension Contract / Registries
        |
        v
+----------------------------------+
| Core Data Model                  |
| Blueprint DAG / ChaseSession v3  |
+----------------+-----------------+
                 |
        +--------+---------+
        |                  |
        v                  v
 Route Graph Engine   PF2e Rules Layer
 system-neutral       DC / degree / points
 routes / branches    rounds / endings
        |                  |
        +--------+---------+
                 |
          Future Session Manager
                 |
        +--------+---------+
        |                  |
    GM Runner        Player View
```

## Engine boundary

The Route Graph Engine answers where a runtime group can move. It does not know PF2e Chase Points, DCs, or victory rules.

The Chase Rules Engine answers whether an obstacle is cleared, who has acted, how many Chase Points are gained/lost, whether steady opposition moves, and whether the chase has ended. It calls the Route Graph Engine for actual route movement.

This split is intentional so add-on route logic and future non-PF2e content services do not become entangled with PF2e roll math.

## PF2e integration boundary

The PF2e adapter delegates statistic rolls to PF2e. It does not duplicate the system's modifier pipeline. The rules engine can resolve an already-known total/degree independently, which keeps it testable and lets the future Runner remain responsible for Foundry UI, roll messages, targeting, and secrecy.

## Session v3

Session v3 adds two explicit runtime structures:

```text
roundState
rules
```

Every runtime group also gains a `rules` state for pace and pending next-check bonuses. These are runtime-only semantics; Blueprint schema remains v1.

## Authority boundary

All current route/rules mutations are snapshot-in/snapshot-out. The supplied session is not mutated. A later `ChaseSessionManager` will make the GM-side session authoritative and persist these snapshots.

Players will never receive raw `ChaseSession` data. `ChasePublicState` remains the planned projection/security boundary for hidden routes, hidden DCs, GM notes, undiscovered content, and opponent-only state.

## Consequence boundary

Dev.4 only consumes `chasePoints` consequences as part of result resolution. Other outcome consequences are returned as deferred data.

`0.1.0-dev.5` will add consequence orchestration and the optional Critical Forge / Effect Forge bridge. Chase Forge will decide why a consequence occurs; Effect Forge will own Actor-effect materialization/application.

## Registries and ownership

The dev.2 ownership model remains unchanged. Add-on cards can immediately participate in dev.4 rules resolution because the Rules Engine resolves node `cardRef` values through the existing Card Registry.
