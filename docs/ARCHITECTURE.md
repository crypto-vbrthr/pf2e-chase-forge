# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.3` adds the first gameplay-state service: a system-neutral Route Graph Engine. PF2e chase rules and UI remain later layers.

```text
External Chase Add-ons
        |
        v
Extension Contract / Registries
        |
        v
+-------------------------------+
| Core Data Model               |
| Blueprint DAG / Session v2    |
+---------------+---------------+
                |
                v
+-------------------------------+
| Route Graph Engine            |
| traversal / branches / merges |
| conditions / unlocks / groups |
+---------------+---------------+
                |
        +-------+-------------------------+
        |                                 |
 Future PF2e Rules Engine          Future Session Sync
        |                                 |
        +----------------+----------------+
                         |
                 Future GM / Player UI
```

## Authority boundary

Route mutations are pure snapshot-in/snapshot-out operations. They return a new normalized session and never mutate the supplied session in place. Later `ChaseSessionManager`/socket code will own persistence and authority.

Players will never receive raw `ChaseSession` data. The future `ChasePublicState` projector remains the security boundary for hidden routes, DCs, GM notes, and undiscovered content.

## Route graph

Blueprint routes remain directed acyclic graphs. A linear chase is simply the smallest useful DAG. Branches, shortcuts, merges, multiple endings, and routes of different lengths use the same structure.

Schema v1 still prohibits cycles.

## Runtime groups

Blueprint participant groups are immutable chase definitions. Runtime groups carry independent positions. This allows quarry and pursuers to take different branches today and reserves the same model for later party splitting.

A merge is spatial/topological, not an automatic group merge.

## Route conditions

Conditions are deliberately system-neutral. The engine evaluates generic values from explicit runtime sources. The future PF2e rules engine can place derived facts into the supplied context instead of contaminating route code with PF2e logic.

## Registries and ownership

The dev.2 registry boundary remains unchanged. External resources are module-owned, namespaced, transactionally registered, and individually activatable. Image providers remain presentation extensions and do not participate in route state.

## Future boundaries retained

- Chase Forge owns chase-state consequences.
- Critical Forge / Effect Forge will own Actor effect application.
- PF2e adapter/rules engine will own checks, DCs, degrees of success, and chase-point logic.
- Session Manager will own persistence, pause/resume, and authoritative mutation.
- Player clients will send intents, not mutate sessions directly.
- Journal and Campaign Forge integration remain optional bridges.
