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

Optional capabilities such as `checkCompatibility`, the pure embedded `ui.effectEditor.create` surface, and legacy standalone editor helpers are detected independently.

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

Chase Forge prefers Critical Forge's pure embedded editor surface:

```js
const editor = api.ui.effectEditor.create({ definition, onChange });
await editor.mount(containerElement);
const editedDefinition = editor.value;
editor.unmount();
```

The Chase Builder owns the surrounding modal and its **Add Effect to Card** / cancel actions. The resulting Effect Definition is stored directly in the editable card snapshot, so no Foundry Item is created. This follows the Effect Editor contract: the editor edits a definition while the host owns persistence.

`forge.integrations.effectForge.openEditor(reference, { onSave })` remains the Chase-facing bridge. Legacy standalone editor helpers are retained only as compatibility fallbacks for older Critical Forge versions. Read-only Library cards expose consequence details but are not mutated in place.

## Presentation modes (1.0.10)

The world setting `effectConsequencePresentation` controls only how `effectForge` occurrences are offered to the GM. It does not rewrite the stored card definition. Supported modes are:

- `runner`: hold the occurrence for confirmation and show **Apply** directly beside the affected participant in the GM Runner;
- `dialog`: open a modal GM confirmation;
- `chatGm`: post an actionable blind/GM Chat card;
- `chatPublic`: post a public Chat card whose apply control is functional only for a GM;
- `automatic`: force the occurrence to require no confirmation and apply immediately.

Non-Effect-Forge consequence kinds retain their own normal confirmation rules.
