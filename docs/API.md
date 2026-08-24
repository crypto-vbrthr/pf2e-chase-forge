# PF2E Chase Forge Public API - dev.6

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `6`  
Extension Contract version: `1`

## Capabilities

New dev.6 capabilities:

```text
persistence
protectedPersistence
blueprintJsonTransfer
contentSnapshots
sessionLifecycle
```

`protectedPersistence` is true in Foundry when the API is backed by the ownership-protected Journal vault. Pure test/memory stores advertise persistence without claiming that protection boundary.

GM Runner, Player View, and Campaign Forge integration remain false.

## Schemas

```text
forge.schemas.blueprint === 2
forge.schemas.session === 4
forge.schemas.consequence === 2
forge.schemas.persistence === 1
```

## Persistence

```js
await forge.persistence.initialize();
forge.persistence.status();
```

### Blueprints

```js
await forge.persistence.blueprints.list();
await forge.persistence.blueprints.get(idOrReference);
await forge.persistence.blueprints.create(data, options);
await forge.persistence.blueprints.save(blueprint);
await forge.persistence.blueprints.duplicate(id, options);
await forge.persistence.blueprints.delete(id);
await forge.persistence.blueprints.freezeContent(id);
await forge.persistence.blueprints.useLiveContent(id, options);
await forge.persistence.blueprints.inspectReferences(idOrBlueprint, options);
const json = await forge.persistence.blueprints.exportJson(idOrBlueprint);
await forge.persistence.blueprints.importJson(json, { idPolicy: "new" });
forge.persistence.blueprints.reference(id);
```

### Sessions

```js
await forge.persistence.sessions.list(options);
await forge.persistence.sessions.get(idOrReference);
await forge.persistence.sessions.createFromBlueprint(blueprintId, options);
await forge.persistence.sessions.save(session);
await forge.persistence.sessions.start(id);
await forge.persistence.sessions.pause(id);
await forge.persistence.sessions.resume(id);
await forge.persistence.sessions.finish(id, endingEvaluation);
await forge.persistence.sessions.abort(id);
await forge.persistence.sessions.delete(id);
forge.persistence.sessions.reference(id);
```

### Results

```js
await forge.persistence.results.list(options);
await forge.persistence.results.get(idOrReference);
forge.persistence.results.reference(id);
```

### Stable references

```js
forge.persistence.references.create("blueprint", id);
forge.persistence.references.parse("ChaseBlueprint.some-id");
```

Reference formats:

```text
ChaseBlueprint.<id>
ChaseSession.<id>
ChaseResult.<id>
```

## ChaseSessionManager facade

The higher-level facade mirrors common session lifecycle operations:

```js
forge.sessionManager.createSession(...);
forge.sessionManager.startSession(...);
forge.sessionManager.pauseSession(...);
forge.sessionManager.resumeSession(...);
forge.sessionManager.saveSession(...);
forge.sessionManager.finishSession(...);
forge.sessionManager.abortSession(...);
forge.sessionManager.getSession(...);
forge.sessionManager.listSessions(...);
forge.sessionManager.getActiveSessions();
```

## Consequence Engine

The dev.5 consequence surfaces remain unchanged:

```js
forge.consequences.createOccurrence(consequence, context);
forge.consequences.fromRulesResult(rulesResult);
forge.consequences.plan(session, occurrences, options);
await forge.consequences.execute(session, occurrences, options);
await forge.consequences.executeRulesResult(rulesResult, options);
forge.consequences.records(session, filter);
```

## Effect Forge bridge

```js
forge.integrations.effectForge.inspect();
forge.integrations.effectForge.isAvailable();
await forge.integrations.effectForge.resolveDefinition(reference);
await forge.integrations.effectForge.analyze(reference, options);
await forge.integrations.effectForge.apply(reference, targets, options);
await forge.integrations.effectForge.openEditor(reference);
```

## Existing surfaces

```text
forge.route
forge.rules
forge.pf2e
forge.guidelines
forge.routeConditions
forge.cards
forge.templates
forge.packs
forge.images
forge.extensions
forge.registries
```
