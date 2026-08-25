# Visual System

`0.1.0-dev.13` introduces Visual System Contract v1. The purpose is to make image handling deterministic and identical in the Builder, GM Runner, Player View, prepared Chase libraries, and add-ons.

## Image modes

Every Blueprint and Chase Card already uses the common image structure:

```js
{
  mode: "none" | "manual" | "predefined" | "provider" | "automatic",
  path: null,
  providerId: null,
  imageId: null,
  alt: "",
  candidates: []
}
```

- `none`: no own image.
- `manual`: an explicit Foundry file path chosen by the GM.
- `predefined`: one of the candidates shipped with the card/content pack.
- `provider`: artwork supplied by a specific registered image provider. A selected candidate can be pinned by `providerId`, `imageId`, and `path`.
- `automatic`: queries all compatible active providers and uses the highest-priority/weight candidate unless a candidate is explicitly pinned.

A stored `path` always wins. This makes a selected image stable even if an add-on later changes candidate ordering.

## Visual context

Provider context contains the current Blueprint and Card plus normalized search signals:

```js
{
  kind: "card",
  blueprintId,
  blueprintName,
  cardId,
  cardType,
  tags,
  environmentTags,
  toneTags,
  movementModes,
  timeOfDay,
  weather,
  settings,
  blueprint,
  card
}
```

`tags` combines Blueprint tags, environment, tone, movement modes, card tags, and `card.metadata.imageTags`.

## Add-on providers

Providers continue to use the existing Chase Pack contract:

```js
extension.registerPack({
  id: "urban-visuals",
  label: "Urban Visuals",
  cards: [],
  templates: [],
  imageProviders: [{
    id: "city-art",
    label: "City Art",
    priority: 50,
    supports: context => context.environmentTags.includes("city"),
    getImages: async context => [
      {
        id: "night-rooftop",
        path: "modules/my-addon/art/night-rooftop.webp",
        alt: "Rooftops at night",
        tags: ["city", "rooftop", "night"],
        weight: 10,
        metadata: { credit: "My Add-on" }
      }
    ]
  }]
});
```

Provider failures are isolated. One broken provider does not prevent other providers or manual/predefined art from working.

## Predefined card images

A content pack can ship its own candidates without a runtime provider:

```js
image: {
  mode: "predefined",
  imageId: "market-night",
  candidates: [
    { id: "market-day", path: "modules/addon/art/market-day.webp", alt: "Market by day" },
    { id: "market-night", path: "modules/addon/art/market-night.webp", alt: "Market at night" }
  ]
}
```

The Builder Card Inspector shows these candidates in the same gallery as dynamic provider matches.

## Builder behavior

The visual route diagram and Card Inspector use resolved preview art, but automatic provider results are view-only until the GM explicitly chooses one. This prevents ordinary rendering from mutating the Blueprint.

The Inspector provides:

- image mode selection;
- provider selection;
- Foundry file browsing for manual art;
- candidate discovery/refresh;
- candidate thumbnails;
- explicit candidate pinning;
- release of a pinned image.

Automatic resolution is cached during normal use. `forge.images.clearCache()` or the Builder refresh action forces providers to be queried again.

## Runtime fallback

GM Runner and Player View resolve obstacle art through the same Visual System. When a card has no own visual and the Blueprint has a Chase-level image, that image can act as fallback runtime art. No image is invented when neither source exists.

## Public API

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

No persisted schema version changes are required for dev.13.
