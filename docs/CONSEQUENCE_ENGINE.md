# Consequence Engine Contract v1

`0.1.0-dev.5` introduces the runtime layer that applies non-Chase-Point outcomes emitted by the PF2e Chase Rules Engine.

## Ownership boundary

- `chasePoints` are resolved immediately by the PF2e Chase Rules Engine.
- `routeUnlock`, `routeLock`, `routeSelect`, `narrative`, `effectForge`, and future `custom` consequences are deferred to the Consequence Engine.
- The Consequence Engine never applies a Chase Point consequence a second time. Such occurrences are recorded as `rulesHandled`.

## Stable occurrences

Every deferred consequence emitted from a resolved check receives a stable occurrence id:

```text
<rules-event-id>:<consequence-id>
```

This gives the future socket/UI layer an idempotency key. Repeating the same request cannot apply an Actor effect twice.

## Confirmation

`gmConfirmation` defaults to `true`.

Execution without confirmation writes a `pendingConfirmation` record. A later execution may confirm by occurrence id or consequence id.

## Runtime records

`ChaseSession.consequenceState.records[]` stores serializable application evidence:

```text
occurrenceId
consequenceId
kind
status
sourceEventId
runtimeGroupId
participantId
nodeId / cardId / approachId / degree
targetUuids[]
result
message
createdAt / updatedAt
```

No Foundry Actor, Token, Item, or Roll instances are persisted in these records.

## Statuses

```text
pendingConfirmation
pendingSelection
applied
skipped
manualFallback
blocked
failed
rulesHandled
unhandled
```

`manualFallback` means the chase can continue, but the GM must apply the described consequence manually. `blocked` is used when a consequence explicitly declares an unavailable integration as required.

## Route consequences

- `routeUnlock`: unlocks one or more graph edges.
- `routeLock`: locks one or more graph edges.
- `routeSelect`: moves the occurrence runtime group along an allowed edge. If multiple allowed edges exist and no choice is supplied, the record becomes `pendingSelection`.

## Effect consequences

Effect Forge consequences support:

```text
source: embedded | item
targetMode: participant | runtimeGroup | explicit
required: boolean
```

Explicit targeting may store Chase participant ids and/or Foundry UUIDs.

## API

```js
forge.consequences.createOccurrence(consequence, context);
forge.consequences.fromRulesResult(rulesResult);
forge.consequences.plan(session, occurrences, options);
await forge.consequences.execute(session, occurrences, options);
await forge.consequences.executeRulesResult(rulesResult, options);
forge.consequences.records(session, filter);
```
