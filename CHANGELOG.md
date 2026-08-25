## 0.1.0-dev.15 – Campaign Forge Integration

- Adds Campaign Forge Integration Contract v1 and raises the Chase Forge public API to version `15` without changing persisted schema versions.
- Exposes prepared world Blueprints and read-only Library chases as GM-only Campaign provider targets.
- Adds campaign-facing resolve/open/new/start/result methods while preserving Chase Forge ownership of all Chase domain data.
- Direct Campaign starts create normal independent Sessions, preserve Library immutability, open the GM Runner, publish Player View state, and store Campaign entry/link provenance in Session metadata.
- Propagates Campaign provenance into completed ChaseResults so consumers can resolve outcomes without copying result records into their own persistence.
- Adds public Session Lifecycle Hook Contract v1 for created, started, paused, resumed, completed, aborted, and deleted Sessions.
- Adds `integrations.campaignForge` to advertised extension capabilities and capability detection.
- Adds `docs/CAMPAIGN_FORGE_INTEGRATION.md` plus regression coverage for listing, opening, direct starts, result return, optional-provider detection, and lifecycle hooks.

# Changelog

## 0.1.0-dev.14.3 – GM Runner Layout & German Heading Hotfix

- Separates the GM Runner toolbar from the actual scrolling viewport so restored scroll positions cannot place chase content underneath the toolbar or visually into the Foundry window title bar.
- Makes `.chase-runner-scroll` the sole vertical Runner scroller, matching the ApplicationV2 `PARTS.scrollable` declaration.
- Adds bounded flex/overflow rules for the Runner root, `.window-content`, application part, and shell, with runtime style hardening against Foundry/theme overrides.
- Defines Runner-local panel/border/accent variables so the toolbar and group panels are no longer accidentally transparent when Builder-only variables are unavailable.
- Prevents PF2e decorative heading capitalization/font rules from mangling German `ß` or umlauts in runtime chase/card names.
- Adds regression coverage for Runner scroll containment and the localized `Schließendes Stadttor` card name.

## 0.1.0-dev.14.2 – Branching Participant Editability Hotfix

- Fixed a Builder regression where adding an Actor or Token participant to an already branched chase changed `metadata.builder.mode` from `branching` to `basic`.
- The unchanged branched route graph then no longer matched either supported Builder mode, causing Save and the complete editor to become disabled after the next render.
- Participant additions now preserve the existing Builder mode for both linear and branching Blueprints.
- Group reset operations use the same mode-preserving behavior so they cannot silently lock a branching chase either.
- Added a regression test proving that participant additions keep branched Blueprints valid and editable.

## 0.1.0-dev.14.1 – Protected Vault Deletion Recovery

- Blocks accidental deletion of the internal Chase Forge persistence Journal while the module is active.
- Renames newly created vaults to make their internal/protected purpose explicit.
- Mirrors canonical persistence to a hidden world-setting recovery backup after initialization and every successful save.
- Automatically recreates a missing vault from the recovery backup.
- If a vault was already deleted before a backup existed, recreates an empty vault with a prominent warning instead of throwing `VAULT_MISSING` on every Builder render.
- Revalidates the cached vault against `game.journal` before reads and writes so external deletion cannot leave a stale document reference behind.

## 0.1.0-dev.14 – Journal Integration

- Adds Journal Integration Contract v1 and raises the public API to version `14` without changing persisted schema versions.
- Adds custom `@ChaseBlueprint[...]` and `@ChaseLibrary[...]` Journal references that Foundry enriches into Chase Forge controls.
- Lets GMs open world Blueprints directly in the editable Builder and Library chases directly in their read-only preview from Journal text.
- Adds a compact Journal play control that starts a fresh independent Chase Session and opens the GM Runner.
- Preserves read-only Library semantics by snapshotting Library content into the new Session instead of mutating source content.
- Records `metadata.startedFromJournal` and Library provenance on Sessions launched from Journal links.
- Adds sticky Builder toolbar actions to create a normal Foundry Journal Entry or copy a Chase reference for insertion into an existing Journal page.
- Automatically saves a valid unsaved world Blueprint before creating/copying its Journal reference.
- Makes Journal controls GM-only; players see a read-only Chase label and continue to receive runtime data only through the existing Player View projection.
- Adds missing-reference handling for deleted world Blueprints or unavailable add-on Library content.
- Adds `docs/JOURNAL_INTEGRATION.md` and regression coverage for reference parsing, enrichment, world/Library opening, Journal creation, Session start, provenance, and public API exposure.
- Expands automated coverage to **319 passing tests**.

