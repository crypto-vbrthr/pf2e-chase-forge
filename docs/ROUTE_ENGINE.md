# Route Graph Engine

`0.1.0-dev.3` introduced Route Traversal Contract v1; it remains unchanged in dev.6.

## Boundary

The Route Graph Engine owns only route state. It answers questions such as:

- where is a runtime group;
- which outgoing edges are currently traversable;
- which edge was chosen;
- which nodes and edges have already been traversed;
- which hidden/discoverable routes are unlocked;
- whether a runtime group has reached an ending;
- whether multiple groups have converged on the same node.

It does **not** determine PF2e success degrees, chase points, DCs, chase-round order, or final pursuit/escape victory.

## Runtime model

Each runtime group stores:

```text
id
groupId
participantIds[]
parentRuntimeGroupId
position.nodeId
position.progress
routeHistory[]
edgeHistory[]
completed
metadata
```

`routeHistory[n] -> edgeHistory[n] -> routeHistory[n+1]` must always describe a real graph edge. The integrity checker verifies this invariant before traversal mutations.

## Visibility and availability

Route visibility is separate from graph existence.

- `public`: normally eligible.
- `hidden`: unavailable until explicitly unlocked.
- `discoverable`: unavailable until explicitly unlocked.

A locked edge is unavailable even if it was previously unlocked. Lock/unlock mutations are mutually exclusive and recorded in the session event journal.

## Conditions

All edge conditions are ANDed. Contract v1 supports these sources:

- `context`: caller-supplied transient facts;
- `session`: current `ChaseSession`;
- `group`: current runtime group state;
- `nodeState`: `session.nodeState`.

Operators:

- `equals`
- `notEquals`
- `truthy`
- `falsy`
- `includes`
- `gt`
- `gte`
- `lt`
- `lte`

Unknown or malformed conditions fail closed.

## Choice nodes

`resolveDeterministic()` may automatically traverse non-interactive routing nodes when exactly one route is available, but it always stops at a node whose type is `choice`. This preserves explicit player/GM route decisions even if conditions temporarily reduce the visible choice to a single edge.

## Merges

Merge nodes do not force synchronization. Two groups may arrive at the same merge node on different rounds. `groupsAtNode()` reports current convergence. Each group continues independently unless a later rules/session layer decides otherwise.

## Completion

Entering an end node marks that runtime group complete. `completion()` returns:

```text
allGroupsCompleted
completedGroupIds[]
activeGroupIds[]
endingsByGroup{}
```

The engine intentionally does not change the overall session status to `completed`, because reaching a route ending is not necessarily identical to the PF2e chase outcome.

## Safety

Before route mutation, the engine validates:

- session schema and blueprint snapshot;
- graph structure;
- runtime position nodes;
- history nodes and edges;
- node/edge history continuity;
- blueprint group references;
- participant ownership within blueprint groups;
- route lock/unlock edge ids;
- completed groups being on ending nodes.

Unsafe states fail with `ChaseRouteError` rather than partially mutating a session.
