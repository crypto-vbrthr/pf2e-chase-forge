# PF2E Chase Forge

**Version:** 0.1.0-dev.7.5  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular Pathfinder 2e chase framework for Foundry VTT. `0.1.0-dev.7.5` extends the **Basic Chase Builder** with optional Weather Forge prefill while retaining the graph, rules, consequence, persistence, registry, and Builder architecture introduced in earlier development builds.

The underlying dev.1-dev.6 architecture remains intact: DAG route graphs, add-on registries, PF2e chase rules, consequence orchestration, optional Critical Forge / Effect Forge integration, and protected restart-safe Blueprint/Session persistence.


## dev.7.5 Weather Forge prefill

When **PF2E Weather Forge** is installed and active, a newly created chase automatically adopts the current Weather Forge daypart and weather. Chase Forge talks only to Weather Forge's public API and remains fully functional without it. Existing saved Blueprints are never silently overwritten.

The Builder also shows a **Use current values** button while Weather Forge is available. This lets the GM refresh both fields after world time or weather changes.

Weather is stored as structured Blueprint metadata, including the short display label plus available precipitation, temperature, humidity, cloud density, wind, climate zone, extreme-weather data, provenance, and capture time. If the GM edits the weather text manually, the field becomes a normal manual weather entry.

Weather Forge dayparts map directly to the new canonical Builder choices:

```text
morning
noon
afternoon
evening
night
```

Legacy `dawn`, `day`, and `dusk` choices remain available so older Blueprints continue to round-trip cleanly.

Public integration surface:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
forge.integrations.weatherForge.inspect();
await forge.integrations.weatherForge.readCurrent();
```

## dev.7.3 scroll-layout hotfix

The Builder window now uses the ApplicationV2 window height as the authoritative layout boundary. The toolbar remains fixed inside the Builder while the main editor pane and Blueprint sidebar scroll independently. This avoids the intrinsic-height growth that prevented any scrollbar from appearing in dev.7.1/dev.7.2. The deprecated Scene Control `onClick` handler has also been removed; Foundry v13+ uses `onChange`.

## dev.7 scope

The Basic Chase Builder can:

- create new prepared Chase Blueprints;
- edit name, description, GM notes, chase type, length, party level, difficulty, start distance, and round duration;
- store environment, movement, tone, time-of-day, weather, Action, Humor, and general Blueprint tags;
- configure Blueprint image mode, path, and alternative text;
- maintain separate participant groups with chase roles;
- add Actors/Tokens through drag-and-drop;
- add currently selected Scene tokens to a participant group;
- create manual Chase Cards;
- clone registered add-on Chase Cards into local editable snapshots;
- reorder and remove cards in a linear route;
- edit card description, GM notes, type, Chase Point requirement, tags, and image data;
- define multiple approaches/checks for a card;
- edit skill/statistic, DC mode, fixed value, level offset, difficulty adjustment, proficiency, and hidden-DC state;
- save, reopen, duplicate, and delete prepared chases;
- create and start a persistent Chase Session from the Blueprint;
- load advanced/branched Blueprints without modifying their graph and start them from the Builder.

The Builder stores its edited card occurrences as Blueprint content snapshots. This keeps manual overrides local to the prepared chase and avoids mutating cards registered by add-on modules.

## Opening the Builder

For a GM, Chase Forge adds a **running-person Scene Control button**. The Builder is also available through the public API:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
await forge.ui.openBuilder();
```

Open a specific prepared chase:

```js
await forge.ui.openBuilder({ blueprintId: "blueprint-id" });
```

## Basic Builder API

The pure Builder model is also exposed for integrations and tests:

```js
const draft = forge.builder.createDraft({ name: "Night Chase" });
const result = forge.builder.addManualCard(draft, { name: "Wide Gap" });
const validated = forge.builder.validate(result.blueprint);
```

Key helpers:

```text
forge.builder.createDraft(...)
forge.builder.createManualCard(...)
forge.builder.createApproach(...)
forge.builder.isEditable(...)
forge.builder.listCards(...)
forge.builder.addCard(...)
forge.builder.addManualCard(...)
forge.builder.updateCard(...)
forge.builder.removeCard(...)
forge.builder.moveCard(...)
forge.builder.addApproach(...)
forge.builder.removeApproach(...)
forge.builder.addParticipant(...)
forge.builder.removeParticipant(...)
forge.builder.resetGroupsForType(...)
forge.builder.validate(...)
forge.builder.summary(...)
```

## Linear Builder boundary

`dev.7` deliberately edits only linear route graphs:

```text
Start -> Card -> Card -> Card -> End
```

The core Route Graph Engine already supports branches, shortcuts, merges, conditions, and multiple endings. A Blueprint using those features is recognized as an advanced route. The Basic Builder will not rewrite it. Full visual branching/editing is reserved for the later advanced Route Builder milestone.

## Protected persistence

Canonical GM Blueprint, Session, and Result data remains stored in the ownership-protected internal Chase Forge Journal vault introduced in dev.6. Player clients do not receive this raw state.

Stable references remain:

```text
ChaseBlueprint.<id>
ChaseSession.<id>
ChaseResult.<id>
```

## Consequence and Effect Forge layers

Chase Point resolution belongs to the PF2e Chase Rules Engine. Deferred route, narrative, and Actor consequences are handled by the Consequence Engine.

Critical Forge / Effect Forge remains optional. When present, Chase Forge can apply real PF2e Actor effects through Critical Forge's public Effect API. Without it, optional effect consequences degrade to structured manual fallback rather than breaking the chase.

## Public API

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current API version: `7`.

Important surfaces:

```text
forge.builder
forge.ui
forge.persistence
forge.sessionManager
forge.route
forge.rules
forge.pf2e
forge.consequences
forge.integrations.effectForge
forge.cards
forge.templates
forge.packs
forge.images
forge.extensions
forge.registries
```

See:

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API.md`
- `docs/BASIC_BUILDER.md`
- `docs/ROUTE_ENGINE.md`
- `docs/RULES_ENGINE.md`
- `docs/CONSEQUENCE_ENGINE.md`
- `docs/EFFECT_FORGE_INTEGRATION.md`
- `docs/REGISTRIES.md`
- `docs/PERSISTENCE.md`
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- GM Chase Runner and Chat workflow;
- Player Chase View and session synchronization;
- visual branch/merge Route Builder;
- generator and large Core Card library;
- full Image Provider UI;
- Journal embedding;
- Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.7 suite covers the full dev.1-dev.6 baseline plus Basic Builder graph construction, local card snapshots, card overrides, approach editing, participant handling, group-role resets, public Builder API, Scene Control wiring, UI service lifecycle, localization/template packaging, and existing persistence/rules hardening.

## Builder layout diagnostics (dev.7.4.1)

This diagnostic build logs the builder's calculated layout after every render at the next animation frame, +100 ms, and +500 ms. The log groups are prefixed with `pf2e-chase-forge | Builder layout diagnostics`.

For a manual snapshot while the builder is open, run:

```js
const chase = game.modules.get("pf2e-chase-forge").api;
chase.ui.debugBuilderLayout();
```

The report contains client/scroll/offset heights and computed flex/overflow values for the ApplicationV2 root, `.window-content`, part wrapper, builder shell, main column, toolbar, editor scroll area, sidebar, and the editor's parent chain.
