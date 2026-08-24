import { MODULE_ID, MODULE_VERSION } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";
import { createRegistryService } from "./registries/registry-service.js";
import { FoundryPackStateStore, registerSettings } from "./settings.js";
import { createFoundryChaseVaultStore } from "./persistence/foundry-vault-store.js";
import { createChaseBuilderUiService, registerChaseBuilderSceneControls } from "./app/chase-builder-app.js";
import { createChaseRunnerUiService } from "./app/chase-runner-app.js";

let registryService = null;
let builderUi = null;
let runnerUi = null;
let chaseUi = null;

Hooks.once("init", () => {
  registerSettings();
  registryService = createRegistryService({ stateStore: new FoundryPackStateStore() });
  builderUi = createChaseBuilderUiService();
  runnerUi = createChaseRunnerUiService();
  chaseUi = Object.freeze({
    openBuilder: builderUi.openBuilder, closeBuilder: builderUi.closeBuilder, getOpenBuilder: builderUi.getOpenBuilder, debugLayout: builderUi.debugLayout,
    openRunner: runnerUi.openRunner, closeRunner: runnerUi.closeRunner, closeAllRunners: runnerUi.closeAllRunners, getOpenRunner: runnerUi.getOpenRunner, getOpenRunners: runnerUi.getOpenRunners
  });
  initializePublicApi({ registries: registryService, persistenceStore: createFoundryChaseVaultStore(), ui: chaseUi });
  registerChaseBuilderSceneControls(builderUi);
  console.info(`${MODULE_ID} | ${MODULE_VERSION} GM Chase Runner, Chat workflow, Basic Builder, and protected persistence initialized.`);
});

Hooks.once("ready", async () => {
  const api = game.modules.get(MODULE_ID)?.api ?? null;
  if (api && game.user?.isGM) {
    try { await api.persistence.initialize(); }
    catch (error) { console.error(`${MODULE_ID} | Failed to initialize protected persistence.`, error); }
  }
  Hooks.callAll("pf2eChaseForge.ready", api);
});
