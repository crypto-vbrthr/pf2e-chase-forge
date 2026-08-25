# Core Card Library

Version `0.1.0-dev.12` ships Chase Forge's first built-in reusable card library.

## Pack

Pack id: `core:cards`

The pack contains **72 reusable Chase Cards**, twelve in each initial environment family:

- City
- Wilderness
- Dungeon
- Coast
- Mountain
- Social / urban

The library is registered through the normal Chase Pack registry. It can therefore be disabled through the same pack-state mechanism used by add-on content, and it does not receive any privileged persistence behavior.

## Card model

Core Cards are source content. When a card is inserted into a world Blueprint or selected by the generator, Chase Forge creates a local snapshot occurrence. Editing that occurrence never modifies the Core Card Library.

Every Core Card currently provides:

- a localized DE/EN name and description;
- two or three appropriate PF2e skill approaches;
- level-based PF2e DC calculation;
- a scalable obstacle-point requirement;
- semantic environment / scene tags;
- `image.mode = automatic` so registered image providers can supply matching art later;
- source and category metadata for provenance and Builder grouping.

## Generator integration

Core Cards are normal candidates for registered Chase Templates. The generator prefers cards whose tags match the current environment and other context.

The first Core environments use canonical technical tags:

```text
city
wilderness
dungeon
coast
mountain
social
```

Common German Builder inputs such as `Stadt`, `Wildnis`, `Gewölbe`, `Küste`, `Gebirge`, and `Sozial` are normalized to those canonical tags for generation scoring.

A medium branching Chase needs nine unique source cards to produce eight encountered obstacles on each complete path. Each Core environment contains twelve cards so the default medium and long templates can generate without placeholder fallback under a normal single-environment filter.

## Difficulty and party scaling

When a scalable registered card is used by the generator, its obstacle-point requirement is adapted to the largest current participant group using the Builder's existing convention:

```text
required points = max(1, group size - 1)
```

Generated difficulty profiles modify level-based approach DCs through the PF2e difficulty adjustment layer:

```text
easy      -2
moderate   0
hard      +2
extreme   +5
custom     0
```

The Core Card source definition itself remains unchanged. The adjustment belongs to the generated Blueprint snapshot.

## Localization

Core Card localization is resolved lazily when a card is displayed or copied into a Builder/Generator occurrence. This follows the dev.11.1 template-localization fix and avoids freezing English fallback text during Foundry's early `init` phase.

Skill approach labels prefer PF2e's own localized labels and fall back to Chase Forge's DE/EN skill localization.

## Images

The Core Library intentionally ships no embedded scene art in dev.12. Core Cards use automatic image mode and semantic tags, allowing a later Core image pack or an add-on image provider to return suitable thumbnails and Player View images without changing card definitions.
