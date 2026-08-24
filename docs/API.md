# PF2E Chase Forge Public API - dev.4

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `4`  
Extension Contract version: `1`

## Capabilities

New dev.4 capabilities:

```text
rulesEngine
chasePoints
roundTracking
chaseTypeOutcomes
steadyPace
separatedParticipantRule
pf2eDcTables
degreeOfSuccess
pf2eAdapter
```

The dev.2 registry and dev.3 route capabilities remain available.

Persistence, GM Runner, Player View, Effect Forge execution, and Campaign Forge integration remain false.

## Schemas

`forge.schemas.session === 3`. Card, Template, Blueprint, Result, PublicState, Consequence, and Pack remain v1.

## Rules engine

```js
forge.rules.initializeSession(blueprint, options);
forge.rules.configureGroupPace(session, runtimeGroupId, options);
forge.rules.beginRound(session, options);
forge.rules.endRound(session, options);
forge.rules.currentObstacle(session, runtimeGroupId);
forge.rules.resolveCheck(session, request);
forge.rules.applyDegree(session, request);
forge.rules.applyAutomaticContribution(session, request);
forge.rules.skipParticipantTurn(session, request);
forge.rules.chooseRoute(session, request);
forge.rules.advanceSteadyGroup(session, runtimeGroupId, options);
forge.rules.pendingCheckBonus(session, runtimeGroupId);
forge.rules.consumePendingCheckBonus(session, runtimeGroupId);
forge.rules.getTurnPolicy(session);
forge.rules.getObstacleIndex(session, runtimeGroupId);
forge.rules.getObstacleLead(session, quarryGroupId, pursuerGroupId);
forge.rules.evaluateOutcome(session, options);
forge.rules.completeSession(session, evaluation);
forge.rules.recommendObstaclePoints(groupSize);
forge.rules.getChaseLengthGuideline(length);
forge.rules.deriveStartPositions(blueprint, options);
```

Mutating calls return new normalized snapshots rather than mutating the supplied session.

## PF2e helpers

```js
forge.pf2e.dc.simple("expert");
forge.pf2e.dc.level(10);
forge.pf2e.dc.adjustment("veryHard");
forge.pf2e.dc.applyAdjustment(27, "hard");
forge.pf2e.dc.resolveApproach(approach, options);
forge.pf2e.dc.tables();

forge.pf2e.degree.resolve({ total, dc, natural });
forge.pf2e.degree.step("success", 1);

forge.pf2e.adapter.resolveActor(uuid);
forge.pf2e.adapter.getStatistic(actor, slug);
forge.pf2e.adapter.rollStatistic(request);
forge.pf2e.createAdapter(options);
```

## Guidelines

```js
forge.guidelines.obstaclePoints(groupSize);
forge.guidelines.chaseLength("short");
forge.guidelines.turnPolicy(session);
forge.guidelines.startPositions(blueprint);
```

## Route traversal

The complete dev.3 route surface is unchanged:

```js
forge.route.initializeSession(...);
forge.route.inspectIntegrity(...);
forge.route.assertIntegrity(...);
forge.route.listTransitions(...);
forge.route.availableTransitions(...);
forge.route.moveGroup(...);
forge.route.advanceGroup(...);
forge.route.resolveDeterministic(...);
forge.route.unlockEdges(...);
forge.route.lockEdges(...);
forge.route.completion(...);
forge.route.groupsAtNode(...);
```

## Content and extensions

```text
forge.cards
forge.templates
forge.packs
forge.images
forge.extensions
forge.registries
```
