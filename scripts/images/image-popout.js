/**
 * Open a Chase image in Foundry's native full-resolution ImagePopout.
 * Supports the Foundry V14 ApplicationV2 API with a legacy fallback.
 */
export async function openChaseImage(src, { title = "" } = {}) {
  const path = String(src ?? "").trim();
  if (!path) throw new Error("No image path was provided.");

  const ImagePopoutV2 = globalThis.foundry?.applications?.apps?.ImagePopout;
  if (ImagePopoutV2) {
    const app = new ImagePopoutV2({
      src: path,
      window: { title: String(title || path) }
    });
    await app.render(true);
    return app;
  }

  const LegacyImagePopout = globalThis.ImagePopout;
  if (LegacyImagePopout) {
    const app = new LegacyImagePopout(path, { title: String(title || path) });
    await app.render(true);
    return app;
  }

  // Last-resort fallback for unusual host environments. Foundry V14 should
  // always take the native branch above.
  globalThis.window?.open?.(path, "_blank", "noopener,noreferrer");
  return null;
}
