# Chase Forge Registries

## Overview

`0.1.0-dev.2` introduced the content registry architecture. Dev.10.1 adds a fifth content surface for complete prepared chases:

- Card Registry
- Template Registry
- **Chase Library Blueprint Registry**
- Pack Registry
- Image Provider Registry

Registries are internal implementation details. External modules should use the public API and bound extension controllers rather than importing registry classes.

## Public reads

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

forge.cards.list();
forge.cards.get("my-addon:card-id");

forge.templates.list();
forge.templates.get("my-addon:template-id");

forge.library.list();
forge.library.get("my-addon:prepared-chase");

forge.packs.list();
forge.packs.get("my-addon:pack-id");
forge.packs.isEnabled("my-addon:pack-id");

forge.images.providers.list();
await forge.images.collectCandidates(context);

forge.registries.getStats();
```

Normal content reads exclude disabled packs. Management code can opt into disabled resources:

```js
forge.cards.list({ includeDisabled: true });
forge.templates.list({ includeDisabled: true });
forge.library.list({ includeDisabled: true });
forge.images.providers.list({ includeDisabled: true });
```

## Pack record

A registered pack exposes metadata and resource ids rather than duplicate copies of all content:

```js
{
  schemaVersion: 1,
  id: "my-addon:city",
  label: "City Chases",
  description: "...",
  version: "1.0.0",
  priority: 0,
  enabledByDefault: true,
  enabled: true,
  sourceModule: "my-addon",
  cardIds: [],
  templateIds: [],
  blueprintIds: [],
  imageProviderIds: [],
  metadata: {}
}
```

Cards, templates, and Library Blueprints receive authoritative source metadata during registration:

```js
card.source = {
  moduleId: "my-addon",
  packId: "my-addon:city",
  version: "1.0.0"
};
```

Caller-supplied source ownership is not trusted.

## Activation

Changing activation is a management mutation:

```js
await forge.packs.setEnabled("my-addon:city", false);
```

In Foundry, activation is stored in the hidden world setting `pf2e-chase-forge.contentPackStates`. A later GUI will expose this safely to the GM.

## Image candidates

Image providers can be queried together:

```js
const result = await forge.images.collectCandidates({
  tags: ["city", "rooftop"],
  timeOfDay: "night"
});
```

Result:

```js
{
  candidates: [
    {
      id: "...",
      path: "modules/.../roof.webp",
      providerId: "my-addon:urban-images",
      alt: "",
      tags: ["city", "rooftop"],
      weight: 1,
      metadata: {}
    }
  ],
  errors: []
}
```

Specific providers may be requested with `providerIds`.


## Prepared Chase libraries

A pack can register complete `ChaseBlueprint` definitions in `blueprints`. Chase Forge namespaces them to the owning module, stamps authoritative source metadata, and marks `metadata.library.readOnly = true`. They follow the same pack activation and transactional rollback rules as cards/templates.

Library Blueprints are source content, not world persistence records. The GM Builder may preview/start them, but source definitions are never edited. Copying one into **My Chases** creates a new world-owned Blueprint; starting one directly creates a Session from a snapshot.


## Built-in Core Card pack

`0.1.0-dev.12` registers `core:cards` as a normal Chase Pack owned by `pf2e-chase-forge`. It contains 72 cards and can be inspected/disabled through the same pack APIs as third-party content. No special mutation path exists for Core Cards; world use always happens through copied Blueprint snapshots.
