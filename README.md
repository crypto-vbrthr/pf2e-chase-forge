# PF2E Chase Forge

**Version:** 0.1.0-dev.16.7  
**Foundry VTT:** 14  
**System:** Pathfinder 2e

PF2E Chase Forge is a modular Pathfinder 2e chase framework for Foundry VTT. `0.1.0-dev.16.7` builds on the Campaign Forge runtime workflow so linked chases remain traceable across start, completion, abort, relinking, and missing-target cases without transferring ownership of Chase data.

The underlying architecture remains intact: DAG route graphs, synchronized GM/Player runtime views, add-on registries, template-based generation, the 72-card Core Library, the shared Visual System, PF2e chase rules, consequence orchestration, optional Critical Forge / Effect Forge integration, Weather Forge prefill, and protected restart-safe Blueprint/Session persistence.


## dev.16 Campaign Forge Runtime & Lifecycle Hardening

Campaign-started chases now expose a live `getLatestRun()` summary in addition to completed `ChaseResult` lookup. The run summary can distinguish active, paused, completed, and aborted attempts and is filtered by Campaign entry and external-link provenance, preventing an old result from a removed/recreated link from masquerading as the current attempt.

World and Library starts remain independent Session snapshots. Repeated starts create distinct Sessions, Library definitions stay immutable, and a GM Runner rendering failure no longer rolls back or hides an already-started Chase. Missing or disabled targets continue to fail explicitly before any Session is created.

Session Lifecycle Contract v1 remains stable and now includes additive top-level `outcome` and `terminal` fields. Aborted Campaign runs therefore report `outcome: "aborted"` immediately through the existing lifecycle hook channel.

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
const latest = await forge.integrations.campaignForge.getLatestRun("blueprint", "blueprint-id", {
  entryId: "quest-1",
  linkId: "external-1"
});
```

## dev.15 Campaign Forge Integration

Campaign Forge can now discover Chase Forge as an optional provider. The integration follows the same ownership boundary as the rest of the Forge Suite: Campaign Forge stores only `provider`, `kind`, `targetId`, label, and optional provenance metadata, while Chase Forge remains authoritative for Blueprints, Library content, Sessions, and ChaseResults.

Prepared world Blueprints and read-only Library chases can be listed through the public integration bridge, opened in the correct Builder mode, or started directly from a campaign entry. A direct start creates a normal independent Chase Session and records the Campaign entry/link provenance in `session.metadata.campaign`. Library sources remain immutable and are snapshotted into the running Session.

Chase lifecycle hooks are now public and stable at Contract v1 for created, started, paused, resumed, completed, aborted, and deleted Sessions. Completed ChaseResults inherit Campaign provenance, allowing Campaign Forge to resolve the result live without copying Chase-owned result data into campaign persistence. Campaign progression is deliberately not changed automatically by Chase Forge.

Public API example:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

const prepared = await forge.integrations.campaignForge.listPrepared();
await forge.integrations.campaignForge.open("blueprint", "blueprint-id");
const started = await forge.integrations.campaignForge.start("blueprint", "blueprint-id", {
  campaign: { entryId: "quest-1", entryTitle: "The Pursuit", linkId: "external-1" }
});
const result = await forge.integrations.campaignForge.getLatestResult("blueprint", "blueprint-id", { entryId: "quest-1" });
```

See `docs/CAMPAIGN_FORGE_INTEGRATION.md` for the provider contract and lifecycle boundary.

## dev.14.2 Branching Participant Editability Hotfix

Participant and group mutations now preserve whether a prepared Chase is using the linear or branching Builder. Adding an Actor or Token to a branched Chase therefore no longer changes its Builder metadata to `basic`, which previously made the still-branched graph fail Builder editability checks and caused the UI to render read-only.

## dev.14 Journal Integration

The Builder toolbar can create a normal Foundry Journal Entry for the current prepared Chase or copy a compact reference for insertion into an existing Journal page:

