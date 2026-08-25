# Generator & Templates

## Contract

Generator Contract version: `1`.

`ChaseTemplate` remains schema version `1`; dev.11 gives its existing `filters` and `generator` payloads executable semantics without changing the persisted data model.

## Template registration

Templates are normal Chase Pack resources:

```js
extension.registerPack({
  id: "urban-chases",
  label: "Urban Chases",
  cards: [/* ChaseCard definitions */],
  templates: [{
    id: "rooftop-pursuit",
    name: "Rooftop Pursuit",
    settings: {
      chaseType: "pursuit",
      length: "medium",
      difficulty: "moderate",
      routeComplexity: "branched",
      movementModes: ["land"],
      environmentTags: ["city", "rooftop"]
    },
    filters: {
      cardTypes: ["obstacle", "complication", "opportunity"],
      requiredTags: [],
      preferredTags: ["city", "rooftop"],
      excludedTags: [],
      requireLevelMatch: true,
      requireEnvironmentMatch: false,
      requireToneMatch: false
    },
    generator: {
      allowDuplicates: false,
      cardCount: 8,
      branchCount: 1,
      branchLabels: [["High Route", "Low Route"]]
    }
  }]
});
```

All fields in `filters`/`generator` are optional. Unknown future fields are preserved by the template schema.

## Selection

Eligible cards are filtered by:

- allowed card types;
- party-level range (`card.level.min/max`) when level matching is enabled;
- required tags;
- excluded tags;
- optional hard environment/tone matching.

Eligible cards then receive preference weight for:

- template preferred tags;
- current Blueprint environment tags;
- tone tags;
- movement tags;
- time-of-day tags.

Selection is deterministic for a supplied seed. Duplicate cards are disabled by default. If the eligible pool is exhausted, the remaining slots become editable manual placeholder obstacles.

## Length and branches

The target length is the number of card obstacles encountered along one complete path:

```text
short  = 6
medium = 8
long   = 10
```

A managed branch adds two unique branch cards but only one card to any particular traversed path. Therefore a generated medium chase with one split has 9 unique card nodes but remains 8 cards long along either route.

`routeComplexity = branched` implies one managed split unless `generator.branchCount` overrides it. `highlyBranched` can create two sequential split/merge blocks. Nested branch lanes remain outside the current Builder contract.

## Provenance

Generated Blueprints record:

```text
metadata.generator.contractVersion
metadata.generator.templateId
metadata.generator.templateSource
metadata.generator.seed
metadata.generator.generatedAt
metadata.generator.targetLength
metadata.generator.branchCount
metadata.generator.candidateCount
metadata.generator.selectedRegisteredCards
metadata.generator.fallbackCards
metadata.generator.options
```

Each copied registered card also records its original card id in generator metadata. The generated occurrence is still a local Blueprint snapshot and can be edited freely without mutating the source pack.

## Core templates

Chase Forge registers a small built-in `core:templates` pack containing structural templates only:

- Classic Pursuit
- Branching Pursuit
- Escape
- Against the Clock
- Race

The Core Card Library is deliberately separate and not part of dev.11.
