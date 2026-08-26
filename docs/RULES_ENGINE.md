# PF2E Chase Rules Engine - Contract v1

The PF2e-specific rules layer consumes validated Chase Cards and a `ChaseSession`, while the Route Graph Engine remains system-neutral. RC.3 completes the final PF2e rules-alignment pass on top of dev.18 dynamic runtime-group routing without changing persisted schemas.

## Responsibilities

The rules engine owns:

- Chase Points;
- round/turn participation state;
- obstacle completion;
- PF2e chase degrees of success;
- fixed/simple/level/GM DC resolution;
- steady versus rolled group pacing;
- separated-character chase handling;
- chase-type victory/escape/catch evaluation;
- ChaseResult creation.

It does not own general consequence execution, Actor mutation, or Effect Forge application. In dev.5, those deferred outcomes are handed to the separate Consequence Engine.

### PF2e Chase check authoring (rc.3)

New manual and Core Library approaches default to PF2e **simple DCs**. The selected simple-DC proficiency rank describes task complexity; it is separate from `minimumProficiency`, which is an optional prerequisite for especially significant obstacles. Fixed, level-based, GM-provided, and no-DC modes remain supported.

Builder-authored checks can use skills, Perception, Fortitude, Reflex, Will, or an attack roll. The PF2e adapter resolves these from Actor statistics/strikes and delegates the actual roll to PF2e rather than recreating roll math.

Against-the-Clock Blueprints expose `settings.victory.roundLimit`; Builder defaults follow the configured short/medium/long chase-length guideline and start validation requires a positive limit for that chase type.

## Chase Points

Default check mapping:

```text
criticalSuccess +2
success         +1
failure          0
criticalFailure -1
```

If a card explicitly supplies one or more `chasePoints` consequences for the resolved degree, those values replace the default point delta for that result.

Progress is clamped to zero. When required points are reached, the obstacle is immediately marked cleared and route advancement begins. Excess points are not carried to the next card.

### Automatic scalable obstacle thresholds (dev.17)

Builder/generator-created scalable obstacles can carry `metadata.chasePointScaling.mode` with either `groupMinus1` or `groupMinus2`. The generator alternates these modes so roughly half the obstacles use each GM Core recommendation, minimum 1 point.

The stored `obstacle.requiredPoints` is a reference value for editing/display. At runtime, `currentObstacle()` and Chase Point resolution calculate the effective requirement from the size of the **rolling runtime group**. This means two differently sized parties can roll against the same card without being forced to share the larger party's threshold. Steady-pace groups do not inflate the Builder/generator reference group size. A GM-entered custom value without scaling metadata remains fixed.

## Dynamic runtime groups (dev.18)

A Blueprint participant group is a stable side/roster definition. A runtime group is only the set of participants currently moving together. Dev.18 allows one Blueprint group to produce multiple runtime groups with independent positions and route histories. A split child records `parentRuntimeGroupId` and split provenance in metadata; no new Session schema version is required because these fields were already supported.

Splitting is permitted at a fresh obstacle, after a cleared obstacle, or on non-card route nodes. It is rejected while an uncleared card has positive Chase Point progress. This prevents reducing an automatically scaled threshold by splitting mid-attempt. Selected-participant transfers between co-located compatible groups use the same protection. Merging is allowed at a shared node and preserves accumulated progress and global round action state. The effective obstacle threshold is recalculated after the merge.

Singleton runtime groups use the separated-character chase rule: one success or critical success clears the current obstacle regardless of its stored Chase Point target. A critical success grants that **participant** a +2 circumstance bonus to their first check against the next obstacle. The pending bonus follows the participant through split, merge, and transfer operations and is injected into the PF2e roll as a typed circumstance modifier when the system API is available, so normal circumstance-bonus stacking remains authoritative.

### Pursuit/escape group order

Within the existing quarry-first side phases, multiple eligible rolling runtime groups are ordered by the GM. Automatic mode sorts first by the longest shortest legal remaining route to an ending, then by fewer already-acted members, smaller group size, and stable runtime-group id. The active group remains active until its current group turn is finished; then the recommendation is recalculated. Manual mode leaves selection to the GM.

### Independent quarry resolution

A split quarry subgroup that is caught or escapes becomes terminal without ending the whole Session while another quarry subgroup remains unresolved. Once every quarry subgroup is terminal, the ordinary `quarryCaught` or `quarryEscaped` outcome is used if all resolved the same way. Mixed caught/escaped results produce `outcome: "custom"` with per-runtime-group resolution details in the ChaseResult metadata.