```text
@ChaseBlueprint[blueprint-id]{Display Name}
@ChaseLibrary[addon:prepared-id]{Display Name}
```

Foundry enriches these references into Chase Forge controls. A GM can click the name to open the preparation in Chase Forge or use the play control to create a fresh Session immediately. Library sources stay read-only; starting them snapshots their content into the Session. Players only see a read-only label and do not receive Blueprint/GM state through Journal integration.

See `docs/JOURNAL_INTEGRATION.md` for the full contract and API.

## dev.13 Visual System

Chase Card images now use one shared resolver instead of each UI interpreting image fields independently. `manual` images use an explicit Foundry path, `predefined` images can be shipped as candidates by a content pack, `provider` can target a particular registered provider, and `automatic` chooses the best available provider result from the Chase context.

The visual context combines Blueprint/card tags with environment, tone, movement mode, time of day, and weather. The Builder resolves these previews for compact route thumbnails and the Card Inspector without silently writing an automatic preview path back into the Blueprint.

The Card Inspector includes a Foundry file picker, image-provider selector, refresh action, and a small candidate gallery. Selecting a provider result pins its provider/id/path to that card occurrence; releasing the selection returns it to provider/automatic selection. Predefined candidates supplied directly by a content pack appear in the same gallery.

GM Runner and Player View resolve the same visual source. If an obstacle has no own art, the Chase-level Blueprint image can be used as runtime fallback. If no art exists at all, the existing compact route placeholder remains.

Public API examples:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

const visual = await forge.images.resolveCard(card, { blueprint });
const choices = await forge.images.candidatesFor(card.image, { blueprint, card });
const pinned = forge.images.applyCandidate(card.image, choices.candidates[0], { mode: "provider" });
forge.images.clearCache();
```

See `docs/VISUAL_SYSTEM.md` for the image-mode and provider contract.


## dev.12 Core Card Library

The module now registers a normal `core:cards` content pack containing **72 reusable Chase Cards**. There are twelve cards each for City, Wilderness, Dungeon, Coast, Mountain, and Social/Urban chases. Each card includes a localized DE/EN name and description, two or three appropriate PF2e skill approaches, level-based DCs, scalable obstacle points, semantic tags, and automatic image-provider hooks.

The Generator localizes copied Core Cards at runtime, scales their required Chase Points to the largest participant group, and applies the selected generation difficulty as a PF2e difficulty adjustment (`easy -2`, `moderate 0`, `hard +2`, `extreme +5`). Common German environment terms such as `Stadt`, `Wildnis`, `Gewölbe`, `Küste`, `Gebirge`, and `Sozial` are recognized as aliases for the canonical generator tags.

The Builder's registered-card selector is grouped by source pack and category, so the new library remains manageable instead of becoming a 72-entry slab of text. Core Cards are still immutable source content: once inserted into a world Blueprint, they become independent editable snapshot occurrences.

The Core Library contains no bundled scene art yet. Cards use `image.mode = automatic`, allowing later Core image packs or add-on image providers to supply matching thumbnails and Player View art from the existing tag context.

See `docs/CORE_CARD_LIBRARY.md` for the content contract and scaling details.


## dev.11 Generator & Templates

The Builder now includes a **Generator & Templates** panel. Chase templates are registered content, so Chase Forge Core and add-ons can contribute structural presets without hard-coding them into the UI. The module ships five structural Core templates: Classic Pursuit, Branching Pursuit, Escape, Against the Clock, and Race. The structural templates remain a separate pack; dev.12 now supplies the first built-in Core Card Library as an independent `core:cards` pack.

Generation is deterministic when a seed is supplied and records its provenance in `metadata.generator`. The generator combines the selected template with the current Builder context, including party level, environment tags, tone tags, movement modes, time of day, and weather. Registered Chase Cards are filtered by level/type/tags and scored for contextual matches. Cards are selected without duplicates by default.

If the active card packs do not contain enough suitable cards, generation still succeeds by creating editable **placeholder obstacles**. With the dev.12 Core Card Library enabled, normal Core environment generation should no longer need those placeholders; the fallback remains useful for very narrow add-on filters. The Builder displays how many registered cards and placeholders were used.

Managed branching templates create the same split → branch lanes → merge structures used by the visual Builder. The requested chase length describes the number of obstacles encountered on a path, not the total number of unique nodes in the graph, so a medium 8-obstacle branching chase still contains eight obstacles along either route.

The generated route can be regenerated with a new seed while keeping the world Blueprint id, title, GM notes, image/tags, environment context, and participants. A confirmation is shown before replacing a non-empty route.

Public API:

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;

forge.generator.listTemplates();
forge.generator.inspect("core:branching-pursuit", {
  partyLevel: 7,
  environmentTags: ["city", "rooftop"]
});

const generated = forge.generator.generate("core:branching-pursuit", {
  seed: "market-chase-01",
  partyLevel: 7,
  environmentTags: ["city"]
});

forge.generator.reroll(generated.blueprint, { seed: "market-chase-02" });
```

