# Changelog

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