## Rounds

`ChaseSession` schema v4 contains:

```text
roundState.phase
roundState.actedParticipantIds[]
roundState.skippedParticipantIds[]
roundState.initiativeOrder[]
roundState.startedAt
roundState.endedAt
```

A participant can act once per round. If a rolled participant does not act, `endRound()` can automatically apply the skipped-turn penalty.

A character who has not yet acted remains eligible after another character clears the current obstacle and the group moves to the next card.

## Separated characters

For a runtime group containing one participant:

- success clears the current obstacle;
- critical success clears it and grants a pending `+2` circumstance bonus to the first check against the next obstacle.

The pending bonus is represented explicitly in group rules state. Later Runner code can inject that modifier into the PF2e roll before resolution; `resolveCheck()` can also account for it at the rules layer when it has not already been applied.

## Group pace

Runtime groups have:

```text
rules.paceMode          roll | steady
rules.obstaclesPerRound number >= 0
rules.steadyProgress    number >= 0
```

`steady` defaults to one obstacle per round when configured. Fractional rates allow deliberate slower pacing without inventing a second point system. A value of `0.5` means one obstacle every two rounds.

No group is assumed to be an NPC purely from its role. Blueprint group metadata may mark `npc: true`, `controlledBy: "gm"`, or an explicit pace mode; the later Builder/Runner will expose this choice directly.

## Chase types

### Pursuit

Quarry acts before pursuers. The normal initial helper places the quarry ahead by `settings.startDistance` on the initial unbranched card sequence. Catch is detected when quarry and pursuer occupy the same chase node after relevant movement. Reaching an escape ending produces `quarryEscaped`.

### Escape

The quarry acts first. In addition to an explicit escape ending, a quarry can escape at the start-of-round evaluation when its lead over the nearest pursuer is at least `session.rules.escapeLead`, default 3 obstacles.

### Against the clock

Reaching an ending before the configured `roundLimit` wins. At the end/start boundary of the limit, failure to reach the goal produces `timeExpired`.

### Race

Race order is participant-level initiative-driven. At the beginning of each race round, every participant belonging to a `roll`-pace competitor must appear exactly once in `roundState.initiativeOrder`. The engine rejects out-of-order actions with `INITIATIVE_TURN_BLOCKED`; the next eligible participant is exposed through `getTurnPolicy()` / `getNextRaceParticipantId()`.

Competitor groups using `steady` pace do not enter initiative and advance through the normal steady-pacing step. End-of-round automatic skips are resolved in initiative order. The first competitor group reaching an ending is a winner; the engine can represent multiple simultaneous winners if the supplied state calls for it.

## PF2e DC helpers

Simple DCs:

```text
untrained 10
trained   15
expert    20
master    30
legendary 40
```

Level DCs cover levels 0 through 25. Difficulty adjustments are:

```text
incrediblyEasy -10
veryEasy        -5
easy            -2
standard         0
hard            +2
veryHard        +5
incrediblyHard +10
```

Chase approaches may use `fixed`, `simple`, `level`, `gm`, or `none` DC modes.

## PF2e adapter

`Pf2eChaseAdapter` is intentionally small:

- resolve Actor/Token UUIDs;
- locate an Actor statistic;
- call the statistic's PF2e roll method with a DC and roll options.

It does not reconstruct modifiers or Rule Elements itself.

## Branches after obstacle completion

If a cleared card has multiple available routes, the rules engine leaves the group on the cleared card and reports `routeChoiceRequired: true`. `chooseRoute()` then moves through the selected edge and lets the Route Graph Engine resolve deterministic technical nodes.

## Lead calculation on branches

The escape-lead helper counts encountered card nodes along actual route history, with a shortest-path card count as the baseline for groups initialized partway along a route. Same-node catches always take precedence over numeric branch-distance approximations.

## Consequence handoff (dev.5)

`applyDegree()` and `resolveCheck()` continue to return `deferredConsequences` for compatibility and now also return:

```text
consequenceContext
consequenceOccurrences[]
routeResolutionDeferred
```

Each occurrence is tied to the generated `checkResolved` rules-event id, giving the Consequence Engine a stable idempotency key.

If a cleared obstacle produced a route-affecting consequence (`routeUnlock`, `routeLock`, or `routeSelect`), automatic post-obstacle traversal is deliberately deferred until that consequence is resolved. This prevents the group from leaving a card before a newly discovered shortcut or forced route can affect the choice.
