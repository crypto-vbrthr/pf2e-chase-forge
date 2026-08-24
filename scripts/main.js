import { MODULE_ID, MODULE_VERSION } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";
import { createRegistryService } from "./registries/registry-service.js";
import { FoundryPackStateStore, registerSettings } from "./settings.js";
import { createFoundryChaseVaultStore } from "./persistence/foundry-vault-store.js";
import { createChaseBuilderUiService, registerChaseBuilderSceneControls } from "./app/chase-builder-app.js";
import { createChaseRunnerUiService } from "./app/chase-runner-app.js";
import { createChasePlayerUiService } from "./app/chase-player-app.js";
import { createChaseSessionSyncService } from "./sync/chase-session-sync.js";

let registryService = null;
let builderUi = null;
let runnerUi = null;
let playerUi = null;
let syncService = null;
let chaseUi = null;

Hooks.once("init", () => {
  registerSettings();
  registryService = createRegistryService({ stateStore: new FoundryPackStateStore() });
  builderUi = createChaseBuilderUiService();
  runnerUi = createChaseRunnerUiService();
  playerUi = createChasePlayerUiService();
  syncService = createChaseSessionSyncService({ playerUi });
  chaseUi = Object.freeze({
    openBuilder: builderUi.openBuilder, closeBuilder: builderUi.closeBuilder, getOpenBuilder: builderUi.getOpenBuilder, debugLayout: builderUi.debugLayout,
    openRunner: runnerUi.openRunner, closeRunner: runnerUi.closeRunner, closeAllRunners: runnerUi.closeAllRunners, getOpenRunner: runnerUi.getOpenRunner, getOpenRunners: runnerUi.getOpenRunners,
    openPlayerView: playerUi.openPlayerView, closePlayerView: playerUi.closePlayerView, closeAllPlayerViews: playerUi.closeAllPlayerViews, getOpenPlayerView: playerUi.getOpenPlayerView, getOpenPlayerViews: playerUi.getOpenPlayerViews, getPlayerState: playerUi.getState
  });
  initializePublicApi({ registries: registryService, persistenceStore: createFoundryChaseVaultStore(), ui: chaseUi, sync: syncService });
  registerChaseBuilderSceneControls(builderUi);
  globalThis.Hooks?.on?.("userConnected", (user, connected) => {
    if (game.user?.isGM !== true || connected !== true || user?.isGM === true) return;
    const api = game.modules.get(MODULE_ID)?.api ?? null;
    Promise.resolve(api?.sync?.publishActiveSessions?.()).catch(error => console.warn(`${MODULE_ID} | Failed to sync active Chases to connected player.`, error));
  });
  console.info(`${MODULE_ID} | ${MODULE_VERSION} GM/Player Chase views, session sync, Chat workflow, Basic Builder, and protected persistence initialized.`);
});

Hooks.once("ready", async () => {
  const api = game.modules.get(MODULE_ID)?.api ?? null;
  try { syncService?.start?.(); }
  catch (error) { console.error(`${MODULE_ID} | Failed to start Chase session synchronization.`, error); }
  if (api && game.user?.isGM) {
    try { await api.persistence.initialize(); }
    catch (error) { console.error(`${MODULE_ID} | Failed to initialize protected persistence.`, error); }
    try { await api.sync?.publishActiveSessions?.(); }
    catch (error) { console.warn(`${MODULE_ID} | Failed to republish active Chase sessions.`, error); }
  }
  Hooks.callAll("pf2eChaseForge.ready", api);
});
