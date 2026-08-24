import { MODULE_ID, MODULE_VERSION } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";
import { createRegistryService } from "./registries/registry-service.js";
import { FoundryPackStateStore, registerSettings } from "./settings.js";
import { createFoundryChaseVaultStore } from "./persistence/foundry-vault-store.js";
import { createChaseBuilderUiService, registerChaseBuilderSceneControls } from "./app/chase-builder-app.js";

let registryService = null;
let builderUi = null;

Hooks.once("init", () => {
  registerSettings();
  registryService = createRegistryService({ stateStore: new FoundryPackStateStore() });
  builderUi = createChaseBuilderUiService();
  initializePublicApi({ registries: registryService, persistenceStore: createFoundryChaseVaultStore(), ui: builderUi });
  registerChaseBuilderSceneControls(builderUi);
  console.info(`${MODULE_ID} | ${MODULE_VERSION} Basic Chase Builder and protected persistence initialized.`);
});

Hooks.once("ready", async () => {
  const api = game.modules.get(MODULE_ID)?.api ?? null;
  if (api && game.user?.isGM) {
    try { await api.persistence.initialize(); }
    catch (error) { console.error(`${MODULE_ID} | Failed to initialize protected persistence.`, error); }
  }
  Hooks.callAll("pf2eChaseForge.ready", api);
});
