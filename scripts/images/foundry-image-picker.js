/**
 * Foundry FilePicker compatibility wrapper.
 *
 * Foundry's FilePicker is an ApplicationV2 in current releases, while a
 * number of replacement pickers still preserve legacy behaviours. Binding
 * the picker to the actual input field gives us a reliable second path in
 * addition to the callback: even if a custom/current picker updates only its
 * field, Chase Forge can recover the selected path when the picker closes.
 */
export function normalizeFilePickerSelection(selection) {
  if (typeof selection === "string") return selection.trim();
  if (!selection || typeof selection !== "object") return "";
  for (const value of [selection.path, selection.target, selection.request, selection.value, selection.file]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function openFoundryImagePicker({ current = "", field = null, callback = null } = {}) {
  const Picker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker ?? null;
  if (typeof Picker !== "function") return false;

  const initial = String(current ?? "").trim();
  let selectionApplied = false;

  const applySelection = async selection => {
    const path = normalizeFilePickerSelection(selection);
    if (!path) return null;
    selectionApplied = true;
    if (field && "value" in field) field.value = path;
    if (typeof callback === "function") await callback(path);
    return path;
  };

  try {
    const picker = new Picker({
      type: "image",
      current: initial,
      ...(field ? { field } : {}),
      callback: applySelection
    });

    // Some ApplicationV2/custom FilePicker implementations do not retain
    // non-Application options in exactly the same way as legacy FilePicker.
    // Assign the documented public binding properties explicitly as a
    // compatibility safeguard.
    if (field) {
      try { picker.field = field; } catch { /* read-only custom picker */ }
    }
    try { picker.callback = applySelection; } catch { /* read-only custom picker */ }

    // If a picker updates its bound field but omits the callback, recover the
    // path when it closes. This also makes FilePicker replacement modules safe.
    if (field && typeof picker.addEventListener === "function") {
      picker.addEventListener("close", () => {
        if (selectionApplied) return;
        const selected = normalizeFilePickerSelection(field.value);
        if (!selected || selected === initial) return;
        void applySelection(selected);
      }, { once: true });
    }

    if (typeof picker.render === "function") {
      try { picker.render({ force: true }); }
      catch { picker.render(true); }
      return true;
    }
  } catch (error) {
    console.warn("pf2e-chase-forge | Image file picker failed.", error);
  }
  return false;
}