## 0.1.0-dev.13.1 – Image Picker Path Hotfix

- Fixes Foundry FilePicker selections not being transferred into the Blueprint or card image-path field on some current/custom FilePicker implementations.
- Binds the picker directly to the active Builder input field in addition to using the selection callback.
- Explicitly preserves the documented `field` and `callback` bindings for ApplicationV2/replacement FilePicker compatibility.
- Normalizes string and object-shaped selection payloads.
- Recovers field-only selections when a FilePicker updates its bound input but omits the callback.
- Keeps selected manual images in the Builder draft and re-renders the preview immediately.
- Adds regression coverage for callback-based and field-only FilePicker selection flows.

## 0.1.0-dev.13 – Visual System

- Adds Visual System Contract v1 and raises the public API to version `13` without changing persisted schema versions.
- Adds a centralized image resolver for `none`, `manual`, `predefined`, `provider`, and `automatic` image modes.
- Resolves automatic/provider images from registered image providers using Chase, environment, tone, movement, time-of-day, weather, and card semantic tags.
- Preserves predefined candidate `alt` text and metadata in normalized Chase image data.
- Adds candidate discovery that combines card-embedded predefined images with dynamic provider results.
- Adds deterministic candidate pinning (`providerId`, `imageId`, `path`) and release/reselection controls.
- Caches automatic provider resolution during normal rendering and exposes an explicit refresh/clear-cache path.
- Adds Foundry image-file browsing for Blueprint and card manual images with a compatibility fallback for legacy/current FilePicker implementations.
- Adds image-provider selection, candidate thumbnails, source display, refresh, and selection controls to the visual Card Inspector.
- Makes automatically resolved images appear in the compact route diagram and Card Inspector without silently persisting the preview path.
- Makes GM Runner and Player View use the same Visual System resolver. A Chase-level image can act as runtime fallback art when an obstacle has no own image.
- Keeps the existing no-image route-node placeholder when neither card nor provider art is available.
- Adds `docs/VISUAL_SYSTEM.md` and regression coverage for manual, predefined, provider, automatic, fallback, caching, candidate pinning, Builder wiring, and Runner integration.
- Expands automated coverage to **308 passing tests**.

## 0.1.0-dev.12 – Core Card Library

- Adds the first built-in `core:cards` Chase Pack with **72 reusable Chase Cards**: twelve each for City, Wilderness, Dungeon, Coast, Mountain, and Social/Urban routes.
- Gives every Core Card localized DE/EN names and descriptions, two or three PF2e skill approaches, level-based DCs, scalable obstacle points, semantic tags, and automatic image-provider hooks.
- Localizes Core Cards lazily at display/copy time so Foundry's early `init` phase cannot freeze English fallback text, matching the dev.11.1 template-localization hardening.
- Uses localized PF2e/Chase Forge skill names for Core Card approach labels.
- Integrates the Core Library directly into seeded generation, eliminating placeholder fallback for normal Core environment generation.
- Recognizes common German environment aliases (`Stadt`, `Wildnis`, `Gewölbe`, `Küste`, `Gebirge`, `Sozial`) when scoring generator candidates.
- Scales generated reusable cards to the largest current participant group using the existing `max(1, group size - 1)` obstacle-point convention.
- Makes generator difficulty profiles operational for selected cards via PF2e DC adjustments: easy `-2`, moderate `0`, hard `+2`, extreme `+5`.
- Applies the same scalable obstacle-point convention when a registered card is inserted manually from the Builder after participants are assigned.
- Groups the Builder's registered-card selector by source pack and card category so the expanded library remains navigable.
- Keeps Core Cards immutable as registry source content; Builder/generator uses remain independent editable Blueprint snapshots with source provenance.
- Adds `docs/CORE_CARD_LIBRARY.md` and automated coverage for category completeness, localization, German tag aliases, point scaling, difficulty adjustment, and Foundry init registration.
- Persisted schema versions and public API version remain unchanged.
- Expands automated coverage to 302 passing tests.

## 0.1.0-dev.11.1 – Generator Localization Hotfix

- Core generator template names and descriptions are now localized lazily at display/use time instead of being frozen during Foundry's `init` hook.
- Generated placeholder card names now use the active language as well.
- Builder skill selectors now prefer PF2e's localized skill labels and fall back to Chase Forge's own DE/EN skill translations, including Perception.
- Core template-pack source labels are localized in the Builder.
- Added regression coverage for late template localization and localized skill labels.

## 0.1.0-dev.11 – Generator & Templates

