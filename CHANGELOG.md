# Changelog

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
