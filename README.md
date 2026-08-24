# PF2E Chase Forge

**Version:** 0.1.0-dev.6  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. `0.1.0-dev.6` adds protected Blueprint and Session persistence on top of the graph, registry, PF2e rules, consequence, and Effect Forge foundations from dev.1-dev.5.

The module still has no Chase Builder or Runner UI. This build makes prepared and running chases durable Foundry world data so the next UI blocks can operate on stable, restart-safe state.

## dev.6 scope

Implemented:

- ownership-protected canonical persistence in an internal `JournalEntry` flag;
- no secret Chase data stored in world settings;
- hidden world settings store only the storage schema marker and protected vault id;
- fail-closed handling if a previously established protected vault goes missing;
- Persistence schema v1 with revisioned Blueprint, Session, and Result collections;
- serialized persistence mutations;
- `BlueprintRepository` operations for create, read, update, duplicate, list, and delete;
- stable `ChaseBlueprint.*`, `ChaseSession.*`, and `ChaseResult.*` references;
- Blueprint schema v2 with explicit live-reference vs. frozen-content snapshot policy;
- Chase Card snapshots for add-on-safe prepared chases;
- Rules Engine fallback to frozen card content when an add-on is unavailable;
- reference diagnostics for Actor/Token UUIDs, Chase Cards, snapshot fallback, and image providers;
- JSON Blueprint export/import with explicit transfer versioning and id policies;
- normalization of older Blueprint schemas during import;
- rejection of future unsupported Blueprint schemas;
- persistent Session lifecycle: create, start, pause, resume, save, finish, abort, delete;
- independent sessions from the same Blueprint;
- atomic persistence of completed Session plus `ChaseResult`;
- protected persistence exposed through the public API and `ChaseSessionManager` facade.

## Persistence example

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

const blueprint = await forge.persistence.blueprints.create({
  name: "Night Chase",
  groups: [],
  graph: { /* validated DAG */ }
});

const draft = await forge.persistence.sessions.createFromBlueprint(blueprint.id);
await forge.persistence.sessions.start(draft.id);
```

A second session created from the same Blueprint starts fresh and does not mutate the source Blueprint.

## Protected storage

Canonical GM state lives in an ownership-protected internal `JournalEntry`. Player clients cannot use the persistence API to read this state. The later Player Chase View will be driven by a separate `ChasePublicState` projection, not by exposing raw `ChaseSession` data.

See `docs/PERSISTENCE.md` for the storage contract.

## Consequence flow

A card may attach consequences to a PF2e degree of success. The Rules Engine still resolves Chase Points immediately and emits stable deferred consequence occurrences for everything else.

```js
const resolved = forge.rules.resolveCheck(session, {
  runtimeGroupId: "runtime-heroes",
  participantId: "hero-1",
  approachId: "athletics",
  total: 14,
  natural: 2
});

const consequenceResult = await forge.consequences.executeRulesResult(resolved, {
  confirmedOccurrenceIds: resolved.consequenceOccurrences.map(item => item.occurrenceId)
});

session = consequenceResult.session;
```

GM confirmation is required by default. The future Runner UI will use the same API rather than bypassing it.

## Effect Forge example

An embedded consequence can carry a Critical Forge Effect Definition snapshot:

```js
const consequence = forge.factories.consequence({
  id: "sprained-ankle",
  kind: "effectForge",
  label: "Sprained Ankle",
  severity: "significant",
  source: "embedded",
  targetMode: "participant",
  definition: {
    schemaVersion: 2,
    id: "pf2e-chase-forge.sprained-ankle",
    name: "Sprained Ankle",
    duration: { value: 10, unit: "minutes", expiry: null },
    components: [
      {
        type: "movement",
        movementType: "land",
        value: -5,
        modifierType: "status"
      }
    ],
    application: {},
    metadata: {
      originModule: "pf2e-chase-forge",
      originFeature: "chase-consequence"
    }
  }
});
```

Critical Forge is optional. Without it, a non-required Effect Forge consequence becomes a structured manual fallback and the Chase Session continues normally.

## Public API

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Public persistence surfaces:

```text
forge.persistence.initialize()
forge.persistence.status()
forge.persistence.blueprints.*
forge.persistence.sessions.*
forge.persistence.results.*
forge.persistence.references.*
forge.sessionManager.*

forge.consequences.createOccurrence(...)
forge.consequences.fromRulesResult(...)
forge.consequences.plan(...)
forge.consequences.execute(...)
forge.consequences.executeRulesResult(...)
forge.consequences.records(...)

forge.integrations.effectForge.inspect()
forge.integrations.effectForge.isAvailable()
forge.integrations.effectForge.resolveDefinition(...)
forge.integrations.effectForge.analyze(...)
forge.integrations.effectForge.apply(...)
forge.integrations.effectForge.openEditor(...)
```

Existing route, rules, PF2e, registry, pack, and image-provider APIs remain available.

See:

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API.md`
- `docs/ROUTE_ENGINE.md`
- `docs/RULES_ENGINE.md`
- `docs/CONSEQUENCE_ENGINE.md`
- `docs/EFFECT_FORGE_INTEGRATION.md`
- `docs/REGISTRIES.md`
- `docs/PERSISTENCE.md`
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- GM Chase Runner;
- Player Chase View and synchronization;
- generator/content library;
- Journal and Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.6 suite covers the complete dev.1-dev.5 baseline plus protected Foundry storage, restart recovery, Blueprint CRUD, JSON transfer, content snapshots, reference diagnostics, independent Session instances, and lifecycle persistence.
