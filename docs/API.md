# PF2E Chase Forge Public API - dev.15

## Access

```js
const forge = game.modules.get("pf2e-chase-forge")?.api;
```

Current public API version: `15`  
Extension Contract version: `1`  
Basic Builder Contract version: `1`  
Branching Builder Contract version: `1`

Dev.15 adds Campaign Forge Integration Contract v1 and Session Lifecycle Hook Contract v1 and raises the public API to `15`. Persisted schema versions remain unchanged.

## Current dev.14 capabilities

```text
chaseLibrary
readOnlyLibraryBlueprints
basicBuilder
branchingBuilder
interactiveRouteDecisions
generatorTemplates
seededGeneration
generatorFallbackCards
visualSystem
resolvedCardImages
predefinedImageCandidates
automaticImageProviders
journalIntegration
journalLinks
journalStartActions
builderUi
gmRunner
playerView
sessionSync
playerIntents
chatWorkflow
```

`gmRunner` and `playerView` are true in normal Foundry initialization. `sessionSync` and `playerIntents` expose the module-socket bridge that keeps player-safe projections synchronized while the GM remains authoritative. Campaign Forge integration remains false.




## Journal Integration

```js
forge.journal.contractVersion; // 1
forge.journal.reference("blueprint", blueprintId, "Display Name");
forge.journal.reference("library", libraryId, "Display Name");
forge.journal.parseReference("@ChaseBlueprint[blueprint-id]{Display Name}");
await forge.journal.open("blueprint", blueprintId);
await forge.journal.start("blueprint", blueprintId);
await forge.journal.createEntry("blueprint", blueprintId);
await forge.journal.copyReference("blueprint", blueprintId);
```

The same bridge is exposed as `forge.integrations.journal`. Journal links remain references rather than canonical Chase storage. World links resolve through protected persistence; Library links resolve through the read-only registry. GM enrichment adds open/start controls, while players receive only a read-only label. See `docs/JOURNAL_INTEGRATION.md`.

## Visual System

```js
forge.images.contractVersion; // 1
forge.images.providers.list();
forge.images.collectCandidates(context, options);
forge.images.buildContext({ blueprint, card });
forge.images.resolve(image, context, options);
forge.images.resolveCard(card, { blueprint, fallbackToBlueprint: true });
forge.images.resolveBlueprint(blueprint);
forge.images.candidatesFor(card.image, { blueprint, card });
forge.images.selectCandidate(candidates, imageId);
forge.images.applyCandidate(card.image, candidate, { mode: "provider" });
forge.images.clearCache();
```

The resolver supports `none`, `manual`, `predefined`, `provider`, and `automatic` modes. Provider context includes environment, tone, movement, time, weather, Blueprint tags, card tags, and `metadata.imageTags`. See `docs/VISUAL_SYSTEM.md`.

## Generator & Templates

```js
forge.generator.contractVersion; // 1
forge.generator.listTemplates();
forge.generator.inspect(templateId, options);
forge.generator.generate(templateId, options);
forge.generator.reroll(blueprint, options);

// Pure helpers for integrations/tests
forge.generator.generateFromTemplate(template, cards, options);
forge.generator.inspectCandidates(template, cards, options);
forge.generator.selectCards(template, cards, options);
```

Generation accepts a deterministic `seed`, preserves the source world Blueprint identity when `sourceBlueprint` is supplied, filters cards by template/context, and emits editable placeholder cards if the selected card pool is too small. Generator provenance is stored under `blueprint.metadata.generator`. See `docs/GENERATOR.md`.


## Prepared Chase Library

```js
forge.library.list();
forge.library.get("my-addon:prepared-chase");
forge.library.has("my-addon:prepared-chase");
```

Library Blueprints are immutable add-on/core content. The Builder can start them directly as independent Session snapshots or copy them into protected world persistence as a new editable Blueprint.

Bound extensions can include `blueprints` in `registerPack()` and inspect their own registered entries with `extension.listLibraryBlueprints()`.

## Basic Builder