- Adds Generator Contract v1 and raises the public API to version 12 without changing persisted schema versions.
- Registers five built-in structural Core templates: Classic Pursuit, Branching Pursuit, Escape, Against the Clock, and Race.
- Adds a Builder **Generator & Templates** panel with template selection, route generation, and seeded regeneration.
- Treats templates as normal registered Chase Pack content, so add-ons can contribute their own generator presets and card pools.
- Filters candidate cards by card type, level range, required/excluded tags, and optional hard environment/tone requirements.
- Scores eligible cards using preferred tags plus current environment, tone, movement, and time-of-day context.
- Adds deterministic weighted card selection when a seed is supplied and avoids duplicate cards by default.
- Creates editable placeholder obstacles when the active card pool cannot fill the requested route, allowing templates to remain usable before the large Core Card Library is added.
- Generates managed split → branch lanes → merge graphs for branching templates and preserves the requested obstacle count along every complete route path.
- Supports up to two sequential managed branch blocks for `highlyBranched` generation while keeping nested branch-lane editing out of the current Builder contract.
- Preserves a world Blueprint's id, participants, name, GM notes, image/tags, and environment context when regenerating its route.
- Records generator provenance, seed, template source, candidate count, registered-card count, fallback count, and generation context in `metadata.generator`.
- Displays generation statistics and warns visibly when placeholder cards were required.
- Adds `docs/GENERATOR.md` and automated coverage for Core template registration, contextual filtering, seeded selection, fallback generation, branch path length, Blueprint identity/participant preservation, public API, and Builder controls.

## 0.1.0-dev.10.2 – Visual Route Diagram & Card Inspector

- Replaces the long expanded route-card stack with a compact activity-diagram style route view.
- Shows each Chase Card as a small clickable node containing only its name and, when available, a thumbnail of the linked image.
- Opens the selected card in a dedicated inspector with the full card, image, approach, DC, and GM-note editing controls.
- Places route splits immediately after the obstacle that causes the choice, making the relationship between source obstacle, branch lanes, merge, and continuation visually explicit.
- Renders branch lanes side by side and shows an explicit decision diamond and merge diamond around the branch paths.
- Clicking a decision/merge node opens a Branch Inspector for route labels, descriptions, visibility, branch extension, and branch removal.
- Keeps prepared Library chases read-only while still allowing Builder-managed library Blueprints to be inspected through the same route diagram and card inspector.
- Fixes Builder form synchronization for branching Blueprints so card and branch edits made through the inspector are preserved before selection changes, save, start, and other actions.
- Automatically selects newly added cards and newly created route splits so their inspector opens immediately.
- Adds deterministic route-diagram model tests proving that branch blocks appear immediately after their source card and branch-lane cards do not leak into the shared mainline.
- Public API remains at version `11`; persisted Blueprint/Session schemas are unchanged.
- Expands automated coverage to 289 passing tests.

## 0.1.0-dev.10.1 – New Chase & Prepared Chase Libraries

- Adds permanent **New Chase** controls to both the Builder sidebar and sticky command toolbar so the GM can reset to a fresh prepared chase at any time.
- Splits prepared content in the Builder into **My Chases** (world-owned, editable Blueprints) and **Library** content supplied by Chase Forge or add-on packs.
- Adds a read-only Chase Library registry for complete prepared `ChaseBlueprint` definitions supplied by registered content packs.
- Groups library entries by their source pack/library and displays the library name, chase count, and source version when available.
- Library chases are immutable source content: the Builder disables editing and destructive actions while a library entry is selected.
- Adds **Copy to My Chases** to create an independent editable world Blueprint while preserving `metadata.libraryOrigin` provenance.
- Lets a GM start a library chase directly without first creating a world copy. The resulting `ChaseSession` contains its own Blueprint snapshot and runtime changes never mutate the source library chase.
- Adds `blueprints` to the add-on pack contract alongside cards, templates, and image providers; registration, replacement, activation, rollback, and removal remain transactional.
- Adds public `forge.library.get/list/has`, bound extension `listLibraryBlueprints()`, and the `registries.libraryBlueprints` extension capability.
- Raises the public API version to `11`; core Blueprint, Session, and persistence schema versions remain unchanged.
- Expands automated coverage to 284 tests.

## 0.1.0-dev.10 – Branching & Interactive Route Decisions

