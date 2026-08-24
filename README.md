# PF2E Chase Forge

**Version:** 0.1.0-dev.4  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. `0.1.0-dev.4` adds the first PF2e rules layer on top of the graph, registry, and add-on architecture from dev.1-dev.3.

The module still has no Chase Builder or Runner UI. This build is the headless rules engine that later GM and player windows will call.

## dev.4 scope

Implemented:

- PF2e Chase Point resolution:
  - critical success `+2`;
  - success `+1`;
  - failure `0`;
  - critical failure `-1`;
  - progress never below `0`;
- immediate obstacle completion with no Chase Point carry-over;
- unused participants may continue on the next obstacle during the same round;
- skipped/unusable participant turns can apply the rules-defined `-1` Chase Point penalty;
- automatic non-check contributions, normally 1 point and optionally 2 for especially helpful actions;
- separated-character rule: one success advances; critical success also grants a pending `+2` circumstance bonus to the first check against the next obstacle;
- explicit round state with acted/skipped participants;
- quarry-first turn policy for pursuit/escape and initiative policy for races;
- rolled and steady group pace modes;
- steady opposition defaults to one obstacle per round when a group is configured as NPC/steady;
- fractional steady pace such as `0.5` obstacles per round for deliberately slower opposition;
- start-distance helper for the initial linear section of pursuit/escape routes;
- outcome evaluation for:
  - pursuit;
  - escape;
  - against the clock;
  - race;
- same-position catch detection;
- escape endpoints and the standard three-obstacle escape-lead threshold;
- against-the-clock round limits;
- race endpoint winners;
- ChaseResult materialization after completion;
- PF2e simple DC table;
- PF2e level-based DC table for levels 0-25;
- difficulty adjustments `-10/-5/-2/0/+2/+5/+10`;
- fixed, simple, level-based, GM-defined, and no-DC Chase Card approaches;
- PF2e degree-of-success resolution including natural 20/1 shifts;
- a thin PF2e adapter that delegates statistic rolls to the system instead of reproducing PF2e statistic math;
- public rules/DC/degree APIs;
- Chase Session schema v3 with explicit round and rules state.

## Rules API example

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

let session = forge.rules.initializeSession(blueprint, {
  status: "active"
});

session = forge.rules.beginRound(session);

const resolved = forge.rules.resolveCheck(session, {
  runtimeGroupId: "runtime-heroes",
  participantId: "hero-1",
  approachId: "athletics",
  total: 27,
  natural: 15
});

session = resolved.session;
```

Level DC helper:

```js
forge.pf2e.dc.level(10);                 // 27
forge.pf2e.dc.applyAdjustment(27, "hard"); // 29
```

Obstacle guideline for a four-character group:

```js
forge.guidelines.obstaclePoints(4);
// { groupSize: 4, oneLess: 3, twoLess: 2 }
```

## Important boundary

The rules engine resolves Chase Points, rounds, DCs, route advancement, and chase outcomes. It does **not** yet execute general consequences such as damage, conditions, route unlock effects, or Effect Forge definitions. Those are reserved for `0.1.0-dev.5 – Consequence Engine & Effect Forge Integration`.

Likewise, the PF2e adapter is deliberately thin. It locates PF2e statistics and delegates rolls to the system; it does not clone PF2e's modifier stack.

## Public API

At Foundry `init`:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Primary surfaces now include:

```text
forge.route
forge.rules
forge.pf2e.dc
forge.pf2e.degree
forge.pf2e.adapter
forge.guidelines
forge.cards / templates / packs / images
forge.extensions
```

See:

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API.md`
- `docs/ROUTE_ENGINE.md`
- `docs/RULES_ENGINE.md`
- `docs/REGISTRIES.md`
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- general consequence execution / Effect Forge bridge;
- blueprint/session persistence;
- GM Chase Runner;
- Player Chase View and synchronization;
- generator/content library;
- Journal and Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.4 suite covers the full dev.1-dev.3 baseline plus PF2e DC tables, degree-of-success math, Chase Points, round handling, no-carry-over advancement, skipped turns, separated characters, steady pace, branches after cleared obstacles, start distance, chase-type endings, PF2e adapter delegation, API/schema changes, and Foundry initialization.
