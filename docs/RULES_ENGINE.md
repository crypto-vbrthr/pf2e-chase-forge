# PF2E Chase Rules Engine - Contract v1

`0.1.0-dev.4` adds the PF2e-specific rules layer. It consumes validated Chase Cards and a `ChaseSession`, while the Route Graph Engine remains system-neutral.

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

It does not own general consequence execution, Actor mutation, or Effect Forge application.

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

## Rounds

`ChaseSession` schema v3 contains:

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

Race order is initiative-driven. The first competitor group reaching an ending is a winner. The engine can represent multiple simultaneous winners if the supplied state calls for it.

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
