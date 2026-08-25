import { OwnedContentRegistry } from "./base-registry.js";

/**
 * Read-only catalog of fully prepared Chase Blueprints supplied by Chase Forge
 * itself or by external add-on modules. Library Blueprints never live in the
 * world persistence vault until the GM explicitly copies them into the world.
 */
export class ChaseLibraryBlueprintRegistry extends OwnedContentRegistry {
  constructor() {
    super("Chase Library Blueprint");
  }
}
