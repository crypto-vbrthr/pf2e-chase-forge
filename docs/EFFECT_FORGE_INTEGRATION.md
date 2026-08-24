# Critical Forge / Effect Forge Integration

Critical Forge is an optional integration. Chase Forge does not import Critical Forge source files and does not require the module in its Foundry manifest.

## Public API boundary

The bridge resolves:

```js
const api = game.modules.get("pf2e-critical-forge")?.api;
```

A compatible API must provide:

```text
api.effects.migrate
api.effects.analyze
api.effects.apply
api.effects.readItem
```

Optional capabilities such as `checkCompatibility` and `ui.openEffectForgeDefinition` are detected independently.

## Embedded definitions

A Chase consequence may store a complete Effect Definition snapshot. Before application, the bridge asks Critical Forge to migrate the definition to the installed schema and analyzes it through the Effect Forge validation engine.

## Item references

A consequence may instead store a Foundry Item UUID. The bridge resolves the Item and reconstructs the Effect Definition through `api.effects.readItem()`. Unmanaged Rule Elements returned by Critical Forge are preserved when applying the effect.

## Application

The bridge delegates effect application to:

```js
await api.effects.apply(definition, targets, options);
```

Chase Forge persists only a compact summary:

```text
definitionId / definitionName
source / sourceItemUuid
targetUuids[]
createdItemUuids[]
compatibility summary
migration summary
```

## Targeting

`participant` targets the participant whose check produced the consequence.

`runtimeGroup` targets every Chase participant in that runtime group that has a resolvable Foundry UUID.

`explicit` uses stored participant ids and/or explicit UUIDs, unless the host supplies runtime target overrides.

## Missing Critical Forge

A non-required consequence becomes `manualFallback` and does not stop the Chase Session.

A consequence with `required: true` becomes `blocked`. The rest of the Chase Session remains valid and can continue.

## Shared editor

When available, Chase Forge exposes the Critical Forge editor through:

```js
await forge.integrations.effectForge.openEditor(reference);
```

Future Chase Card editing should use this bridge rather than implementing a second effect editor.