- Adds the first GM-editable Branching Chase Builder on top of the existing DAG Route Graph Engine.
- Converts a normal linear Builder Blueprint to Branching Builder mode when the GM adds the first route split; no migration of the persisted core schema is required.
- Lets the GM add a two-route split after an eligible mainline Chase Card, with one generated obstacle per route and an explicit merge back into the original continuation.
- Lets each branch route be named and described independently and marked `public`, `discoverable`, or `hidden`.
- Lets branch paths be extended with additional manual obstacles before they merge again.
- Keeps normal mainline card creation available after a branch block, so a chase can continue beyond the merge and can contain multiple sequential branch blocks.
- Adds Branching Builder card/approach editing by stable card reference instead of linear-list index, preserving edits safely across split paths.
- Adds branch removal that reconnects the source to the original continuation and returns the Blueprint to Basic Builder mode when the final branch is removed.
- Reuses the existing authoritative Player View route-intent flow: after an obstacle is cleared, the Rules Engine pauses when multiple legal routes are available and the player can choose a visible route from the Player Chase View.
- Discoverable/hidden route edges stay absent from the Player View until they are explicitly made available by the GM/rules state.
- Adds public Builder API helpers for branch creation, route editing, branch-path extension, mainline continuation, branch removal, and Branching Builder validation.
- Raises the public API version to `10`; core Blueprint/Session schema versions remain unchanged.
- Deliberately does not add nested branches or a free-form graphical route canvas yet; dev.10 manages simple split → branch paths → merge structures.
- Expands automated coverage to 279 tests.

## 0.1.0-dev.9.1.4 – Player View Delivery & Session List Refresh Hotfix

- Hardens Chase Player View synchronization with socket-start retries instead of relying on a single ready-time listener registration.
- Adds a player-ready handshake so a newly connected/reloaded player client explicitly asks the authoritative GM for all active/paused Chase views.
- Adds per-delivery acknowledgements: the Player View confirms whether state was received and rendered, while **Send Player View** now reports sent versus confirmed clients.
- Adds `forge.sync.status()` diagnostics with transport state, active users, authority GM, send/receive counters, acknowledgement counters, and last error information.
- Supports Foundry user collections exposed through `.contents` in addition to iterable/value APIs.
- Refreshes an open Chase Builder immediately after session abort, pause/resume, and automatic completion so aborted sessions disappear from the active-session list without a manual refresh.
- Adds regression coverage for Player View acknowledgement, the player-ready handshake, and immediate Builder session-list refresh wiring.

## 0.1.0-dev.9.1.3 – Player Socket & Sticky Builder Toolbar Hotfix

- Enables Foundry module socket transport in `module.json` via `"socket": true`, fixing **Send Player View**/automatic Player View synchronization not reaching connected player clients.
- Keeps the Builder's upper command bar (Refresh, Duplicate, Delete, Save, Start) visible while the long Builder form scrolls.
- Applies the sticky toolbar rule both in CSS and through the existing ApplicationV2 runtime layout enforcement so Foundry core styles cannot silently undo it.
- Adds regression coverage for the manifest socket flag and sticky Builder toolbar wiring.

## 0.1.0-dev.9.1.2 – Builder Save Hotfix

- Fixed `ReferenceError: editable is not defined` when saving a Chase Blueprint from the Basic Chase Builder.
- `_save()` now derives editability from the current draft immediately after syncing the form, matching the Builder render/start paths.
- Adds regression coverage so the save path cannot reference an undeclared `editable` variable again.

## 0.1.0-dev.9.1.1 – Manual Card Add Hotfix

- Fixed the Basic Chase Builder assigning the full `{ blueprint, ref, index }` result from `addManualCardToBasicBlueprint()` to its draft state. The Builder now correctly keeps only `.blueprint`, preventing `draft.settings` from becoming undefined after adding a manual obstacle.
- Hardened Weather Forge render context access with optional chaining so malformed/legacy transient draft state cannot crash the Builder while rendering.
- Added a regression test for the manual-card action wrapper bug.

## 0.1.0-dev.9.1 – Participant Drag & Drop Hotfix

- Restores Actor and Token drag-and-drop into Builder participant groups.
- Binds participant drop handling in the capture phase on both the stable ApplicationV2 root and freshly rendered drop zones, avoiding Foundry bubbling-phase interception.
- Accepts Foundry `TextEditor.getDragEventData()` plus JSON/plain-text DataTransfer payloads and reconstructs Actor/Scene Token UUIDs when only IDs are supplied.
- Adds a visible drop-target highlight while an Actor or Token is dragged over a participant group.
- Keeps the existing “add selected tokens” path as a fallback.

## 0.1.0-dev.9 – Player Chase View & Session Synchronization

