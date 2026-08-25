# GM Chase Runner Contract v1

The GM Runner is the playable GM runtime surface for Chase Forge. Dev.17 adds participant-level race initiative and displays the effective per-group Chase Point requirement.

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

## PF2e rolls

The Runner invokes the existing PF2e statistic/check API. It extracts the final total and natural d20 result from the returned roll and passes those values to `ChaseRulesEngine.resolveCheck()`. The rules engine, not the Runner, determines degree of success and Chase Point changes.

## Consequences

Rules results are handed to the Consequence Engine with GM confirmation disabled by default. Consequences requiring confirmation remain in `ChaseSession.consequenceState.records` and are surfaced in the Runner.

Because consequence records persist ids rather than executable definitions, the Runner reconstructs the originating consequence from the Blueprint card snapshot using `cardId`, `approachId`, `degree`, and `consequenceId` before confirmation.

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
