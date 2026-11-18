import { isWeatherPlaceId } from "@/constants/weather";

export const WEATHER_PLACE_KEY = "tu-do-weather-place";

/** The city chosen on this device, or null (off). Unknown ids and a blocked storage read as off. */
export function loadWeatherPlace(): string | null {
  try {
    const id = localStorage.getItem(WEATHER_PLACE_KEY);
    return isWeatherPlaceId(id) ? id : null;
  } catch {
    return null;
  }
}

export function saveWeatherPlace(id: string | null): void {
  try {
    if (id !== null && isWeatherPlaceId(id)) localStorage.setItem(WEATHER_PLACE_KEY, id);
    else localStorage.removeItem(WEATHER_PLACE_KEY);
  } catch {
    // Storage blocked: the choice lasts until the modal closes.
  }
}
