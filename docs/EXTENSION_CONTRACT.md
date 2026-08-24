# Chase Forge Extension Contract v1

## Ready hook

External modules should register after Chase Forge publishes its API:

```js
Hooks.once("pf2eChaseForge.ready", forge => {
  // forge === game.modules.get("pf2e-chase-forge")?.api
});
```

## Bound controller

```js
const extension = forge.extensions.forModule("my-chase-addon", {
  version: "1.0.0",
  requirements: {
    apiVersion: ">=2",
    extensionContractVersion: ">=1",
    schemas: {
      card: ">=1",
      template: ">=1",
      pack: ">=1"
    },
    capabilities: [
      "registries.packs",
      "extensions.transactionalRegistration"
    ]
  }
});

extension.assertCompatible();
```

The controller exposes:

```text
checkCompatibility()
assertCompatible()
registerPack()
registerPacks()
unregisterPack()
getPack()
listPacks()
listCards()
listTemplates()
listImageProviders()
setPackEnabled()
listRegistrations()
unregisterAll()
diagnostics.list()
diagnostics.clear()
```

## Pack registration

```js
extension.registerPack({
  id: "urban",
  label: "Urban Pursuits",
  version: "1.0.0",
  priority: 20,
  enabledByDefault: true,
  cards: [/* Chase Card definitions */],
  templates: [/* Chase Template definitions */],
  imageProviders: [
    {
      id: "urban-images",
      label: "Urban Images",
      priority: 50,
      supports(context) {
        return context.environmentTags?.includes("city");
      },
      async getImages(context) {
        return [/* image candidates */];
      }
    }
  ]
});
```

If the pack omits `version`, the controller's extension version is inherited.

## Namespaces

An extension may use local ids:

```text
urban
market-crowd
rooftops
urban-images
```

They become:

```text
my-chase-addon:urban
my-chase-addon:market-crowd
my-chase-addon:rooftops
my-chase-addon:urban-images
```

Explicit ids are accepted only when they already use the bound module namespace. `core:` is reserved for Chase Forge.

## Transactions and ownership

A failed registration leaves all registries unchanged. This includes:

- invalid cards/templates;
- duplicate ids within a transaction;
- global id collisions;
- namespace ownership violations;
- image-provider contract failures.

`registerPacks()` is atomic across the full batch.

`{ replace: true }` may replace only a pack owned by the same module. A module cannot remove or replace another module's content.

## Compatibility

Available capability names through dev.6:

```text
registries.cards
registries.templates
registries.packs
registries.imageProviders
packs.activation
extensions.boundOwnership
extensions.transactionalRegistration
extensions.registrationDiagnostics
rules.chasePoints
rules.rounds
rules.chaseTypes
routing.traversal
routing.conditions
routing.multiGroup
rules.pf2eDc
consequences.engine
consequences.effectForge
persistence.protectedVault
persistence.blueprints
persistence.sessions
persistence.jsonTransfer
persistence.contentSnapshots
```

Version expressions support exact values and `>`, `>=`, `<`, `<=`, `^`, and `~`.

## Diagnostics

```js
extension.diagnostics.list();
extension.diagnostics.list({ status: "error" });
extension.diagnostics.clear();

forge.extensions.diagnostics.list({ sourceModule: "my-chase-addon" });
```

Diagnostics are session-only. Registration errors also receive the relevant diagnostic entry as `error.extensionDiagnostic`.
