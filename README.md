# PF2E Chase Forge

**Version:** 0.1.0-dev.1  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. This development build establishes the architecture and core data model only. It does not yet provide the chase builder, GM runner, player view, PF2e roll automation, persistence, generator, or add-on registries.

## dev.1 scope

Implemented:

- versioned core schemas for cards, templates, blueprints, sessions, results, public player state, and consequences;
- a directed acyclic route graph supporting linear routes, branches, shortcuts, merges, and multiple endings;
- participant and participant-group contracts designed for later party splitting;
- consequence references, including reserved Effect Forge integration payloads;
- image metadata contracts for image-free, manual, predefined, provider, and automatic presentation;
- normalizers/factories for deterministic data shape;
- structural validation with errors and non-fatal authoring warnings;
- graph cycle detection, reachability analysis, indexing, and topological sorting;
- a read-only public API surface exposing the dev.1 contracts;
- automated Node tests.

## Deliberately not implemented yet

- card/template/add-on registries;
- chase rules and PF2e rolls;
- state persistence;
- GM or player UI;
- socket synchronization;
- Effect Forge execution;
- Journal and Campaign Forge integration.

These are represented only where the dev.1 data contracts need to reserve clean integration boundaries.

## Testing

```bash
npm test
```

## Public API

At Foundry `init`, the module exposes:

```js
game.modules.get("pf2e-chase-forge").api
```

The dev.1 API contains factories, validators, graph inspection helpers, schema versions, and capability flags. It intentionally does not expose mutable registries yet.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for the frozen dev.1 baseline.