```js
forge.builder.contractVersion;
forge.builder.createDraft(options);
forge.builder.createManualCard(options);
forge.builder.createApproach(options);
forge.builder.isEditable(blueprint);
forge.builder.listCards(blueprint);
forge.builder.rebuildLinearGraph(blueprint);
forge.builder.addCard(blueprint, card, options);
forge.builder.addManualCard(blueprint, options);
forge.builder.updateCard(blueprint, index, updaterOrCard);
forge.builder.removeCard(blueprint, index);
forge.builder.moveCard(blueprint, fromIndex, toIndex);
forge.builder.addApproach(blueprint, cardIndex, approach);
forge.builder.removeApproach(blueprint, cardIndex, approachIndex);
forge.builder.addParticipant(blueprint, groupId, participant);
forge.builder.removeParticipant(blueprint, groupId, participantId);
forge.builder.participantFromDocument(document, options);
forge.builder.resetGroupsForType(blueprint, chaseType, options);
forge.builder.validate(blueprint, options);
forge.builder.summary(blueprint);
```

## Branching Builder

The public Builder API exposes the managed split/merge helpers used by the GM Builder UI:

```js
forge.builder.branchingContractVersion;
forge.builder.isBranching(blueprint);
forge.builder.listBranchingCards(blueprint);
forge.builder.listBranchGroups(blueprint);
forge.builder.convertToBranching(blueprint);
forge.builder.addBranchAfterCard(blueprint, sourceNodeId, options);
forge.builder.appendBranchCard(blueprint, branchEntryEdgeId, options);
forge.builder.appendMainlineCard(blueprint, card, options);
forge.builder.appendMainlineManualCard(blueprint, options);
forge.builder.updateBranchRoute(blueprint, edgeId, updates);
forge.builder.removeBranch(blueprint, branchGroupId);
forge.builder.updateCardByRef(blueprint, cardRef, updaterOrCard);
forge.builder.addApproachByRef(blueprint, cardRef, approach);
forge.builder.removeApproachByRef(blueprint, cardRef, approachIndex);
forge.builder.validateBranching(blueprint, options);
```

A managed branch is a DAG fragment with one source card, two entry edges, one or more cards per lane, and a merge node leading back to the prior continuation. Player route choices reuse the authoritative dev.9 route-intent flow. Routes marked `discoverable` or `hidden` remain absent from a player's projected state until route state makes them available.

Nested branches inside a branch lane are deliberately rejected in dev.10. Arbitrary graphs created outside the managed Builder contract remain readable/startable but are not rewritten by the Builder.

## Builder UI

```js
await forge.ui.openBuilder();
await forge.ui.openBuilder({ blueprintId });
await forge.ui.openBuilder({ libraryBlueprintId });
forge.ui.getOpenBuilder();
await forge.ui.closeBuilder();
```

The UI is GM-only. The Builder writes through the protected Blueprint persistence API.


## GM Runner UI

```js
await forge.ui.openRunner({ sessionId });
forge.ui.getOpenRunner(sessionId);
forge.ui.getOpenRunners();
await forge.ui.closeRunner(sessionId);
await forge.ui.closeAllRunners();
```

The Runner is GM-only and always mutates the persisted `ChaseSession` through the Rules, Consequence, Route, and Persistence services. Starting a Blueprint in the Basic Builder automatically opens its new Runner.

## Player View and public-state projection

```js
await forge.ui.openPlayerView({ sessionId });
forge.ui.getOpenPlayerView(sessionId);
forge.ui.getOpenPlayerViews();
forge.ui.getPlayerState(sessionId);

const publicState = await forge.player.projectState(session, { user });
```

`ChasePublicState` is deliberately not a raw Session clone. It contains only current public presentation data and action identifiers the addressed user may currently use. Exact DCs, GM notes, undiscovered routes, and future card data are not projected.

## Session synchronization

```js
forge.sync.channel;
forge.sync.authorityGmId();
forge.sync.start();
await forge.sync.publishSession(session);       // GM
await forge.sync.publishActiveSessions();       // GM
await forge.sync.sendIntent("route", { sessionId, payload }); // player
await forge.sync.requestState(sessionId);       // player
```

The module socket is transport only. Player intents cannot mutate Session state directly; the selected authority GM reloads the canonical Session, validates participant ownership and current rules state, applies the rules, persists the result, and republishes a new player-safe projection.

## Chat presentation

```js
forge.presentation.chat.contractVersion;
forge.presentation.chat.obstacleHtml(context);
forge.presentation.chat.rollResultHtml(context);
forge.presentation.chat.eventHtml(context);
await forge.presentation.chat.postObstacle(context, options);
await forge.presentation.chat.postRollResult(context, options);
await forge.presentation.chat.postEvent(context, options);
```

Public obstacle messages exclude GM notes and exact DCs by contract.

## Schemas

No core schema versions changed in dev.14:

