# Player Chase View & Session Synchronization

`0.1.0-dev.9` adds the first player-facing Chase Forge runtime UI.

## Security boundary

Canonical `ChaseSession`, Blueprint GM notes, hidden DCs, undiscovered routes, and future cards remain GM-side. The Player View receives only a normalized `ChasePublicState`.

```text
Protected ChaseSession (GM)
        |
        v
Public State Projector
        |
        v
module.pf2e-chase-forge socket
        |
        v
Player Chase View
```

Player clients send intentions in the opposite direction:

```text
roll / route / propose / refresh intent
        |
        v
Deterministic active GM
        |
 ownership + rules validation
        |
        v
Rules / Consequences / Persistence
        |
        v
new player-safe state
```

## Player rolls

A Player View roll button calls the normal PF2e Actor statistic on the player client without supplying the hidden DC. The GM receives only the selected Session/group/participant/approach IDs plus the resulting total and natural d20 value. The GM reloads the canonical Session, resolves the actual DC, and applies Chase Point and consequence logic.

## Route choices

Only currently available/discovered routes are projected. Undiscovered `hidden`/`discoverable` edges are absent from the Player View. A route intent is validated against the canonical current group position before it is applied.

## Free-form actions

**Other Action** lets an owning player send a text proposal privately to active GMs. It does not change Session state by itself.

## Reconnect behavior

The authority GM republishes active/paused Sessions after world ready and when a player connects. The GM Runner also exposes **Send Player View** for manual synchronization.
