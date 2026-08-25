# Player Chase View & Session Synchronization

The Player Chase View is the player-facing synchronized runtime UI. Dev.17 projects race initiative state without exposing GM-only Chase data.

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

## Race initiative (dev.17)

For race Sessions the public projection includes only the public participant names, initiative order, acted state, and current participant id needed to explain turn order. Roll actions are projected only for the participant whose initiative turn is current. The authority GM revalidates that order before accepting the action, so a modified player client cannot act early.

## Route choices

Only currently available/discovered routes are projected. Undiscovered `hidden`/`discoverable` edges are absent from the Player View. A route intent is validated against the canonical current group position before it is applied.

## Free-form actions

**Other Action** lets an owning player send a text proposal privately to active GMs. It does not change Session state by itself.

## Reconnect behavior

The authority GM republishes active/paused Sessions after world ready and when a player connects. The GM Runner also exposes **Send Player View** for manual synchronization.