```text
forge.schemas.blueprint === 2
forge.schemas.session === 4
forge.schemas.consequence === 2
forge.schemas.persistence === 1
```

## Persistence

```js
await forge.persistence.initialize();
forge.persistence.status();
```

### Blueprints

```js
await forge.persistence.blueprints.list();
await forge.persistence.blueprints.get(idOrReference);
await forge.persistence.blueprints.create(data, options);
await forge.persistence.blueprints.save(blueprint);
await forge.persistence.blueprints.duplicate(id, options);
await forge.persistence.blueprints.delete(id);
await forge.persistence.blueprints.freezeContent(id);
await forge.persistence.blueprints.useLiveContent(id, options);
await forge.persistence.blueprints.inspectReferences(idOrBlueprint, options);
const json = await forge.persistence.blueprints.exportJson(idOrBlueprint);
await forge.persistence.blueprints.importJson(json, { idPolicy: "new" });
forge.persistence.blueprints.reference(id);
```

### Sessions

```js
await forge.persistence.sessions.list(options);
await forge.persistence.sessions.get(idOrReference);
await forge.persistence.sessions.createFromBlueprint(blueprintId, options);
await forge.persistence.sessions.save(session);
await forge.persistence.sessions.start(id);
await forge.persistence.sessions.pause(id);
await forge.persistence.sessions.resume(id);
await forge.persistence.sessions.finish(id, endingEvaluation);
await forge.persistence.sessions.abort(id);
await forge.persistence.sessions.delete(id);
forge.persistence.sessions.reference(id);
```

### Results

```js
await forge.persistence.results.list(options);
await forge.persistence.results.get(idOrReference);
forge.persistence.results.reference(id);
```

## Stable references

```text
ChaseBlueprint.<id>
ChaseSession.<id>
ChaseResult.<id>
```

## Session Manager

```js
forge.sessionManager.createSession(...);
forge.sessionManager.startSession(...);
forge.sessionManager.pauseSession(...);
forge.sessionManager.resumeSession(...);
forge.sessionManager.saveSession(...);
forge.sessionManager.finishSession(...);
forge.sessionManager.abortSession(...);
forge.sessionManager.getSession(...);
forge.sessionManager.listSessions(...);
forge.sessionManager.getActiveSessions();
```

## Consequences and Effect Forge

```js
forge.consequences.createOccurrence(...);
forge.consequences.fromRulesResult(...);
forge.consequences.plan(...);
forge.consequences.execute(...);
forge.consequences.executeRulesResult(...);
forge.consequences.records(...);

forge.integrations.effectForge.inspect();
forge.integrations.effectForge.isAvailable();
forge.integrations.effectForge.resolveDefinition(...);
forge.integrations.effectForge.analyze(...);
forge.integrations.effectForge.apply(...);
forge.integrations.effectForge.openEditor(...);
```

## Existing surfaces

```text
forge.route
forge.rules
forge.pf2e
forge.guidelines
forge.routeConditions
forge.cards
forge.templates
forge.generator
forge.packs
forge.images
forge.extensions
forge.registries
```


## Core Card Library

The existing card registry API now exposes the built-in `core:cards` content pack after Foundry initialization:

```js
forge.cards.list();
forge.cards.get("core:city-crowded-market");
forge.packs.get("core:cards");
```

The API contract version is unchanged in dev.12 because this uses the existing card/pack registry interfaces.

## Campaign Forge Integration v1

```js
forge.integrations.campaignForge.listPrepared();
forge.integrations.campaignForge.getContext(kind, targetId);
forge.integrations.campaignForge.open(kind, targetId);
forge.integrations.campaignForge.openNew();
forge.integrations.campaignForge.start(kind, targetId, { campaign });
forge.integrations.campaignForge.getResult(sessionId);
forge.integrations.campaignForge.getLatestResult(kind, targetId, { entryId });
```

The bridge is GM-only. `kind` is `blueprint` for editable world Blueprints or `library` for immutable registered Library content. Campaign provenance is stored only on the generated Session/Result. Chase Forge never writes Campaign Forge persistence directly unless the GM explicitly calls `linkToCampaignEntry()`.

Lifecycle hook names are exposed through `forge.hooks` and include `sessionCreated`, `sessionStarted`, `sessionPaused`, `sessionResumed`, `sessionCompleted`, `sessionAborted`, and `sessionDeleted`. Hook payloads use `pf2e-chase-forge/session-lifecycle` v1.

