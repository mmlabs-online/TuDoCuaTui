import { afterEach, describe, expect, it, vi } from "vitest";

import { loadWeatherPlace, saveWeatherPlace, WEATHER_PLACE_KEY } from "./weatherPlace";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("weather place", () => {
  it("is off by default", () => {
    expect(loadWeatherPlace()).toBeNull();
  });

  it("ignores unknown stored ids", () => {
    localStorage.setItem(WEATHER_PLACE_KEY, "paris");
    expect(loadWeatherPlace()).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(loadWeatherPlace()).toBeNull();
    expect(() => saveWeatherPlace("da-lat")).not.toThrow();
    expect(() => saveWeatherPlace(null)).not.toThrow();
  });

  it("save then load", () => {
    saveWeatherPlace("da-lat");
    expect(loadWeatherPlace()).toBe("da-lat");
    saveWeatherPlace(null);
    expect(localStorage.getItem(WEATHER_PLACE_KEY)).toBeNull();
    expect(loadWeatherPlace()).toBeNull();
  });
});
