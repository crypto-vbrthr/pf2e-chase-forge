import test from "node:test";
import assert from "node:assert/strict";
import { openChaseImage } from "../scripts/images/image-popout.js";

test("openChaseImage uses Foundry V14 ImagePopout with source and title", async () => {
  const previousFoundry = globalThis.foundry;
  const previousLegacy = globalThis.ImagePopout;
  let received = null;
  class ImagePopout {
    constructor(options) { received = options; this.rendered = false; }
    async render(force) { this.rendered = force; return this; }
  }
  globalThis.foundry = { applications: { apps: { ImagePopout } } };
  delete globalThis.ImagePopout;
  try {
    const app = await openChaseImage("modules/test/full.webp", { title: "Obstacle" });
    assert.deepEqual(received, { src: "modules/test/full.webp", window: { title: "Obstacle" } });
    assert.equal(app.rendered, true);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousLegacy === undefined) delete globalThis.ImagePopout; else globalThis.ImagePopout = previousLegacy;
  }
});

test("openChaseImage falls back to legacy ImagePopout when needed", async () => {
  const previousFoundry = globalThis.foundry;
  const previousLegacy = globalThis.ImagePopout;
  let received = null;
  class LegacyImagePopout {
    constructor(src, options) { received = { src, options }; this.rendered = false; }
    async render(force) { this.rendered = force; return this; }
  }
  delete globalThis.foundry;
  globalThis.ImagePopout = LegacyImagePopout;
  try {
    const app = await openChaseImage("legacy.webp", { title: "Legacy" });
    assert.deepEqual(received, { src: "legacy.webp", options: { title: "Legacy" } });
    assert.equal(app.rendered, true);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
    if (previousLegacy === undefined) delete globalThis.ImagePopout; else globalThis.ImagePopout = previousLegacy;
  }
});
