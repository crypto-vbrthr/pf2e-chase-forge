import { WEATHER_FORGE_MODULE_ID } from "../core/constants.js";
import { cloneData, nowIso } from "../data/utils.js";

export const WEATHER_FORGE_BRIDGE_CONTRACT_VERSION = 1;

const WEATHER_FORGE_TIME_SEGMENTS = Object.freeze(["morning", "noon", "afternoon", "evening", "night"]);

function moduleApi() {
  const module = globalThis.game?.modules?.get?.(WEATHER_FORGE_MODULE_ID) ?? null;
  if (!module?.active) return null;
  return module.api ?? null;
}

function localize(key, fallback = null) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  if (translated && translated !== key) return translated;
  return fallback ?? key;
}

function windDescriptorKey(value) {
  const n = Number(value ?? 0);
  if (n <= 0) return "calm";
  if (n <= 2) return "breeze";
  if (n <= 5) return "windy";
  if (n <= 8) return "strong";
  return "violent";
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapWeatherForgeTimeSegment(value) {
  const segment = String(value ?? "").trim();
  return WEATHER_FORGE_TIME_SEGMENTS.includes(segment) ? segment : null;
}

export function formatWeatherForgeLabel(weather = {}) {
  const pieces = [];
  const precipitation = String(weather.precipitation ?? "").trim();
  if (precipitation) {
    pieces.push(localize(
      `${WEATHER_FORGE_MODULE_ID}.precipitation.${precipitation}`,
      precipitation
    ));
  }
  const temperature = safeNumber(weather.temperature);
  if (temperature !== null) pieces.push(`${temperature} °C`);
  if (weather.windStrength !== null && weather.windStrength !== undefined) {
    const key = windDescriptorKey(weather.windStrength);
    pieces.push(localize(`${WEATHER_FORGE_MODULE_ID}.windStrength.${key}`, key));
  }
  return pieces.filter(Boolean).join(", ");
}

export function inspectWeatherForgeApi(api = moduleApi()) {
  const version = Number(api?.version ?? 0);
  const hasCurrentContext = typeof api?.getCurrentWeatherContext === "function";
  const hasWeather = typeof api?.getWeather === "function";
  const available = Boolean(api);
  const compatible = available && (hasCurrentContext || hasWeather);
  return Object.freeze({
    moduleId: WEATHER_FORGE_MODULE_ID,
    available,
    compatible,
    version,
    capabilities: cloneData(api?.capabilities ?? {}),
    methods: Object.freeze({
      getCurrentWeatherContext: hasCurrentContext,
      getWeather: hasWeather
    }),
    reason: compatible ? "ok" : (available ? "api-incompatible" : "module-unavailable")
  });
}

function weatherMetadata(weather, context, inspection) {
  return {
    label: formatWeatherForgeLabel(weather),
    source: {
      moduleId: WEATHER_FORGE_MODULE_ID,
      apiVersion: inspection.version,
      contextSchema: context?.schema ?? null,
      contextVersion: Number(context?.version ?? 0) || null,
      capturedAt: nowIso()
    },
    timeSegment: mapWeatherForgeTimeSegment(weather.timeSegment),
    climateZone: weather.climateZone ?? null,
    temperature: safeNumber(weather.temperature),
    precipitation: weather.precipitation ?? null,
    humidity: safeNumber(weather.humidity),
    cloudDensity: safeNumber(weather.cloudDensity),
    windStrength: safeNumber(weather.windStrength),
    extremeWeather: weather.extremeWeather ? cloneData(weather.extremeWeather) : null,
    descriptionKey: weather.descriptionKey ?? null,
    provenance: context?.provenance ? cloneData(context.provenance) : null,
    contextMismatch: context?.mismatch === true
  };
}

export function createWeatherForgeBridge({ getApi = moduleApi } = {}) {
  async function readCurrent() {
    const api = getApi();
    const inspection = inspectWeatherForgeApi(api);
    if (!inspection.compatible) return Object.freeze({ inspection, available: false, timeOfDay: null, weather: null, raw: null });

    let context = null;
    let weather = null;
    if (typeof api.getCurrentWeatherContext === "function") {
      context = await api.getCurrentWeatherContext();
      weather = context?.weather ?? null;
    }
    if (!weather && typeof api.getWeather === "function") weather = api.getWeather();
    if (!weather || typeof weather !== "object") {
      return Object.freeze({ inspection, available: true, timeOfDay: null, weather: null, raw: null });
    }

    const timeOfDay = mapWeatherForgeTimeSegment(weather.timeSegment);
    const normalizedWeather = weatherMetadata(weather, context, inspection);
    return Object.freeze({
      inspection,
      available: true,
      timeOfDay,
      weather: Object.freeze(normalizedWeather),
      raw: Object.freeze({
        context: context ? cloneData(context) : null,
        weather: cloneData(weather)
      })
    });
  }

  return Object.freeze({
    moduleId: WEATHER_FORGE_MODULE_ID,
    contractVersion: WEATHER_FORGE_BRIDGE_CONTRACT_VERSION,
    inspect: () => inspectWeatherForgeApi(getApi()),
    isAvailable: () => inspectWeatherForgeApi(getApi()).compatible,
    readCurrent
  });
}
