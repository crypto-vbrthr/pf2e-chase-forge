# Protected Persistence - dev.17

## Security boundary

Canonical Chase Blueprint, Chase Session, and Chase Result data is stored in one internal ownership-protected `JournalEntry` flag. The world settings contain only the storage version and the opaque JournalEntry id. Full GM chase state is never stored in a client-readable world-setting payload.

Non-GM clients are not allowed to read or mutate the canonical persistence service. The Player Chase View receives only a separate `ChasePublicState` projection rather than raw `ChaseSession` data.

## Storage state

Persistence schema v1:

```text
schemaVersion
revision
blueprints[]
sessions[]
results[]
createdAt
updatedAt
metadata
```

Every successful mutation increments `revision`. Mutations are serialized through an in-process transaction queue before the normalized state is written back to the protected JournalEntry. Dev.17 additionally performs best-effort optimistic concurrency checks across GM clients: a transaction saves only against the revision it read, stamps a unique write token, verifies the observed write, and retries a bounded number of times after a detected conflict. Foundry Journal writes are not an atomic distributed compare-and-swap, so this is collision hardening rather than a claim of perfect cross-client locking.


## Multi-GM optimistic concurrency (dev.17)

Each transaction reads a persistence `revision`, applies its mutation to a fresh draft, increments the revision, and writes `metadata.persistence.lastWriteToken`. Stores receive the expected prior revision. A stale revision or an observed post-write token/revision mismatch raises `PERSISTENCE_REVISION_CONFLICT`; the persistence service reloads current state and retries up to four attempts.

The in-memory store provides deterministic compare-and-save behavior for tests. The Foundry Journal vault performs pre-write revision checking and post-write token confirmation. This substantially reduces accidental lost updates when more than one GM edits Chase data, while remaining explicitly best-effort because the Foundry document API itself does not expose a server-side atomic CAS primitive.

## Blueprint repository

```js
await forge.persistence.blueprints.list();
await forge.persistence.blueprints.get(idOrReference);
await forge.persistence.blueprints.create(data);
await forge.persistence.blueprints.save(blueprint);
await forge.persistence.blueprints.duplicate(id);
await forge.persistence.blueprints.delete(id);
```

Stable references use:

```text
ChaseBlueprint.<id>
ChaseSession.<id>
ChaseResult.<id>
```

They are storage-location independent. The Journal bridge and Campaign Forge Integration v2 both reference the same stable Chase identities; neither becomes a second canonical Chase data store.

## Content snapshots

Blueprint schema v2 adds `contentSnapshots`:

```text
mode: references | snapshot
cards[]
images[]
effects[]
metadata
```

`freezeContent()` captures every currently resolvable Chase Card referenced by a route node. A session created from such a Blueprint retains the captured card definitions even if the supplying add-on is later disabled or removed. In snapshot mode the Rules Engine prefers the stored snapshot over live registry content.

```js
await forge.persistence.blueprints.freezeContent(blueprintId);
await forge.persistence.blueprints.useLiveContent(blueprintId);
```

## JSON transfer

Blueprint JSON uses an explicit transfer envelope:

```text
format: pf2e-chase-forge.blueprint
version: 1
moduleVersion
exportedAt
blueprint
```

Older Blueprint schemas are normalized to the current schema during import. Future unsupported Blueprint schemas are rejected rather than silently downgraded.

```js
const json = await forge.persistence.blueprints.exportJson(id);
const imported = await forge.persistence.blueprints.importJson(json);
```

### Builder JSON import/export (1.1.1-dev.1)

The GM's Chase Builder toolbar offers **Export JSON** and **Import JSON**. Export uses the
current editor draft (including unsaved form edits) and downloads a JSON file without
silently overwriting the world Chase. It attempts to embed every referenced Chase Card
as a content snapshot so that imported Chases remain usable if a content add-on is
missing. Unresolvable cards are explicitly reported and retain their references.

Import accepts a Chase Blueprint envelope (or a raw Blueprint), validates it, then
creates a **new** world Chase with a fresh ID. Existing Chases are never overwritten
by the UI. It supports simple and branching route graphs, groups, snapshots and
embedded Effect Forge definitions. Actor/Token UUIDs still refer to the original
world and may need reassignment.

**Important: JSON contains media *paths*, not actual media files.** On export a
`media` manifest lists referenced image/audio/video files and whether their paths are
Foundry Data-relative, absolute or external. Foundry Data-relative paths (for example
`worlds/my-world/assets/chase.webp` or `modules/my-addon/images/card.webp`) are
preserved byte-for-byte by default and resolved relative to the destination Foundry
Data folder, *not* relative to where the JSON download is located.

When importing into a world with different asset directories the GM can optionally
enter a source and destination path prefix. Only media paths that match the complete
source prefix (at a directory boundary) are rewritten. Absolute paths and external
URLs are never rewritten. The file assets must be copied/installed separately.

The public API also supports:

```js
const json = await forge.persistence.blueprints.exportJson(id, { snapshotCards: true });
await forge.persistence.blueprints.importJson(json, {
  idPolicy: "new",
  mediaPaths: { fromPrefix: "worlds/old/assets", toPrefix: "worlds/new/assets" }
});
```

The transfer envelope remains **v1**, and Public API v18 and Blueprint schema v2
remain unchanged. Existing callers of `exportJson()` retain the previous default
without automatic card snapshots (`snapshotCards: false`).

Import id policies:

- `new` - default; generate a fresh Blueprint id;
- `preserve` - keep the imported id and reject collisions;
- `replace` - keep the id and replace/create the stored Blueprint.

## Session lifecycle

```js
const draft = await forge.persistence.sessions.createFromBlueprint(blueprintId);
const active = await forge.persistence.sessions.start(draft.id);
await forge.persistence.sessions.pause(active.id);
await forge.persistence.sessions.resume(active.id);
await forge.persistence.sessions.save(changedSession);
await forge.persistence.sessions.abort(active.id);
```

Completing a session through `finish()` persists both the completed `ChaseSession` and the produced `ChaseResult` atomically.

Multiple sessions created from one Blueprint are independent because every session owns a normalized Blueprint snapshot.

## Reference diagnostics

```js
await forge.persistence.blueprints.inspectReferences(blueprintId);
```

Diagnostics currently check:

- missing Actor/Token UUIDs;
- missing Chase Cards;
- snapshot-card fallback;
- missing image providers.

Missing optional references do not corrupt the Blueprint. Missing card content without a snapshot is reported as an error.

## Fail-closed behavior

If the storage marker says a protected vault already exists but that document can no longer be found, Chase Forge does not create an empty replacement automatically. Initialization fails with `VAULT_MISSING` to avoid silent data loss.


## Journal references (dev.14)

Ordinary Journal pages do **not** become a second Chase data store. `@ChaseBlueprint[...]` and `@ChaseLibrary[...]` text references contain only a target id and display label. Opening or starting a Journal link resolves the current world Blueprint or read-only Library source at action time. Deleting a Blueprint or disabling/removing the supplying add-on therefore leaves a visible but unresolved Journal link rather than a stale hidden copy.
