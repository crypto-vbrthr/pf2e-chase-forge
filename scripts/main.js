import { MODULE_ID, MODULE_VERSION } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";
import { createRegistryService } from "./registries/registry-service.js";
import { FoundryPackStateStore, registerSettings } from "./settings.js";

let registryService = null;

Hooks.once("init", () => {
  registerSettings();
  registryService = createRegistryService({ stateStore: new FoundryPackStateStore() });
  initializePublicApi({ registries: registryService });
  console.info(`${MODULE_ID} | ${MODULE_VERSION} Consequence Engine and Effect Forge bridge initialized.`);
});

Hooks.once("ready", () => {
  const api = game.modules.get(MODULE_ID)?.api ?? null;
  Hooks.callAll("pf2eChaseForge.ready", api);
});
