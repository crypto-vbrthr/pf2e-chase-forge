# PF2E Chase Forge

**Version:** 0.1.0-dev.5  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular chase framework for Foundry VTT. `0.1.0-dev.5` adds the Consequence Engine and the optional Critical Forge / Effect Forge bridge on top of the graph, registry, and PF2e chase-rules architecture from dev.1-dev.4.

The module still has no Chase Builder or Runner UI. This build completes the headless logic path from a PF2e check result to deferred chase consequences and, when available, real PF2e Actor effects through Critical Forge's public Effect Forge API.

## dev.5 scope

Implemented:

- Chase Consequence schema v2 with:
  - severity (`info`, `minor`, `significant`, `severe`);
  - optional consequences;
  - GM-confirmation policy;
  - route consequences;
  - Effect Forge consequences;
  - participant, runtime-group, and explicit effect targeting;
- Chase Session schema v4 with persistent in-session consequence records;
- stable consequence occurrence ids derived from the originating rules event;
- idempotent consequence execution so repeated socket/UI requests cannot apply the same occurrence twice;
- GM-confirmation state and route-selection state;
- core execution for:
  - route unlock;
  - route lock;
  - route select;
  - narrative consequences;
  - Effect Forge application;
- explicit ownership boundary for Chase Point consequences: the PF2e Chase Rules Engine resolves them and the Consequence Engine records them as rules-handled rather than applying them twice;
- optional Critical Forge / Effect Forge integration through the public API only;
- embedded Effect Definition support;
- existing Effect Item UUID support through `api.effects.readItem()`;
- Effect Definition migration and validation through Critical Forge;
- Actor/Token target resolution from Chase participants;
- manual fallback when Critical Forge is absent and the consequence is not declared required;
- blocked consequence records for consequences that explicitly require Effect Forge;
- serializable evidence of applied Effect Forge effects rather than storing Foundry document instances inside ChaseSession;
- shared Effect Forge editor bridge for future Chase Card editing;
- retry controls for failed, blocked, skipped, or manual-fallback records;
- public Consequence Engine and Effect Forge integration APIs.

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

New dev.5 surfaces:

```text
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
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- blueprint/session persistence as Foundry world storage;
- GM Chase Runner;
- Player Chase View and synchronization;
- generator/content library;
- Journal and Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.5 suite covers the complete dev.1-dev.4 baseline plus consequence occurrence identity, GM confirmation, route consequences, Effect Forge targeting, missing-module fallbacks, required-effect blocking, Effect Item resolution, public API compatibility, editor handoff, and duplicate-application protection.
