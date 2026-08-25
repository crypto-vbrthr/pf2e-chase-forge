import { MODULE_ID, MODULE_VERSION } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";
import { createRegistryService } from "./registries/registry-service.js";
import { FoundryPackStateStore, registerSettings } from "./settings.js";
import { createFoundryChaseVaultStore } from "./persistence/foundry-vault-store.js";
import { createChaseBuilderUiService, registerChaseBuilderSceneControls } from "./app/chase-builder-app.js";
import { createChaseRunnerUiService } from "./app/chase-runner-app.js";
import { createChasePlayerUiService } from "./app/chase-player-app.js";
import { createChaseSessionSyncService } from "./sync/chase-session-sync.js";
import { createCoreTemplatePack } from "./content/core-templates.js";
import { createCoreCardPack } from "./content/core-cards.js";

let registryService = null;
let builderUi = null;
let runnerUi = null;
let playerUi = null;
let syncService = null;
let chaseUi = null;

function startSessionSyncWithRetry() {
  const delays = [0, 100, 500, 1500, 3000];
  const attempt = index => {
    if (syncService?.isStarted?.()) return;
    let ok = false;
    try { ok = syncService?.start?.() === true; }
    catch (error) { console.warn(`${MODULE_ID} | Chase session synchronization start attempt failed.`, error); }
    if (ok) {
      if (game.user?.isGM !== true) {
        Promise.resolve(syncService?.announcePlayerReady?.()).catch(error => console.warn(`${MODULE_ID} | Failed to announce Chase player readiness.`, error));
      }
      return;
    }
    const next = index + 1;
    if (next >= delays.length) {
      console.error(`${MODULE_ID} | Chase session synchronization could not start.`, syncService?.status?.());
      return;
    }
    globalThis.setTimeout?.(() => attempt(next), delays[next]);
  };
  attempt(0);
}

Hooks.once("init", () => {
  registerSettings();
  registryService = createRegistryService({ stateStore: new FoundryPackStateStore() });
  try { registryService.registerPacks(MODULE_ID, [createCoreTemplatePack(), createCoreCardPack()]); }
  catch (error) { console.error(`${MODULE_ID} | Failed to register Core Chase content.`, error); }
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
  console.info(`${MODULE_ID} | ${MODULE_VERSION} Core Card Library, Generator/Templates, visual Builder, GM/Player Chase views, session sync, Chat workflow, and protected persistence initialized.`);
});

Hooks.once("ready", async () => {
  const api = game.modules.get(MODULE_ID)?.api ?? null;
  startSessionSyncWithRetry();
  if (api && game.user?.isGM) {
    try { await api.persistence.initialize(); }
    catch (error) { console.error(`${MODULE_ID} | Failed to initialize protected persistence.`, error); }
    try { await api.sync?.publishActiveSessions?.(); }
    catch (error) { console.warn(`${MODULE_ID} | Failed to republish active Chase sessions.`, error); }
  }
  Hooks.callAll("pf2eChaseForge.ready", api);
});
