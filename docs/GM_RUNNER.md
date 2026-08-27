# GM Chase Runner Contract v1

The GM Runner is the playable GM runtime surface for Chase Forge. Dev.18 adds dynamic runtime groups, group-order control, and a compact full-route monitor while retaining dev.17 participant-level race initiative and effective per-group Chase Point requirements.

## Scope

The Runner is GM-only and operates on persisted `ChaseSession` records. It does not create a second runtime state. Every rules mutation is written back through the existing persistence service.

The Runner supports:

- begin/end round,
- pause/resume/abort,
- current obstacle and Chase Point progress,
- participant acted/skipped state,
- PF2e statistic rolls through `Pf2eChaseAdapter`,
- manual degree-of-success application,
- automatic +1 contribution and skipped turns,
- steady-pace resolution through end-of-round processing,
- route decisions once a route is legally available,
- pending consequence confirmation and route selection,
- immediate outcome checks and persistent `ChaseResult` creation,
- public obstacle and result Chat messages.

## Authority

`ChaseSession` remains the canonical authority. The GM Runner never stores independent rules state. It reloads the persisted session before every action and persists each result after resolution.

## Race initiative (dev.17)

For `race` chases, the Runner displays an initiative field for every participant in a `roll`-pace competitor group before each round begins. The submitted values are sorted into `roundState.initiativeOrder`; only the current participant can resolve a roll, automatic contribution, or skipped turn. Steady-pace competitors are not entered into initiative and advance through the normal steady-pacing step.

The rules engine remains authoritative: the Runner UI can hide/disable an action, but an out-of-order request is independently rejected by the rules layer.

## Advanced runtime groups (dev.18)

In pursuit and escape Sessions, runtime groups on the same Blueprint side can split and later reunite. A subgroup keeps its own node, route history, Chase Point progress, and participant membership. The GM can split selected participants at a fresh obstacle or between obstacles, merge compatible co-located groups, and move selected participants between co-located groups before partial obstacle progress begins. Global `roundState.actedParticipantIds` is never reset by these operations.

The Runner exposes **Automatic** and **Manual** runtime-group order. Automatic mode recommends the eligible group with the longest shortest legal remaining route to an ending so lagging groups get the first opportunity to catch up. The GM can click another eligible group to override the recommendation for that group's turn. The recommendation is recalculated whenever the active group finishes, moves, splits, merges, or changes phase. Quarry-first side order remains authoritative. Race Sessions continue to use initiative and do not use runtime-group ordering.

## Full-route monitor (dev.18)

A compact side panel renders the complete route graph with obstacle names and runtime-group markers. It highlights the active and recommended groups, shows shortest remaining card distance to an ending, and reports graph distance from the selected group to other runtime groups. Branches at the same graph depth are shown side by side. Locked and undiscovered routes are excluded from automatic distance recommendations. The route monitor is GM-only.

## PF2e rolls

The Runner invokes the existing PF2e statistic/check API. It extracts the final total and natural d20 result from the returned roll and passes those values to `ChaseRulesEngine.resolveCheck()`. The rules engine, not the Runner, determines degree of success and Chase Point changes.

## Consequences

Rules results are handed to the Consequence Engine using the configured Effect Forge presentation mode. In the default `runner` mode, an Effect Forge occurrence is deliberately held as `pendingConfirmation` and rendered directly beneath the affected participant with an **Apply** action. This keeps a critical-failure consequence visible even when the general consequence section is outside the current scroll position.

Alternative world modes open a modal confirmation, post an actionable blind-GM or public Chat card, or apply Effect Forge consequences automatically. The presentation layer changes confirmation behavior only for `effectForge` occurrences; other consequence kinds keep their own normal rules.

Because consequence records persist ids rather than executable definitions, the Runner and Chat workflow reconstruct the originating consequence from the Blueprint card snapshot using `cardId`, `approachId`, `degree`, and `consequenceId` before confirmation.

## Chat boundary

The Chat presenter deliberately publishes only player-safe obstacle data:

- card name and description,
- selected image,
- visible approach labels/descriptions,
- round and Chase Point progress.

It does not include GM notes, exact DC values, hidden route data, or future obstacles.

## API

```js
forge.ui.openRunner({ sessionId });
forge.ui.closeRunner(sessionId);
forge.ui.getOpenRunner(sessionId);
forge.ui.getOpenRunners();
forge.presentation.chat.postObstacle(...);
forge.presentation.chat.postRollResult(...);
forge.presentation.chat.postEvent(...);
```

The Builder automatically opens the Runner after starting a Blueprint. Open draft/active/paused Sessions are also listed in the Builder sidebar for restart/recovery workflows.
