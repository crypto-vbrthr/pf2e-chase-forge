# Campaign Forge Integration Contract v2

## Ownership

Chase Forge remains authoritative for Chase Blueprints, registered Library Blueprints, Sessions, route state, participants, and ChaseResults. Campaign Forge stores only an external reference and optional display/provenance metadata.

Recommended Campaign external-link shape:

```js
{
  provider: "chaseForge",
  kind: "blueprint", // or "library"
  targetId: "blueprint-id",
  label: "Rooftop Pursuit",
  meta: {}
}
```

A Library target is immutable source content. Starting it creates an independent Session snapshot. A world Blueprint remains editable in Chase Forge and starting it also creates an independent Session.

## Capability detection

```js
const chase = game.modules.get("pf2e-chase-forge")?.api;
const caps = chase?.getCapabilities?.();

caps.campaignForgeBridge === true;
chase.contracts.campaignForgeIntegration === 2;
```

Campaign Forge itself is optional. `chase.integrations.campaignForge.inspect()` reports installation, activity, API version, and compatibility without making it a dependency.

## Prepared Chase discovery

```js
const targets = await chase.integrations.campaignForge.listPrepared();
```

Each returned descriptor identifies whether the target is a world `blueprint` or read-only `library` entry and provides a display-safe summary such as name, chase type, difficulty, length, graph counts, source, and read-only status.

The returned context is derived. Consumers should not mutate it or treat it as Chase persistence.

## Open and create

```js
await chase.integrations.campaignForge.open("blueprint", blueprintId);
await chase.integrations.campaignForge.open("library", libraryId);
await chase.integrations.campaignForge.openNew();
```

World Blueprints open editable. Library entries open in the read-only Library preview. `openNew()` resets the Chase Builder to a new draft even if an existing Builder window is already open.

## Direct start

```js
const started = await chase.integrations.campaignForge.start("blueprint", blueprintId, {
  campaign: {
    entryId: "quest-1",
    entryTitle: "Catch the Courier",
    linkId: "external-1"
  }
});
```

Contract v2 start semantics:

- validates the target through the normal Chase Blueprint validator;
- when both `campaign.entryId` and `campaign.linkId` match an existing non-terminal Session, reuses that Session by reopening an active run, resuming a paused run, or starting a draft run;
- creates a fresh normal Chase Session when no matching non-terminal run exists, including after completion or abort;
- accepts `forceNew: true` to deliberately create an additional independent Session even while one is already active/paused for the same link;
- stores campaign provenance in `session.metadata.campaign`;
- opens the GM Runner;
- publishes the sanitized Player View through the normal session synchronization service when available;
- never mutates the source Blueprint or Library definition.

## Results

A completed Campaign-started Chase copies only its campaign provenance into the Chase-owned result metadata:

```js
result.metadata.campaign
```

Consumers can retrieve results without copying them into their own domain storage:

```js
await chase.integrations.campaignForge.getResult(sessionId);
await chase.integrations.campaignForge.getLatestResult(kind, targetId, { entryId, linkId });
await chase.integrations.campaignForge.getLatestRun(kind, targetId, { entryId, linkId });
```

Chase Forge does not automatically complete quests, change Campaign entry status, or execute Campaign transitions. Campaign Forge remains authoritative for campaign progression.

`getLatestRun()` is run-aware rather than result-only. If a matching non-terminal Campaign Session exists, it reports that current run preferentially; otherwise it returns the newest terminal Campaign-started Session matching the target and optional entry/link provenance. The descriptor includes `status`, `outcome`, terminal timestamps, and the completed ChaseResult when one exists. An aborted Session reports `outcome: "aborted"` even though Chase Forge does not fabricate a persisted ChaseResult for aborts.

Passing `linkId` is recommended for Campaign entry UI. If a link is removed and later recreated for the same Chase target, the new link does not inherit the old link's displayed result.

## Session Lifecycle Hook Contract v1

Hook names are exposed through `chase.hooks`:

```js
Hooks.on(chase.hooks.started, payload => {});
Hooks.on(chase.hooks.completed, payload => {});
Hooks.on(chase.hooks.aborted, payload => {});
```

The full set is:

- `pf2eChaseForge.sessionCreated`
- `pf2eChaseForge.sessionStarted`
- `pf2eChaseForge.sessionPaused`
- `pf2eChaseForge.sessionResumed`
- `pf2eChaseForge.sessionCompleted`
- `pf2eChaseForge.sessionAborted`
- `pf2eChaseForge.sessionDeleted`

Payload schema:

```js
{
  schema: "pf2e-chase-forge/session-lifecycle",
  version: 1,
  sessionId,
  sessionReference,
  blueprintId,
  status,
  outcome,  // additive: completed outcome or "aborted"
  terminal, // additive terminal-state hint
  chaseName,
  campaign,
  session, // compact lifecycle summary
  result,  // compact completed-result summary
  resultReference
}
```

Consumers should use the compact identity/provenance fields for routing and request fresh Chase data from the public API when needed. The payload is not a replacement persistence snapshot.

## Optional Campaign link creation helper

When Campaign Forge is active and exposes its stable external-link API, a GM can explicitly create a Campaign reference from Chase Forge:

```js
await chase.integrations.campaignForge.linkToCampaignEntry(
  entryId,
  "blueprint",
  blueprintId
);
```

This is the only Campaign-persistence write performed by the bridge, and it happens only on an explicit GM call.


## Contract v2 continuation semantics

For calls that include both `campaign.entryId` and `campaign.linkId`, `start()` reuses a matching non-terminal Session unless `forceNew: true` is supplied. Active Sessions are reopened, paused Sessions are resumed, and draft Sessions are started. Completed/aborted Sessions are never reused. Calls without exact entry/link provenance retain fresh-session behavior.
