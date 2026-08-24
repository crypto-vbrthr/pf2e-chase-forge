# Changelog

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