Add-on templates use the existing `templates` array of a Chase Pack. Their `filters` can constrain card types, required/excluded tags, level matching, and environment/tone matching; their `generator` block can control duplicate policy, target card count, branch count, and route labels.


## dev.10.2 Visual Route Diagram & Card Inspector

The Route section now behaves more like an activity diagram than a stack of large forms. Every Chase Card is represented by a compact clickable node that contains only the card name and an optional image thumbnail. Clicking the node opens the complete card editor in the inspector on the right.

Managed route splits are drawn immediately after the obstacle that creates the decision:

```text
                 [ Rooftops ]
               ↗              ↘
[ Marketplace ] ◆              ◇ -> [ North Gate ]
               ↘              ↗
                 [ Alleys ]
```

The filled diamond marks the route decision and the hollow diamond marks the merge. Both are clickable and open the Branch Inspector, where the GM can edit route labels, descriptions, visibility, extend branch paths, or remove the split. Branch cards remain fully editable through the same card inspector used by the mainline.

Prepared Library chases remain read-only. Builder-managed library Blueprints can nevertheless be browsed through the same diagram and inspector, so large add-on chase libraries do not need a separate preview workflow.

The Builder also now synchronizes branching form edits before changing the selected diagram node or running another action. This closes a dev.10 gap where edits made to branching card/route controls could otherwise be lost.

## dev.10.1 New Chase & Prepared Chase Libraries

The Builder now has an explicit **New Chase** action in both the sidebar and sticky toolbar. Prepared chase content is separated into two ownership classes:

- **My Chases** are persisted world Blueprints and are fully editable.
- **Library** chases are supplied by Chase Forge Core or an add-on content pack and are read-only source content.

Library entries are grouped by their source pack, so multiple scenario libraries can coexist without becoming one giant undifferentiated list. Selecting a Library chase opens it as a read-only preview. The GM can then either:

- **Start** it immediately. Chase Forge creates an independent `ChaseSession` with its own Blueprint snapshot. Runtime changes belong only to that Session and never modify the Library source.
- **Copy to My Chases**. Chase Forge assigns a fresh world Blueprint id, removes the read-only library marker, records the source in `metadata.libraryOrigin`, and saves a fully editable copy.

Add-on packs may now publish full prepared chases:

```js
extension.registerPack({
  id: "urban-pursuits",
  label: "Urban Pursuits",
  cards: [],
  templates: [],
  blueprints: [/* complete ChaseBlueprint definitions */],
  imageProviders: []
});
```

Public library access:

```js
forge.library.list();
forge.library.get("my-addon:prepared-chase");
forge.library.has("my-addon:prepared-chase");
```