- Adds a dedicated ApplicationV2 Player Chase View with obstacle images, descriptions, Chase Point progress, participant status, PF2e roll buttons, route choices, personal consequence summaries, and free-form action proposals.
- Adds player-safe `ChasePublicState` projection that excludes GM notes, exact DCs, undiscovered routes, future cards, and canonical protected Session data.
- Adds participant ownership checks so a player receives actionable roll buttons only for Actors/Tokens they are allowed to control.
- Adds a Foundry module-socket synchronization service with one deterministic active GM as the authoritative Chase processor.
- Player PF2e checks are rolled locally without the hidden DC; only the total/natural die result and selected public action identifiers are sent to the GM for rules resolution.
- Adds authoritative player intents for checks, route choices, public-state refresh, and private free-form action proposals.
- Adds automatic Player View refresh after GM Runner mutations, route administration, pause/resume, consequence handling, and chase completion.
- Active/paused Sessions are republished after world ready and when a player connects.
- Adds a GM Runner **Send Player View** control for manual republishing.
- Adds `forge.player`, `forge.sync`, Player View UI helpers, Player View Contract v1, Player State Projector Contract v1, and Session Sync Contract v1.
- Raises the public API version to `9`; core persisted schema versions remain unchanged.
- Expands automated coverage to 265 tests before final packaging.

## 0.1.0-dev.8.1 – Localization Namespace Hotfix

- Fixes a Foundry localization namespace collision introduced in dev.8 by a nested `PF2E_CHASE_FORGE` object used only for `Runner.ChatStarted`.
- Restores all Builder and Runner translation keys in both German and English instead of rendering raw `PF2E_CHASE_FORGE.*` keys.
- Keeps `PF2E_CHASE_FORGE.Runner.ChatStarted` as a normal dotted localization key, matching the rest of the module locale files.
- Adds regression coverage that forbids a nested top-level `PF2E_CHASE_FORGE` object and verifies DE/EN locale key parity.

## 0.1.0-dev.8 – GM Chase Runner & Chat Workflow

- Adds the first playable GM-only Chase Runner backed directly by persisted `ChaseSession` state.
- Adds round begin/end controls, pause/resume/abort lifecycle controls, and automatic persistent outcome/result handling.
- Displays every runtime group, current route node, current obstacle, Chase Point progress, PF2e approaches, exact GM DCs, participant acted/skipped state, and steady/rolled pace.
- Adds PF2e Actor/Token check buttons through the existing `Pf2eChaseAdapter`; returned totals and natural d20 results are resolved by the Chase Rules Engine rather than duplicated in UI code.
- Adds GM manual degree-of-success resolution, automatic +1 contributions, and explicit skipped-turn handling.
- Adds legal branch selection after cleared obstacles/choice nodes and a GM route-administration panel for unlocking or locking outgoing shortcut/route edges.
- Adds persistent consequence review with GM confirmation and route-selection controls; Effect Forge consequences continue through the existing optional bridge.
- Adds a dedicated Chat presentation layer for player-safe obstacle cards, roll summaries, chase events, and completion messages. Exact DCs, GM notes, future obstacles, and hidden route data are deliberately excluded from public obstacle messages.
- Starting a Blueprint now opens its Runner automatically. Draft/active/paused Sessions are also listed in the Builder sidebar so a restarted world can reopen an existing chase.
- Starting a Blueprint also posts a lightweight Chase-start event to Chat so the session log has a clear beginning marker.
- Adds `forge.ui.openRunner(...)`, Runner lifecycle helpers, and `forge.presentation.chat`; public API version is raised to `8` while core data schemas remain unchanged.
- Adds GM Runner Contract v1 documentation and regression coverage for UI wiring, Chat privacy, presenter flags, and API capability advertisement.

## 0.1.0-dev.7.5.1 – Weather Forge Read Hardening

- Weather Forge API read failures are now contained by the optional bridge instead of bubbling into the Chase Builder.
- The bridge falls back from `getCurrentWeatherContext()` to `getWeather()` when possible.
- Active-but-unreadable Weather Forge state is reported as a structured diagnostic instead of a thrown exception.
- Added regression coverage for missing/unregistered Weather Forge state.

## 0.1.0-dev.7.5 – Weather Forge Builder Prefill

- Adds an optional Weather Forge integration through its public API only; no hard dependency is introduced.
- New chases automatically prefill the current Weather Forge daypart and weather when Weather Forge is active and compatible.
- Adds a manual "Use current values" action in the Builder so the GM can refresh time of day and weather at any point before saving.
- Stores Weather Forge weather as structured Blueprint metadata (precipitation, temperature, humidity, cloud density, wind, climate, extremes and provenance) while keeping the field manually editable.
- Preserves Weather Forge metadata as long as the displayed weather text is not manually changed.
- Expands Chase Forge time-of-day choices with Weather Forge's canonical morning/noon/afternoon/evening/night dayparts while retaining legacy dawn/day/dusk values for existing Blueprints.
- Exposes `integrations.weatherForge` and additive Weather Forge capability flags without changing the Chase Forge public API version.
- Keeps existing saved Blueprints untouched; automatic prefill applies only to newly created chases.
- Retains the dev.7.4.3 ApplicationV2 runtime scroll enforcement.

