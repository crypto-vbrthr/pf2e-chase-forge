# PF2E Chase Forge Architecture

## Baseline

Version `0.1.0-dev.2` adds the extension and registry layer on top of the dev.1 core data model. Gameplay services and UI remain intentionally deferred.

```text
External Chase Add-ons
        |
        v
Extension Contract v1
        |
        v
+-------------------------------+
| Registries                    |
| Card / Template / Pack        |
| Image Provider                |
+---------------+---------------+
                |
                v
         Public Chase API
                |
        +-------+------------------------------+
        |                                      |
 Core Data Model                        Future Services
 (dev.1)                                Route / Rules / Session
        |                                      |
        +-------------------+------------------+
                            |
                    Future GM / Player UI
```

## Registry ownership

Every external resource has one owning Foundry module id. Third-party extensions receive a bound controller through:

```js
forge.extensions.forModule("my-module")
```

Local ids such as `city` are normalized to `my-module:city`. Explicit ids must use the bound module namespace. An extension cannot claim another module's namespace.

The `core:` namespace is reserved for Chase Forge itself.

Ownership applies to:

- Chase Packs;
- Chase Cards;
- Chase Templates;
- image providers.

A module may replace or remove only its own resources.

## Transaction boundary

A Chase Pack is the atomic registration unit. A pack may contain:

```text
Pack
 |- Chase Cards
 |- Chase Templates
 `- Image Providers
```

`registerPack()` and `registerPacks()` are transactional. Validation or collision failures restore every registry to its previous state. Batch registration is atomic across all packs in the batch.

Replacing a pack removes the previous resources from that pack and registers the replacement in one transaction. Existing resources in unrelated packs remain protected.

## Pack activation

Registration and activation are separate concepts.

A disabled pack:

- remains registered;
- remains visible to diagnostic/management reads;
- is omitted from normal card and template discovery;
- does not contribute image providers or image candidates.

Activation is persisted in a hidden world setting. This allows a later settings UI to enable or disable individual add-on content packs without unregistering them.

## Image provider boundary

Image providers are presentation extensions. They do not participate in chase rules or route state.

A provider supplies:

```js
{
  id,
  label,
  version,
  priority,
  tags,
  supports(context),       // optional
  getImages(context)       // required, sync or async
}
```

Providers are queried by descending priority. Candidate weights order images within equal provider priority. A failing provider is isolated and reported without blocking other providers.

This is intentionally only the provider foundation. Automatic image-selection policy belongs to the later presentation/generator layer.

## Extension compatibility

Extension Contract v1 can check:

- Chase Forge module version;
- public API version;
- extension contract version;
- individual schema versions;
- named extension capabilities.

Extensions should check compatibility before registering content. Bound controllers also enforce configured requirements before every registration operation.

## Diagnostics

Extension registration diagnostics are session-only and intentionally not persisted to world settings. Entries record:

- source module;
- resource type;
- operation;
- success/error status;
- stable error/diagnostic code;
- resource ids;
- structured details.

This journal will feed the later Chase Forge diagnostics GUI.

## Existing dev.1 boundaries

The following architectural rules remain unchanged:

- `ChaseBlueprint` routes are DAGs rather than flat card lists;
- the future GM/session owner is authoritative for gameplay mutations;
- players receive a projected `ChasePublicState`, never a raw `ChaseSession`;
- Chase Forge owns chase-state consequences;
- Critical Forge / Effect Forge will own PF2e Actor effect application;
- Journal and Campaign Forge integration remain optional bridges rather than hard dependencies.
