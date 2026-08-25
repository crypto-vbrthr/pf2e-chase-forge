import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFilePickerSelection, openFoundryImagePicker } from "../scripts/images/foundry-image-picker.js";

test("FilePicker selection normalization accepts current and replacement-picker shapes", () => {
  assert.equal(normalizeFilePickerSelection("  images/chase.webp  "), "images/chase.webp");
  assert.equal(normalizeFilePickerSelection({ path: "images/path.webp" }), "images/path.webp");
  assert.equal(normalizeFilePickerSelection({ target: "images/target.webp" }), "images/target.webp");
  assert.equal(normalizeFilePickerSelection({ request: "images/request.webp" }), "images/request.webp");
  assert.equal(normalizeFilePickerSelection(null), "");
});

test("FilePicker binds the actual input field and forwards callback selections", async () => {
  const previousFoundry = globalThis.foundry;
  const field = { value: "" };
  let selected = null;
  class StubPicker {
    constructor(options) { this.options = options; this.callback = null; this.field = null; }
    render() { void this.callback({ path: "images/selected.webp" }); }
  }
  globalThis.foundry = { applications: { apps: { FilePicker: { implementation: StubPicker } } } };
  try {
    const opened = await openFoundryImagePicker({ current: "", field, callback: path => { selected = path; } });
    assert.equal(opened, true);
    assert.equal(field.value, "images/selected.webp");
    assert.equal(selected, "images/selected.webp");
  } finally {
    globalThis.foundry = previousFoundry;
  }
});

test("FilePicker recovers a field-only selection on close when a picker omits its callback", async () => {
  const previousFoundry = globalThis.foundry;
  const field = { value: "images/old.webp" };
  let selected = null;
  class StubPicker {
    constructor(options) { this.options = options; this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    render() {
      this.field.value = "images/recovered.webp";
      this.listeners.get("close")?.();
    }
  }
  globalThis.foundry = { applications: { apps: { FilePicker: { implementation: StubPicker } } } };
  try {
    const opened = await openFoundryImagePicker({ current: field.value, field, callback: path => { selected = path; } });
    assert.equal(opened, true);
    assert.equal(field.value, "images/recovered.webp");
    assert.equal(selected, "images/recovered.webp");
  } finally {
    globalThis.foundry = previousFoundry;
  }
});