## 0.1.0-dev.7.4.3 – Builder Runtime Scroll Enforcement

- Uses the measured Foundry `window-content` element as the authoritative vertical scroll viewport.
- Applies the layout-critical overflow/grid properties directly to the live ApplicationV2 DOM with inline `!important`, bypassing stale or overridden stylesheet rules.
- Re-applies the structural layout immediately, on the next animation frame, and after 100/500 ms so post-render Foundry layout cannot silently revert it.
- Manual `debugBuilderLayout()` now applies the runtime layout before collecting metrics.
- Adds `data-chase-runtime-layout` to the app root so it is visible in DOM diagnostics that the runtime fix executed.

## 0.1.0-dev.7.4.1 - Builder Diagnostics Clone Hotfix

- Fixed `debugBuilderLayout()` throwing `DataCloneError` on Foundry ApplicationV2 position objects.
- Diagnostics now snapshot only scalar application-position fields instead of passing Foundry-managed objects through `structuredClone()`.
- Added fail-safe diagnostic logging so layout inspection returns an error record instead of throwing if a future Foundry value is not serializable.
- No chase rules, persistence schemas, or builder layout rules are changed.

## 0.1.0-dev.7.4.2 – Builder Window-Content Scroll Fix

- Uses Foundry ApplicationV2 `.window-content` as the authoritative vertical scroll container, based on runtime diagnostics showing `clientHeight: 782` and `scrollHeight: 2037`.
- Removes the fragile nested-height scrolling strategy for the editor pane.
- Forces the Builder shell back to its intended two-column grid when Foundry core part styles override module display rules.
- Keeps diagnostic helpers available for verification.

## 0.1.0-dev.7.4 - Builder Layout Diagnostics

- Adds detailed runtime layout diagnostics for the Basic Chase Builder scroll issue.
- Logs computed dimensions and overflow/flex properties for the builder window, window content, application part, shell, main column, editor scroller, and sidebar after render.
- Adds delayed post-layout snapshots to catch Foundry ApplicationV2 sizing changes.
- Exposes `game.modules.get("pf2e-chase-forge").api.ui.debugBuilderLayout()` for manual diagnostics.
- Diagnostics include the editor parent chain and viewport/application position data.
- No chase rules or persisted data schemas are changed.

# Changelog

## 0.1.0-dev.7.3 - Builder Scroll Layout Fix

- Fixed the actual ApplicationV2 sizing issue by making the window root a constrained flex column and giving `.window-content` a zero flex-basis.
- Restored `.chase-builder-editor-scroll` as the authoritative main scroll container with an explicit constrained flex height and vertical scrollbar.
- Kept the Builder toolbar outside the scrolling editor pane and the Blueprint sidebar independently scrollable.
- Added support for both ApplicationV2 part-wrapper and direct-root template layouts.
- Removed the deprecated Scene Control `onClick` handler and retained the Foundry v13+ `onChange` handler.
- Replaced the dev.7.2 window-level scrollbar regression assertions with constrained-layout assertions.

## 0.1.0-dev.7.2 - Builder Window Scroll Hotfix

- Moved the authoritative Builder scrollbar to the Foundry ApplicationV2 `.window-content` element.
- Removed the nested flex-height dependency which could leave `.chase-builder-editor-scroll` unconstrained and therefore never overflow.
- Added a stable, explicitly styled vertical scrollbar for Chromium/Foundry.
- Kept horizontal overflow suppressed while allowing the full Builder document to grow naturally.
- Added regression coverage for the window-level scrolling contract.

## 0.1.0-dev.7.1 - Builder Scroll Hotfix

- Fixed the Basic Chase Builder layout so the main editor area uses the remaining window height instead of expanding beyond the visible window.
- Added vertical scrolling to the editor pane and kept horizontal overflow suppressed.
- Kept the Blueprint sidebar independently scrollable.
- Added stable scrollbar guttering to prevent layout shifts while editing long chases.
- Added regression coverage for the Builder scroll layout contract.

## 0.1.0-dev.7 - Basic Chase Builder

