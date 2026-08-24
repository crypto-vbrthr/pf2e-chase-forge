# PF2E Chase Forge

**Version:** 0.1.0-dev.3  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. `0.1.0-dev.3` turns the route graph from a validated data contract into a live traversal engine. Runtime groups can now move independently through linear routes, branches, shortcuts, merges, conditional routes, and multiple endings.

There is still no chase builder, PF2e chase-roll automation, or runner UI in this development build. dev.3 is intentionally the route-state layer that those later systems will use.

## dev.3 scope

Implemented:

- route-session initialization from a validated `ChaseBlueprint`;
- independent runtime positions for multiple chase groups;
- explicit node and edge route history per runtime group;
- traversal by edge id;
- branch selection without moving unrelated groups;
- merge handling through shared graph nodes;
- public, hidden, and discoverable route visibility semantics;
- explicit route unlock and lock state;
- conditional edges using a small system-neutral condition contract;
- deterministic traversal through non-interactive routing nodes;
- explicit stopping at `choice` nodes so player/GM decisions are never silently skipped;
- route completion detection per group and across all groups;
- runtime integrity validation before state mutation;
- protection against unknown nodes, unknown edges, broken history, invalid participants, and stale route state;
- graph validation for non-end dead ends and branches that cannot reach an ending;
- shortest-distance-to-ending graph analysis;
- new public route API and route capability flags;
- Chase Session schema v2 with explicit `edgeHistory`.

The dev.1 and dev.2 architecture remains intact: route graphs are DAGs, add-on content is registry-owned, image providers remain presentation-only, players will later receive projected public state rather than raw sessions, and integrations remain optional.

## Route condition contract v1

An edge may contain zero or more conditions. Every condition must pass before the edge is traversable.

```js
{
  source: "context",        // context | session | group | nodeState
  path: "weather.clear",
  operator: "equals",      // equals, notEquals, truthy, falsy, includes, gt, gte, lt, lte
  value: true
}
```

`context` is supplied by the caller. Later PF2e and scenario systems can therefore expose chase-specific facts without coupling the Route Graph Engine to PF2e rules.

## Public API

At Foundry `init`:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Route example:

```js
let session = forge.route.initializeSession(blueprint, {
  status: "active"
});

// Move through deterministic Start/Merge routing until the next card or choice.
session = forge.route.resolveDeterministic(
  session,
  "runtime-heroes"
).session;

const choices = forge.route.availableTransitions(
  session,
  "runtime-heroes"
);

session = forge.route.moveGroup(
  session,
  "runtime-heroes",
  choices[0].edge.id
);
```

Discoverable route:

```js
session = forge.route.unlockEdges(session, ["shortcut-roof"]);
```

Route traversal does **not** decide PF2e chase points, success degrees, initiative, or chase victory. That belongs to the planned rules engine.

See:

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/REGISTRIES.md`
- `docs/EXTENSION_CONTRACT.md`
- `docs/API.md`
- `docs/ROUTE_ENGINE.md`

## Deliberately not implemented yet

- PF2e chase rules and roll automation;
- consequence execution / Effect Forge bridge;
- blueprint/session persistence;
- GM Chase Runner;
- Player Chase View and socket synchronization;
- generator/content library;
- Journal and Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.3 suite includes the complete dev.1/dev.2 baseline plus route traversal, independent groups, branching, merges, route locking/unlocking, conditional edges, completion, runtime integrity, and path-length tests.
