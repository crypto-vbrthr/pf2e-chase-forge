# Journal Integration

`0.1.0-dev.14` adds Journal Integration Contract v1. Prepared world Blueprints and read-only Library chases can now be referenced from Foundry Journal text without turning the Chase data itself into a Journal document.

## Design

Canonical Chase data continues to live in Chase Forge persistence or a registered read-only content pack. A Journal link stores only a stable Chase reference and a display label. This avoids duplicate editable copies and keeps module/add-on updates separate from world-owned preparation.

Two custom text references are supported:

```text
@ChaseBlueprint[blueprint-id]{Display Name}
@ChaseLibrary[addon:prepared-id]{Display Name}
```

When Foundry enriches Journal text, a GM sees an inline Chase link plus a compact start button. Players see a read-only label. Player clients cannot open the GM Builder or directly start a Chase through this integration.

## Builder workflow

The sticky Builder toolbar contains two Journal actions:

- **Journal** creates a normal Foundry `JournalEntry` with a text page containing the Chase reference and short summary.
- **Copy Journal Link** copies the raw `@ChaseBlueprint[...]` or `@ChaseLibrary[...]` reference so it can be pasted into any existing Journal page.

For an unsaved world Chase, either action first saves the Blueprint. Read-only Library chases are linked directly and remain read-only.

## Journal actions

For a GM, clicking the enriched Chase name opens the referenced preparation in Chase Forge:

- world Blueprint -> editable Builder view
- Library Chase -> read-only Library preview

The small play control starts the referenced Chase immediately.

Starting a world Blueprint creates a new `ChaseSession` from the persisted Blueprint. Starting a Library Chase creates an independent Session snapshot of the read-only source. Runtime changes therefore never mutate the Journal link, world Blueprint, or Library source.

Sessions started through a Journal record `metadata.startedFromJournal`. Library sessions additionally preserve `metadata.libraryOrigin`.

## Missing references

Journal links are deliberately references, not snapshots. If a world Blueprint is deleted or an add-on providing a Library Chase is disabled/removed, the link remains visible but opening/starting it reports that the target is unavailable.

## Public API

```js
const forge = game.modules.get("pf2e-chase-forge").api;

forge.journal.reference("blueprint", blueprintId, "Rooftop Chase");
forge.journal.reference("library", libraryId, "Night Pursuit");

await forge.journal.open("blueprint", blueprintId);
await forge.journal.start("blueprint", blueprintId);
await forge.journal.createEntry("blueprint", blueprintId);
await forge.journal.copyReference("blueprint", blueprintId);
```

The same bridge is available as `forge.integrations.journal`.

## Security boundary

Journal integration does not expose hidden GM Chase state to players. It does not publish Blueprint data over the socket and does not bypass the existing Player View projection. Starting a Chase still creates the normal GM-authoritative Session and uses the existing synchronized runtime workflow.

No persisted schema version changes are required for dev.14.