- Added the first GM-facing Chase Forge ApplicationV2 UI.
- Added a GM-only Scene Control button and public `forge.ui.openBuilder()` entry point.
- Added Basic Builder Contract v1 and raised the public API version to `7`.
- Added pure Builder-model helpers for creating and validating linear prepared Chase Blueprints.
- Added Blueprint browsing, creation, reopening, saving, duplication, deletion, and Session start actions.
- Added editable chase type, length, party level, difficulty, start distance, round duration, environment, movement, tone, time-of-day, weather, Action, Humor, Blueprint tags, and Blueprint image metadata.
- Added chase-type-aware default participant groups plus Actor/Token drag-and-drop and selected-token import.
- Added manual Chase Card creation and cloning of registered add-on cards into unique local Blueprint snapshots.
- Added linear card reordering/removal without mutating source registry cards.
- Added card-level description, GM notes, type, Chase Point requirement, tags, scalability, and image metadata editing.
- Added multiple editable approaches per card with PF2e statistic, DC mode, fixed value, level offset, difficulty adjustment, proficiency, and hidden-DC controls.
- Added fail-safe detection of advanced/non-linear Blueprints; dev.7 can load and start them but does not rewrite their graph.
- Added DE/EN localization, Builder template, and responsive Builder styling.
- Expanded the automated suite to 237 passing tests before final packaging.

## 0.1.0-dev.6 - Blueprint & Session Persistence

- Added ownership-protected canonical Chase Forge persistence in an internal JournalEntry flag.
- Added hidden storage-version and vault-id world settings without placing GM Chase payloads in ClientSettings.
- Added fail-closed `VAULT_MISSING` handling to prevent silent replacement of lost protected storage.
- Added Persistence schema v1 with revisioned Blueprint, Session, and Result collections plus serialized mutations.
- Added Blueprint CRUD, duplication, stable Chase references, JSON export/import, import id policies, and future-schema rejection.
- Raised Chase Blueprint schema to v2 with `contentSnapshots` and live-reference/snapshot modes.
- Added Chase Card content freezing so prepared chases can survive disabled or removed add-on content.
- Updated the Rules Engine to prefer frozen card snapshots when a Blueprint is in snapshot mode.
- Added reference diagnostics for Actor/Token UUIDs, Chase Cards, snapshot fallbacks, and image providers.
- Added persistent Session lifecycle operations for create/start/pause/resume/save/finish/abort/delete.
- Added independent Session snapshots for repeated runs of the same Blueprint.
- Added atomic Session completion plus ChaseResult persistence.
- Added public `persistence` and `sessionManager` APIs and raised the public API version to `6`.
- Expanded the automated suite to 221 passing tests, including protected Journal storage and simulated Foundry restart recovery.

## 0.1.0-dev.5 - Consequence Engine & Effect Forge Integration

- Added Chase Consequence Engine for deferred outcome processing after PF2e Chase Point resolution.
- Raised Chase Consequence schema to v2 with severity and explicit Effect Forge target modes.
- Raised Chase Session schema to v4 with serializable `consequenceState.records`.
- Added stable consequence occurrence ids bound to the originating rules event.
- Added idempotent consequence execution to prevent duplicate Actor effects after repeated UI/socket requests.
- Added pending GM-confirmation and route-selection states.
- Added route unlock, route lock, route select, narrative, and Effect Forge consequence executors.
- Kept Chase Point ownership in the PF2e Rules Engine to prevent double application.
- Added optional Critical Forge / Effect Forge bridge using only the published public API.
- Added embedded Effect Definition and Effect Item UUID sources, schema migration, analysis, application, and Effect Forge editor handoff.
- Added participant, runtime-group, explicit participant-list, and explicit UUID targeting for Actor effects.
- Added structured manual fallback when Effect Forge is unavailable and explicit blocking when a consequence declares Effect Forge required.
- Added retry controls for failed, blocked, skipped, and manual-fallback consequence records.
- Added public `consequences` and `integrations.effectForge` API surfaces and raised the public API version to `5`.
- Expanded the automated suite to 205 passing tests before release hardening.

## 0.1.0-dev.4 - PF2E Chase Rules Engine

