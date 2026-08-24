# Protected Persistence - dev.6

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

Every successful mutation increments `revision`. Mutations are serialized through an in-process transaction queue before the normalized state is written back to the protected JournalEntry.

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

They are storage-location independent and are intended for the later Journal and Campaign Forge bridges.

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
