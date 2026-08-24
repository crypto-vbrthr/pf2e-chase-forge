import test from "node:test";
import assert from "node:assert/strict";
import {
  createWeatherForgeBridge,
  formatWeatherForgeLabel,
  inspectWeatherForgeApi,
  mapWeatherForgeTimeSegment
} from "../scripts/integrations/weather-forge-bridge.js";

test("Weather Forge dayparts map directly to Chase Forge canonical time-of-day values", () => {
  for (const value of ["morning", "noon", "afternoon", "evening", "night"]) {
    assert.equal(mapWeatherForgeTimeSegment(value), value);
  }
  assert.equal(mapWeatherForgeTimeSegment("dawn"), null);
  assert.equal(mapWeatherForgeTimeSegment(null), null);
});

test("Weather Forge inspection accepts current-context or legacy getWeather API", () => {
  assert.equal(inspectWeatherForgeApi(null).compatible, false);
  assert.equal(inspectWeatherForgeApi({ version: 1, getWeather() {} }).compatible, true);
  assert.equal(inspectWeatherForgeApi({ version: 1, getCurrentWeatherContext() {} }).compatible, true);
  assert.equal(inspectWeatherForgeApi({ version: 1 }).compatible, false);
});

test("Weather Forge label uses its localized precipitation and wind terminology", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      localize(key) {
        const values = {
          "pf2e-weather-forge.precipitation.lightRain": "Leichter Regen",
          "pf2e-weather-forge.windStrength.breeze": "Brise"
        };
        return values[key] ?? key;
      }
    }
  };
  try {
    assert.equal(formatWeatherForgeLabel({ precipitation: "lightRain", temperature: 13, windStrength: 2 }), "Leichter Regen, 13 °C, Brise");
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("Weather Forge bridge reads current context and preserves structured weather metadata", async () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      localize(key) {
        const values = {
          "pf2e-weather-forge.precipitation.mist": "Nebel/Dunst",
          "pf2e-weather-forge.windStrength.calm": "Windstill"
        };
        return values[key] ?? key;
      }
    }
  };
  const fakeApi = {
    version: 1,
    capabilities: { currentWeatherContext: true },
    async getCurrentWeatherContext() {
      return {
        schema: "pf2e-weather-forge/current-weather-context",
        version: 1,
        weather: {
          timeSegment: "morning",
          climateZone: "temperate",
          temperature: 9,
          precipitation: "mist",
          humidity: 91,
          cloudDensity: 80,
          windStrength: 0,
          descriptionKey: "description.mist",
          extremeWeather: null
        },
        provenance: { settlementId: "settlement-1" },
        mismatch: false
      };
    }
  };
  try {
    const bridge = createWeatherForgeBridge({ getApi: () => fakeApi });
    const current = await bridge.readCurrent();
    assert.equal(current.available, true);
    assert.equal(current.timeOfDay, "morning");
    assert.equal(current.weather.label, "Nebel/Dunst, 9 °C, Windstill");
    assert.equal(current.weather.source.moduleId, "pf2e-weather-forge");
    assert.equal(current.weather.source.apiVersion, 1);
    assert.equal(current.weather.timeSegment, "morning");
    assert.equal(current.weather.precipitation, "mist");
    assert.equal(current.weather.temperature, 9);
    assert.equal(current.weather.provenance.settlementId, "settlement-1");
    assert.equal(current.weather.contextMismatch, false);
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("Weather Forge bridge degrades cleanly when optional module API is absent", async () => {
  const bridge = createWeatherForgeBridge({ getApi: () => null });
  assert.equal(bridge.isAvailable(), false);
  const current = await bridge.readCurrent();
  assert.equal(current.available, false);
  assert.equal(current.timeOfDay, null);
  assert.equal(current.weather, null);
});
