# PF2E Chase Forge Public API - dev.3

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `3`  
Extension Contract version: `1`

## Capabilities

`forge.getCapabilities()` now reports these route capabilities as implemented:

```text
routeGraphEngine
deterministicRouteResolution
routeConditions
multiGroupRouting
```

PF2e rules, persistence, runners, Player View, Effect Forge execution, and Campaign Forge integration remain false.

## Schemas

`forge.schemas.session === 2`; other dev.1 schemas remain v1 and ChasePack remains v1.

## Graph analysis

```js
forge.graph.index(graph);
forge.graph.reachable(graph);
forge.graph.findCycle(graph);
forge.graph.topologicalSort(graph);
forge.graph.reachingEnds(graph);
forge.graph.shortestDistancesToEnds(graph);
```

## Route traversal

```js
forge.route.initializeSession(blueprint, options);
forge.route.inspectIntegrity(session);
forge.route.assertIntegrity(session);
forge.route.listTransitions(session, runtimeGroupId, options);
forge.route.availableTransitions(session, runtimeGroupId, options);
forge.route.moveGroup(session, runtimeGroupId, edgeId, options);
forge.route.advanceGroup(session, runtimeGroupId, options);
forge.route.resolveDeterministic(session, runtimeGroupId, options);
forge.route.unlockEdges(session, edgeIds);
forge.route.lockEdges(session, edgeIds);
forge.route.completion(session);
forge.route.groupsAtNode(session, nodeId);
```

Every mutation returns a new normalized session snapshot.

## Route conditions

```js
forge.routeConditions.evaluate(condition, runtime);
forge.routeConditions.evaluateAll(conditions, runtime);
```

Malformed or unknown conditions fail closed.

## Content and extensions

The dev.2 APIs remain available without breaking changes:

```text
forge.cards
forge.templates
forge.packs
forge.images
forge.extensions
forge.registries
```

Extension compatibility can now require:

```text
routing.traversal
routing.conditions
routing.multiGroup
```
