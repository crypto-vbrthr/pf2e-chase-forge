/** Portable Chase JSON helpers. JSON stores paths, never the binary assets. */
import { cloneData, nowIso } from "../data/utils.js";
import { createChaseBlueprint } from "../data/factories.js";

const MEDIA_NAME = /^(?:image|images|img|audio|sound|sounds|video|videos|media|music|texture|thumbnail|poster|art|artwork|soundtrack|candidates)$/i;
const PATH_NAME = /^(?:path|src|url|file|filename|image|img|audio|sound|video|poster|thumbnail)$/i;
const ASSET_EXTENSION = /\.(?:avif|apng|bmp|gif|jpe?g|png|svg|tiff?|webp|webm|mp4|mov|m4v|mp3|m4a|ogg|oga|wav|flac|opus|aac)(?:[?#].*)?$/i;
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Walk only paths plausibly representing media, not arbitrary prose or routing metadata. */
function visitMedia(value, visitor, segments = [], mediaContext = false) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitMedia(item, visitor, [...segments, index], mediaContext));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const location = [...segments, key];
    const contextual = mediaContext || MEDIA_NAME.test(key);
    if (typeof item === "string") {
      const mediaField = PATH_NAME.test(key) && (contextual || ASSET_EXTENSION.test(item));
      if (mediaField && item.trim()) visitor({ path: item, location, holder: value, key });
    } else if (item && typeof item === "object") {
      visitMedia(item, visitor, location, contextual);
    }
  }
}

function mediaKind(path) {
  if (REMOTE.test(path)) return "external";
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return "absolute";
  return "data-relative";
}

export function listBlueprintMedia(input) {
  const results = new Map();
  visitMedia(input, ({ path, location }) => {
    if (!results.has(path)) results.set(path, { path, kind: mediaKind(path), locations: [] });
    const pointer = "/" + location.map(segment => String(segment).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
    results.get(path).locations.push(pointer);
  });
  return [...results.values()];
}

function validatedPrefix(value, label, { optional = true } = {}) {
  const raw = String(value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!raw && optional) return "";
  if (!raw || REMOTE.test(raw) || raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.includes("?") || raw.includes("#") || raw.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Invalid Foundry Data-relative ${label} path prefix.`);
  }
  return raw;
}

/** Rewrite only *matching* Foundry Data-relative media paths, never URLs or absolute paths. */
export function remapBlueprintMedia(input, { fromPrefix = "", toPrefix = "" } = {}) {
  const from = validatedPrefix(fromPrefix, "source");
  const to = validatedPrefix(toPrefix, "destination");
  if (!from && to) throw new Error("A source prefix is required to map media paths.");
  const output = cloneData(input);
  let changed = 0;
  if (!from) return { blueprint: output, changed };
  visitMedia(output, ({ path, holder, key }) => {
    if (mediaKind(path) !== "data-relative") return;
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normalized !== from && !normalized.startsWith(`${from}/`)) return;
    const suffix = normalized.slice(from.length).replace(/^\//, "");
    holder[key] = [to, suffix].filter(Boolean).join("/");
    changed += 1;
  });
  return { blueprint: output, changed };
}

/** Export a self-contained card snapshot if all referenced cards are available. */
export function makePortableBlueprint(input, { registries = null } = {}) {
  const blueprint = createChaseBlueprint(input);
  const referenced = [...new Set((blueprint.graph?.nodes ?? []).filter(node => node.type === "card" && node.cardRef).map(node => node.cardRef))];
  const previous = new Map((blueprint.contentSnapshots?.cards ?? []).map(record => [record.ref, record]));
  const records = [];
  const missingCardRefs = [];
  for (const ref of referenced) {
    // A snapshot-mode chase must retain its exact existing card definition.
    const original = previous.get(ref);
    const live = blueprint.contentSnapshots?.mode === "snapshot" ? null : registries?.getCard?.(ref, { includeDisabled: true });
    if (live) {
      records.push({ ref, source: cloneData(live.source ?? {}), data: cloneData(live), capturedAt: nowIso(), metadata: {} });
    } else if (original?.data) {
      records.push(cloneData(original));
    } else missingCardRefs.push(ref);
  }
  // Preserve snapshots not currently used by the route; no silent data loss.
  for (const [ref, record] of previous) if (!referenced.includes(ref)) records.push(cloneData(record));
  return {
    blueprint: createChaseBlueprint({
      ...blueprint,
      contentSnapshots: {
        ...blueprint.contentSnapshots,
        mode: missingCardRefs.length ? blueprint.contentSnapshots.mode : "snapshot",
        cards: records
      }
    }),
    missingCardRefs
  };
}

export function safeChaseFilename(name) {
  const plain = String(name || "chase").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/g, "").slice(0, 90);
  return `${plain || "chase"}.json`;
}
