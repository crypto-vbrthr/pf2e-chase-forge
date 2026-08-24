# PF2E Chase Forge

**Version:** 0.1.0-dev.2  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. `0.1.0-dev.2` builds on the graph-based core data model from dev.1 and adds the first live extension layer: content registries, transactional add-on packs, pack activation, image providers, compatibility checks, and registration diagnostics.

There is still no chase builder or runner UI in this development build. The goal of dev.2 is to prove that independent Foundry modules can contribute Chase Forge content without importing or patching Chase Forge internals.

## dev.2 scope

Implemented:

- `CardRegistry` for Chase Cards;
- `TemplateRegistry` for quick-start Chase Templates;
- `PackRegistry` for logical add-on content packs;
- `ImageProviderRegistry` for external visual providers;
- globally unique, module-owned resource namespaces;
- automatic namespacing of local add-on ids;
- ownership isolation between external modules;
- atomic single-pack and multi-pack registration;
- same-owner transactional pack replacement;
- per-pack activation with hidden world-state persistence;
- disabled-pack filtering for cards, templates, and image providers;
- prioritized image-provider discovery and candidate collection;
- provider failure isolation;
- extension compatibility checks for API, contract, schema, and named capabilities;
- module-bound extension controllers;
- session-only structured registration diagnostics;
- public read APIs for cards, templates, packs, image providers, and registry statistics;
- synthetic add-on integration tests proving external registration works.

The dev.1 architecture remains intact, including the route DAG, participant-group model, consequence references, and player-safe state contract.

## Deliberately not implemented yet

- PF2e chase rules and roll automation;
- route traversal/session mutation engine;
- blueprint/session persistence;
- GM Chase Runner;
- Player Chase View and socket synchronization;
- Effect Forge execution;
- generator/content library;
- Journal and Campaign Forge integration.

## Public API

At Foundry `init`, Chase Forge exposes:

```js
game.modules.get("pf2e-chase-forge").api
```

External add-ons should register after the ready hook:

```js
Hooks.once("pf2eChaseForge.ready", forge => {
  const extension = forge.extensions.forModule("my-chase-addon", {
    version: "1.0.0",
    requirements: {
      apiVersion: ">=2",
      extensionContractVersion: ">=1",
      schemas: { card: ">=1", template: ">=1", pack: ">=1" },
      capabilities: ["registries.packs", "extensions.transactionalRegistration"]
    }
  });

  extension.assertCompatible();
  extension.registerPack({
    id: "city",
    label: "City Chases",
    cards: [],
    templates: [],
    imageProviders: []
  });
});
```

Local ids are automatically namespaced. The example pack above becomes `my-chase-addon:city`. A module cannot register, replace, or unregister resources owned by another module.

See:

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/REGISTRIES.md`
- `docs/EXTENSION_CONTRACT.md`
- `docs/API.md`

## Testing

```bash
npm test
```

The dev.2 suite includes the complete dev.1 baseline plus registry, ownership, transaction, activation, image-provider, compatibility, diagnostics, and synthetic add-on tests.
