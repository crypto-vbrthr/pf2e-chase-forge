# Basic Chase Builder - dev.7

## Purpose

The Basic Chase Builder is the first GM-facing Chase Forge application. It prepares linear `ChaseBlueprint` records while keeping the full route, rules, persistence, and extension layers independent from the UI.

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

## Advanced Blueprint safety

A Blueprint is not Basic-Builder-editable if it contains:

- choice nodes;
- merge nodes;
- multiple endings;
- non-normal route edges;
- branching or other non-linear topology.

Such a Blueprint may be opened for visibility and started if it is already persisted and valid. dev.7 refuses to rebuild or save it through the Basic Builder.

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

Outcome/consequence editing is not part of the Basic Builder UI in dev.7. Existing registered card outcomes are preserved when a card is cloned into the Blueprint snapshot.

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

await forge.ui.openBuilder();
await forge.ui.openBuilder({ blueprintId });
```
