# Changelog

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
