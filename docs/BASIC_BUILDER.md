# Chase Builder - Basic + Branching + Libraries + Generator - dev.11

## Generator panel (dev.11)

The Generator panel appears for editable world Blueprints when at least one active `ChaseTemplate` is registered. Generating replaces the current route after confirmation, but preserves the world Blueprint identity and participant context. The resulting cards are ordinary local Blueprint snapshots and remain editable in the visual inspector.

When registered cards are insufficient for the selected template/context, the generator inserts editable placeholder cards instead of failing. See `GENERATOR.md` for filtering, weighting, branch generation, and provenance details.


## Purpose

The Chase Builder began as the linear Basic Builder in dev.7. Dev.10 adds managed Branching Builder routes. Dev.10.1 adds an explicit New Chase workflow and separates editable world Blueprints from read-only prepared Chase libraries supplied by Core/add-on packs. Dev.10.2 replaces the expanded card stack with a visual route diagram plus a click-to-open card/branch inspector. Dev.11 adds template-driven route generation and seeded regeneration on top of the same editable Blueprint contracts. Dev.14 adds sticky Journal actions for creating a Journal Entry or copying a stable Chase reference.


## Visual route diagram and inspector

The Builder renders its managed route graph as a compact activity-diagram style view. Mainline cards are small nodes with name plus optional image thumbnail. Selecting a card opens the complete editable card form in the Inspector. A branch group is inserted immediately after its `sourceNodeId`, renders its branch lanes side by side, and ends in an explicit merge node before the mainline continuation.

The diagram is a deterministic view over the existing DAG; it does not store pixel coordinates and does not change the Blueprint schema. Card/branch selection is UI-only state. Prepared Library Blueprints remain read-only in the Inspector.

Before changing the selected node or executing another Builder action, the current Inspector form is synchronized back into the draft. This applies to both Basic and Branching Builder Blueprints.

## Ownership and Library workflow

The Builder sidebar has two content areas:

- **My Chases**: world-persisted Blueprints owned by the GM/world and fully editable.
- **Library**: complete Blueprints registered by Chase Forge Core or add-on packs. They are grouped by source pack and are read-only.

A selected Library chase can be started directly. The resulting `ChaseSession` contains an independent Blueprint snapshot, so Runner/runtime changes never mutate the source. **Copy to My Chases** creates a fresh world Blueprint id and records the source in `metadata.libraryOrigin`.

The permanent **New Chase** button discards the current unsaved draft and opens a fresh Builder draft with optional Weather Forge prefill.

## Data ownership

The Builder edits a normalized Blueprint draft. Every card occurrence added through the Builder receives a unique local snapshot reference:

```text
builder:<blueprint-id>:<occurrence-id>
```

This means:

- the same registered add-on card can be used multiple times;
- each occurrence can be edited independently;
- an add-on card is never mutated by the Builder;
- a prepared Blueprint remains usable if the source card later changes or disappears.

The Builder sets:

```text
contentSnapshots.mode = snapshot
settings.routeComplexity = linear
metadata.builder.mode = basic
```

## Linear graph contract

The Basic Builder produces exactly one start node, zero or more card nodes, and exactly one end node. Every edge is `normal` and the graph is a single path.

```text
Start -> Card A -> Card B -> ... -> End
```

Card order is represented both by the graph and by the Builder-owned snapshot list. Any add/remove/reorder operation rebuilds the linear graph while preserving card snapshot identities and card-node identities.

## Managed branching contract

Dev.10 can convert a Basic Builder route to a managed Branching Builder route when the GM adds a split after an eligible mainline card. The Builder creates two branch entry edges, one initial card per path, and a merge node that reconnects to the former continuation. Either branch path can receive more manual obstacle cards before the merge. Mainline cards can continue after the merge and multiple sequential branch blocks are supported.

Route entry edges carry editable labels/descriptions and visibility (`public`, `discoverable`, `hidden`). The Player View sees only routes projected as currently legal and visible. Removing a branch deletes its managed branch cards/merge and reconnects the source directly to the continuation. If no branch blocks remain, the Blueprint returns to Basic/linear Builder mode.

Nested branch creation inside a branch lane is deliberately unsupported in dev.10. Likewise, arbitrary graphs created outside the Builder-managed shape may be opened and started but are protected from Builder rewriting.

## Automatic Chase Point scaling (dev.17)

New manually created obstacles and scalable Core/Generator cards can carry an automatic scaling mode. The Builder alternates `groupMinus1` and `groupMinus2` as cards are created, matching the GM Core guideline that roughly half the obstacles use each threshold (minimum 1). The numeric field shows a reference value based on the largest group that actually rolls, and the inspector labels the active automatic mode.

At runtime the requirement is recalculated independently for each rolling group. If the GM edits the numeric Chase Point field, the automatic scaling metadata is removed and that card becomes a fixed custom threshold.

## Participants

Default group layouts:

```text
pursuit / escape : quarry + pursuer
race             : competitor + competitor
againstClock     : participant
```

Actors and Tokens can be added by drag-and-drop or from controlled Scene tokens. The stored participant record contains stable UUID, name, image, owner user ids, and Actor metadata when available.

## Cards and approaches

A manual card starts with one Athletics approach using a level-based DC. The GM can modify:

- card name/type/description/GM notes;
- Chase Point requirement;
- scalability marker;
- tags and image metadata;
- approach label;
- PF2e statistic slug;
- DC mode;
- fixed DC value;
- level offset;
- difficulty adjustment;
- proficiency for simple DCs;
- hidden/public DC state.

Registered and local card outcomes are preserved in the Blueprint snapshot. As of 1.0.10, the route diagram marks cards that contain non-Chase-Point consequences, and the card inspector lists each trigger degree, card/approach scope, consequence kind, label, and effect description.

For editable world cards, the GM can add a card-level Effect Forge consequence to a selected degree of success, reopen an existing embedded Effect Forge consequence in the shared editor, or remove it. Read-only Library cards expose the same summary but cannot be edited until copied or inserted into an owned chase.

## Persistence flow

```text
Builder Draft
   -> validate
   -> BlueprintRepository.create/save
   -> ChaseSessionManager.createSession
   -> ChaseSessionManager.startSession
```

A running Session is always independent from the saved Blueprint.

## Public API

```js
forge.builder.contractVersion === 1
forge.builder.createDraft(...)
forge.builder.addManualCard(...)
forge.builder.addCard(...)
forge.builder.updateCard(...)
forge.builder.moveCard(...)
forge.builder.validate(...)

forge.builder.branchingContractVersion === 1
forge.builder.addBranchAfterCard(...)
forge.builder.appendBranchCard(...)
forge.builder.appendMainlineManualCard(...)
forge.builder.updateBranchRoute(...)
forge.builder.removeBranch(...)
forge.builder.validateBranching(...)

await forge.ui.openBuilder();
await forge.ui.openBuilder({ blueprintId });
```