Library sources remain controlled by their owning module. Updating or disabling an add-on cannot silently turn its source content into mutable world data; world copies and already-created Session snapshots remain separate objects.

## dev.10 Branching & Interactive Route Decisions

The Builder can now turn an ordinary linear prepared chase into a managed branching route. On an eligible mainline obstacle, the GM can add a route split. Chase Forge creates two branch paths and a merge node that reconnects both paths to the original continuation.

Current dev.10 branch workflow:

- add a split after an eligible mainline Chase Card;
- edit the label and description of each route;
- mark a route as `public`, `discoverable`, or `hidden`;
- edit the generated branch obstacles with the same card/approach fields used elsewhere in the Builder;
- append additional manual obstacles to either branch path;
- continue adding normal mainline obstacles after the merge;
- create multiple sequential branch blocks along the main route;
- remove a managed branch block and reconnect the original route;
- save, reopen, start, and run the branched Blueprint through the existing persistence and Runner layers.

When the active group clears the obstacle immediately before a visible split, the Rules Engine stops automatic advancement because a route decision is required. The Player Chase View then shows the legal visible choices as buttons. The player's selection is sent as an authoritative route intent to the GM, validated against the current Session, persisted, and republished.

`discoverable` and `hidden` routes are not exposed merely because they exist in the Blueprint. They appear only after the existing route state/GM controls make them available. Both paths can then converge at the generated merge node and continue along the shared mainline.

Dev.10 intentionally keeps branch authoring constrained to a safe **split → path(s) → merge** structure. Nested branches inside branch lanes and a completely free-form graphical graph canvas are later Route Builder work.


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

## Builder route boundary

The original Basic Builder still represents the simple case:

```text
Start -> Card -> Card -> Card -> End
```

Dev.10 adds a managed Branching Builder shape:

```text
                 -> Route A Card -> ... ->
Start -> Card ->                         Merge -> Mainline -> End
                 -> Route B Card -> ... ->
```

A first branch converts the prepared Blueprint from `metadata.builder.mode = basic` to `branching` and sets `settings.routeComplexity = branched`. Managed branch cards are edited through stable card references. The Builder can return to Basic mode when the final branch block is removed. Arbitrary foreign/free-form graphs remain protected from Builder rewriting. Nested branches inside branch lanes are intentionally not supported in dev.10.

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

Current API version: `10`.

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
- `docs/GENERATOR.md`
- `docs/GM_RUNNER.md`
- `docs/PLAYER_VIEW.md`
- `docs/ROUTE_ENGINE.md`
- `docs/RULES_ENGINE.md`
- `docs/CONSEQUENCE_ENGINE.md`
- `docs/EFFECT_FORGE_INTEGRATION.md`
- `docs/REGISTRIES.md`
- `docs/PERSISTENCE.md`
- `docs/JOURNAL_INTEGRATION.md`
- `docs/EXTENSION_CONTRACT.md`

## Deliberately not implemented yet

- free-form graphical route canvas and nested branch editing;
- Campaign Forge integration;
- advanced arbitrary party-splitting controls beyond the existing multi-group runtime model.

## Testing

```bash
npm test
```

The dev.14 suite covers the full earlier baseline plus Journal reference parsing/enrichment, Builder Journal actions, world and read-only Library link resolution, Journal Entry creation, direct Session start, provenance metadata, and the public Journal Integration API.

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

### Protected persistence hardening (dev.14.1)

- The internal Chase Forge Journal vault is now explicitly named `PF2E Chase Forge · Protected Data · DO NOT DELETE`.
- Deleting that internal Journal while Chase Forge is active is blocked.
- Every successful persistence write is mirrored to a hidden world-setting recovery backup.
- If the protected Journal is unexpectedly removed outside Chase Forge, it is recreated automatically from that backup.
- Worlds that already lost the vault before this hotfix recover gracefully with a new empty vault and a visible warning instead of leaving the Builder unusable.
