# PF2E Chase Forge Public API - dev.5

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `5`  
Extension Contract version: `1`

## Capabilities

New dev.5 capabilities:

```text
consequenceEngine
effectForgeBridge
effectForgeAvailable
```

`effectForgeBridge` means the optional integration bridge exists. `effectForgeAvailable` dynamically reports whether a compatible Critical Forge API is currently available.

Persistence, GM Runner, Player View, and Campaign Forge integration remain false.

## Schemas

```text
forge.schemas.session === 4
forge.schemas.consequence === 2
```

Other existing schema versions remain unchanged.

## Consequence Engine

```js
forge.consequences.createOccurrence(consequence, context);
forge.consequences.fromRulesResult(rulesResult);
forge.consequences.plan(session, occurrences, options);
await forge.consequences.execute(session, occurrences, options);
await forge.consequences.executeRulesResult(rulesResult, options);
forge.consequences.records(session, filter);
```

Important execution options include:

```text
autoConfirm
confirmedOccurrenceIds[]
confirmedConsequenceIds[]
routeSelections
skippedOccurrenceIds[]
skipOptional
retryFailed
retryFallback
retryBlocked
retrySkipped
targetsByOccurrence
targetsByConsequence
effectForgeOptions
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

The bridge uses Critical Forge's public API only.

## Rules Engine integration

`resolveCheck()` and `applyDegree()` now return both the historical raw `deferredConsequences` array and stable `consequenceOccurrences` plus `consequenceContext`.

```js
const resolved = forge.rules.resolveCheck(session, request);
const applied = await forge.consequences.executeRulesResult(resolved, {
  confirmedOccurrenceIds: resolved.consequenceOccurrences.map(item => item.occurrenceId)
});
```

## Existing surfaces

The complete dev.1-dev.4 APIs remain available:

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
