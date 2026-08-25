# PF2E Chase Forge

**Version:** 0.1.0-dev.9.1.4  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular Pathfinder 2e chase framework for Foundry VTT. `0.1.0-dev.9.1.4` keeps the synchronized **Player Chase View**, enables Foundry module-socket transport for reliable GM→player delivery, and keeps the Builder command bar visible while scrolling, so players receive a dedicated chase window with images, obstacle text, progress, PF2e roll buttons, route choices, and a free-form action proposal flow while the GM remains authoritative over the persisted Chase Session.

The underlying dev.1-dev.6 architecture remains intact: DAG route graphs, add-on registries, PF2e chase rules, consequence orchestration, optional Critical Forge / Effect Forge integration, and protected restart-safe Blueprint/Session persistence.


## dev.9.1.3 Player socket & sticky toolbar hotfix

Foundry module socket relay is explicitly enabled in the manifest (`"socket": true`). This is required for the GM Runner's **Send Player View** action and automatic Chase state publishing to reach connected player clients. The Builder command toolbar is also sticky inside the bounded ApplicationV2 viewport, so Refresh/Duplicate/Delete/Save/Start stay available while editing long chases.


## dev.9 Player Chase View & Session Synchronization

Active and paused Chase Sessions can now be projected into a dedicated player-safe `ChasePublicState`. The GM client remains authoritative and the canonical `ChaseSession` never leaves protected GM persistence.

The Player Chase View currently provides:

- automatic opening/refresh when the GM publishes an active or paused Session;
- current chase title, round, time of day, and Weather Forge-derived weather label;
- public participant groups and current route position;
- current obstacle image, description, and Chase Point progress;
- PF2e roll buttons only for participants the current user owns;
- no exact DC values, GM notes, future cards, or undiscovered route edges;
- visible route choices once a route is actually available/discovered;
- a free-form **Other Action** proposal sent privately to active GMs;
- personal consequence status summaries;
- automatic refresh after GM/Player actions, pause/resume, route changes, and chase completion.

Player rolls are made on the player client without exposing the hidden DC. The resulting total and natural d20 value are sent as a player intent to one deterministic active GM, which validates ownership and current Session state before applying the PF2e Chase Rules Engine. Route choices follow the same authoritative intent path.

The GM Runner now includes **Send Player View** to republish the current public state manually. Active Sessions are also republished when players connect or when the world reloads.

Public surfaces:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
forge.player.projectState(session, { user });
await forge.sync.publishSession(session); // GM
await forge.sync.sendIntent("route", { sessionId, payload }); // player
await forge.ui.openPlayerView({ sessionId });
```

## dev.8 GM Chase Runner

Starting a prepared Blueprint now creates a persistent Session and immediately opens the GM-only Chase Runner. Open draft/active/paused Sessions are also listed in the Builder sidebar for restart-safe recovery.

The Runner currently provides:

- round begin/end plus pause, resume, and abort controls;
- one panel per runtime group with current route position and pace mode;
- current obstacle image, description, GM notes, Chase Point progress, and exact GM DCs;
- PF2e roll buttons for linked Actors/Tokens;
- manual degree-of-success resolution, automatic +1 contributions, and skipped turns;
- legal route choices plus GM route unlock/lock administration;
- pending consequence confirmation and consequence-driven route selection;
- automatic persistent result creation when a chase ending is reached;
- public Chat obstacle cards and roll summaries.

Chat obstacle cards intentionally omit exact DCs, GM notes, future obstacles, and hidden route information. The dedicated Player Chase View introduced in dev.9 follows the same privacy boundary.

Open a Runner directly:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
await forge.ui.openRunner({ sessionId: "session-id" });
```

Chat presentation is also exposed:

```js
forge.presentation.chat.postObstacle(...);
forge.presentation.chat.postRollResult(...);
forge.presentation.chat.postEvent(...);
```

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

Current API version: `9`.

Important surfaces:

```text
forge.builder
forge.ui
forge.player
forge.sync
forge.presentation.chat
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
- `docs/GM_RUNNER.md`
- `docs/PLAYER_VIEW.md`
- `docs/ROUTE_ENGINE.md`
- `docs/RULES_ENGINE.md`
- `docs/CONSEQUENCE_ENGINE.md`
- `docs/EFFECT_FORGE_INTEGRATION.md`
- `docs/REGISTRIES.md`
- `docs/PERSISTENCE.md`
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- visual branch/merge Route Builder;
- generator and large Core Card library;
- full Image Provider UI;
- Journal embedding;
- Campaign Forge integration.

## Testing

```bash
npm test
```

The dev.9 suite covers the full earlier baseline plus player-safe state projection, player ownership filtering, hidden-DC/hidden-route privacy, Player View UI wiring, deterministic GM authority selection, and module-socket state/intent synchronization.

## Builder layout diagnostics (dev.7.4.1)

This diagnostic build logs the builder's calculated layout after every render at the next animation frame, +100 ms, and +500 ms. The log groups are prefixed with `pf2e-chase-forge | Builder layout diagnostics`.

For a manual snapshot while the builder is open, run:

```js
const chase = game.modules.get("pf2e-chase-forge").api;
chase.ui.debugBuilderLayout();
```

The report contains client/scroll/offset heights and computed flex/overflow values for the ApplicationV2 root, `.window-content`, part wrapper, builder shell, main column, toolbar, editor scroll area, sidebar, and the editor's parent chain.


### Weather Forge compatibility note (dev.7.5.1)
If Weather Forge is active but its own persistent `weatherState` setting is not registered, Chase Forge now degrades safely and reports the provider state as unreadable instead of throwing. The Weather Forge registration issue itself must be corrected by Weather Forge.