- Added PF2e Chase Point resolution for all four degrees of success, including the default +2/+1/0/-1 mapping.
- Added immediate obstacle completion, zero-floor progress, no point carry-over, and same-round continuation for participants who have not yet acted.
- Added round-state tracking for acted and skipped participants plus the automatic skipped-turn Chase Point penalty.
- Added automatic non-check contributions with one or two Chase Points.
- Added separated-character handling: one success advances and critical success grants a pending +2 circumstance bonus to the first check against the next obstacle.
- Raised Chase Session schema to v3 with round state, runtime rules state, pace state, and pending check-bonus state.
- Added rolled and steady group pace modes, one-obstacle-per-round steady advancement, and fractional pace accumulation for deliberately slower opposition.
- Added initial start-distance derivation for the unbranched opening section of pursuit/escape routes.
- Added pursuit, escape, against-the-clock, and race outcome evaluation plus ChaseResult materialization.
- Added three-obstacle escape-lead handling and same-node catch detection.
- Added PF2e simple DCs, level DCs 0-25, and the standard difficulty adjustment values.
- Added fixed, simple, level-based, GM-defined, and no-DC Chase Card resolution.
- Added PF2e degree-of-success calculation with natural 20/1 shifts.
- Added a thin PF2e adapter that delegates Actor statistic rolls to the PF2e system.
- Added public `rules`, `pf2e`, and `guidelines` API surfaces and raised the public API version to `4`.
- Added Rules Engine Contract v1 documentation.
- Expanded the automated suite to 186 passing tests before release packaging.

## 0.1.0-dev.3 - Route Graph Engine

- Added a system-neutral Route Graph Engine for live traversal of Chase Blueprint DAGs.
- Added route-session initialization from validated blueprints with independent runtime positions for every chase group.
- Raised Chase Session schema to v2 and added explicit per-group `edgeHistory` alongside node route history.
- Added branch selection by edge id, shared merge-node handling, multiple-ending completion detection, and support for routes of unequal length.
- Added discoverable/hidden route semantics with explicit edge unlock and lock state; locks override prior unlocks.
- Added Route Condition Contract v1 with `context`, `session`, `group`, and `nodeState` sources plus equality, truth, inclusion, and numeric comparison operators.
- Added deterministic traversal through non-interactive routing nodes while always stopping at explicit `choice` nodes.
- Added route mutation event records without coupling route completion to overall PF2e chase victory.
- Added runtime route-integrity validation for stale nodes, broken node/edge histories, invalid blueprint-group references, participant mismatches, and unknown route-state edge ids.
- Strengthened graph validation to reject non-end dead ends and nodes that cannot reach any declared ending.
- Added reverse reachability and shortest-distance-to-ending graph analysis helpers.
- Added public route APIs, route-condition APIs, and extension capability flags for traversal, conditions, and multi-group routing.
- Raised the public API version to `3`.
- Expanded the automated suite from 89 to 110 passing tests before release packaging.

## 0.1.0-dev.2 - Registries & Public Add-On API

- Added module-owned registries for Chase Cards, Chase Templates, Chase Packs, and image providers.
- Added Chase Pack schema v1 and exposed its factory/validator through the public API.
- Added automatic external resource namespacing and protected the reserved `core:` namespace.
- Added transactional single-pack and multi-pack registration with full rollback on validation, namespace, or collision failures.
- Added same-owner pack replacement and ownership-safe unregister operations.
- Added per-pack activation. Disabled packs stay registered for diagnostics/editing but are excluded from normal card, template, and image-provider reads.
- Added hidden world-setting persistence for pack activation in Foundry.
- Added prioritized image providers with optional support predicates, normalized candidates, explicit-provider filtering, and failure isolation.
- Added Extension Contract v1 with API/schema/capability compatibility checks.
- Added module-bound extension controllers with `registerPack`, `registerPacks`, `unregisterPack`, `unregisterAll`, scoped listing, pack activation, and diagnostics.
- Added a session-only structured extension diagnostic journal.
- Raised the public API version to `2`; existing dev.1 data schemas remain at v1.
- Added public read APIs for cards, templates, packs, image providers, and registry statistics.
- Added synthetic external add-on tests proving independent modules can register and cleanly remove content.
- Expanded the automated suite from 64 to 89 passing tests before release packaging.

## 0.1.0-dev.1 - Architecture & Core Data Model

- Established the PF2E Chase Forge module skeleton for Foundry VTT 14 and PF2e.
- Added versioned schemas for ChaseCard, ChaseTemplate, ChaseBlueprint, ChaseSession, ChaseResult, ChasePublicState, and ChaseConsequence.
- Established a directed acyclic route graph with start, card, choice, merge, and end nodes.
- Added edge models for normal routes, branches, shortcuts, conditional routes, and route visibility.
- Added participant and participant-group models capable of representing future split-party sessions.
- Added image-source contracts and Effect Forge consequence references without introducing runtime dependencies.
- Added structural normalization and validation.
- Added graph cycle detection, reachability analysis, and topological sorting.
- Added the initial public API and explicit capability flags.
- Added automated tests for the architecture baseline.
