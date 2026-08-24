import { MODULE_ID } from "./core/constants.js";
import { initializePublicApi } from "./api/public-api.js";

Hooks.once("init", () => {
  initializePublicApi();
  console.info(`${MODULE_ID} | 0.1.0-dev.1 Architecture & Core Data Model initialized.`);
});

Hooks.once("ready", () => {
  Hooks.callAll("pf2eChaseForge.ready", game.modules.get(MODULE_ID)?.api ?? null);
});
