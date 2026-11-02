import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MODULE_VERSION } from "../scripts/core/constants.js";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("diagram and inspector are separately scrollable and keyboard accessible", async () => {
  const [css, template] = await Promise.all([
    read("../styles/chase-forge.css"),
    read("../templates/chase-builder.hbs")
  ]);
  assert.match(css, /\.chase-route-diagram\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*overscroll-behavior-y:\s*contain;/s);
  assert.match(css, /\.chase-route-inspector\s*\{[^}]*max-height:\s*var\(--chase-route-pane-max-height\);[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.chase-route-diagram-panel\s*\{[^}]*position:\s*sticky;[^}]*max-height:\s*var\(--chase-route-pane-max-height\);/s);
  assert.match(template, /class="chase-route-diagram" role="region" tabindex="0" aria-label=/);
  assert.match(template, /class="chase-route-inspector" role="region" tabindex="0" aria-label=/);
  assert.match(css, /\.chase-route-diagram:focus-visible/);
  assert.match(css, /@media \(max-width: 1120px\) \{[\s\S]*?\.chase-route-diagram-panel,[\s\S]*?\.chase-route-inspector/);
});

test("Builder recomputes route pane height and preserves both nested scroll positions", async () => {
  const source = await read("../scripts/app/chase-builder-app.js");
  assert.match(source, /const paneHeight = Math\.max\(180, Math\.min\(680, Math\.floor\(mainHeight - toolbarHeight - 38\)\)\)/);
  assert.match(source, /--chase-route-pane-max-height/);
  assert.match(source, /new globalThis\.ResizeObserver/);
  assert.match(source, /\._routeLayoutResizeObserver\?\.disconnect\?\.\(\)/);
  assert.match(source, /diagram:\s*diagram \? Number\(diagram\.scrollTop/);
  assert.match(source, /inspector:\s*resetInspector \? 0/);
  assert.match(source, /diagram\.scrollTop = pending\.diagram/);
  assert.match(source, /inspector\.scrollTop = pending\.inspector/);
  assert.match(source, /_captureScrollPosition\(\{ resetInspector: true \}\)/);
  assert.match(source, /scrollable:\s*\[[^\]]*"\.chase-route-diagram"[^\]]*"\.chase-route-inspector"/);
});

test("the existing JSON transfer remains part of the updated version", async () => {
  const [manifest, source, de, en] = await Promise.all([
    read("../module.json"), read("../scripts/app/chase-builder-app.js"),
    read("../lang/de.json"), read("../lang/en.json")
  ]);
  assert.equal(JSON.parse(manifest).version, MODULE_VERSION);
  assert.match(source, /exportBlueprintJson:\s*this\._actionExportBlueprintJson/);
  assert.match(source, /importBlueprintJson:\s*this\._actionImportBlueprintJson/);
  const dk = JSON.parse(de), ek = JSON.parse(en);
  assert.match(dk["PF2E_CHASE_FORGE.Builder.RouteDiagramHint"], /getrennt scrollen/);
  assert.match(ek["PF2E_CHASE_FORGE.Builder.RouteDiagramHint"], /independently/);
});
