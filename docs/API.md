# PF2E Chase Forge Public API - dev.2

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `2`  
Extension Contract version: `1`

The API is exposed during Foundry `init`. External content modules should register on:

```js
Hooks.once("pf2eChaseForge.ready", forge => { /* register */ });
```

## Capability detection

```js
forge.getCapabilities();
```

dev.2 reports the core data/graph contracts plus implemented registry, extension, transaction, pack-activation, and image-provider capabilities. Rules, persistence, runners, Player View, Effect Forge execution, and Campaign Forge integration remain `false`.

## Data contracts

```js
forge.schemas;
forge.factories;
forge.validation;
forge.graph;
```

Existing dev.1 schema versions remain `1`. dev.2 adds `pack: 1`.

## Content reads

```js
forge.cards.get(id, options);
forge.cards.list(options);
forge.cards.has(id, options);

forge.templates.get(id, options);
forge.templates.list(options);
forge.templates.has(id, options);

forge.packs.get(id);
forge.packs.list(options);
forge.packs.isEnabled(id);
await forge.packs.setEnabled(id, enabled);
```

`setEnabled` is a GM management mutation when running inside Foundry.

## Images

```js
forge.images.providers.get(id, options);
forge.images.providers.list(options);
await forge.images.collectCandidates(context, options);
```

`collectCandidates` isolates provider failures and returns `{ candidates, errors }`.

## Extensions

```js
forge.extensions.environment;
forge.extensions.checkCompatibility(requirements);
forge.extensions.assertCompatible(requirements);
forge.extensions.forModule(moduleId, options);
forge.extensions.diagnostics.list(options);
forge.extensions.diagnostics.clear(options);
```

Third-party modules should prefer a module-bound controller from `forModule()` because it enforces ownership and configured compatibility requirements.

## Registry diagnostics

```js
forge.registries.getStats();
```

Raw mutable registry instances are intentionally not exposed.
