// @ts-check
// GET /api/weather?place=<id>: today's min/max temperature and rain chance for one city of a fixed list (F-704.2).
// The provider (Open-Meteo, no key) is called only from here; the URL is built from constants, never from input.
import { createLimiter } from "./ai/rateLimit.js";
import { readCapped } from "./ai/readCapped.js";
import { sendError, sendJson } from "./http.js";

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;
const MAX_BODY = 32 * 1024;

/** @type {Record<string, { max: number, windowMs: number }>} */
export const WEATHER_LIMITS = { weather: { max: 60, windowMs: HOUR_MS } };
/** @type {Record<string, { max: number, windowMs: number }>} */
export const WEATHER_GLOBAL_LIMITS = { weather: { max: 600, windowMs: HOUR_MS } };

/** City-level coordinates only. Same ids, same order as `src/constants/weather.ts` (a test keeps them equal). */
export const WEATHER_PLACES = new Map([
  ["ha-noi", { lat: 21.03, lon: 105.85 }],
  ["hai-phong", { lat: 20.86, lon: 106.68 }],
  ["ha-long", { lat: 20.95, lon: 107.08 }],
  ["sa-pa", { lat: 22.34, lon: 103.84 }],
  ["thanh-hoa", { lat: 19.81, lon: 105.78 }],
  ["vinh", { lat: 18.68, lon: 105.68 }],
  ["hue", { lat: 16.46, lon: 107.59 }],
  ["da-nang", { lat: 16.05, lon: 108.22 }],
  ["quy-nhon", { lat: 13.78, lon: 109.22 }],
  ["nha-trang", { lat: 12.24, lon: 109.19 }],
  ["da-lat", { lat: 11.94, lon: 108.44 }],
  ["buon-ma-thuot", { lat: 12.67, lon: 108.04 }],
  ["ho-chi-minh", { lat: 10.78, lon: 106.7 }],
  ["vung-tau", { lat: 10.35, lon: 107.08 }],
  ["can-tho", { lat: 10.03, lon: 105.79 }],
]);

/** @typedef {{ date: string, minC: number, maxC: number, rainChance: number | null }} Forecast */
/** @typedef {{ ok: true, value: Forecast } | { ok: false, status: number }} WeatherResult */

/** @param {unknown} v @param {number} lo @param {number} hi */
const inRange = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** @param {unknown} json @returns {Forecast | null} */
export function parseForecast(json) {
  const daily = /** @type {any} */ (json)?.daily;
  const date = daily?.time?.[0];
  const minC = daily?.temperature_2m_min?.[0];
  const maxC = daily?.temperature_2m_max?.[0];
  const rain = daily?.precipitation_probability_max?.[0] ?? null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!inRange(minC, -40, 60) || !inRange(maxC, -40, 60) || minC > maxC) return null;
  if (rain !== null && !inRange(rain, 0, 100)) return null;
  return { date, minC, maxC, rainChance: rain };
}

/**
 * @param {typeof globalThis.fetch} fetchFn
 * @param {{ lat: number, lon: number }} place
 * @param {number} timeoutMs
 * @returns {Promise<WeatherResult>}
 */
async function fetchOpenMeteo(fetchFn, place, timeoutMs) {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max",
    timezone: "Asia/Ho_Chi_Minh",
    forecast_days: "1",
  });
  try {
    const res = await fetchFn(`https://api.open-meteo.com/v1/forecast?${params}`, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: 502 };
    const value = parseForecast(await readCapped(res, MAX_BODY));
    return value ? { ok: true, value } : { ok: false, status: 502 };
  } catch (err) {
    const name = /** @type {Error} */ (err)?.name;
    return { ok: false, status: name === "TimeoutError" || name === "AbortError" ? 504 : 502 };
  }
}

/**
 * In-memory cache keyed place + Vietnam date, with single-flight (the pending promise is stored) and a short
 * failure cache. At most 15 places x 2 dates live at once.
 * @param {{ fetch: typeof globalThis.fetch, now?: () => number, ttlMs?: number, failTtlMs?: number, timeoutMs?: number }} opts
 */
export function createWeatherService({
  fetch: fetchFn,
  now = () => Date.now(),
  ttlMs = HOUR_MS,
  failTtlMs = 5 * 60 * 1000,
  timeoutMs = 4000,
}) {
  /** @type {Map<string, { expires: number, promise: Promise<WeatherResult> }>} */
  const cache = new Map();
  return {
    /** @param {string} placeId @returns {Promise<WeatherResult & { cached: boolean }>} */
    async get(placeId) {
      const t = now();
      for (const [k, e] of cache) if (e.expires <= t) cache.delete(k);
      const key = `${placeId}|${new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10)}`;
      const hit = cache.get(key);
      if (hit) return { ...(await hit.promise), cached: true };
      const place = /** @type {{ lat: number, lon: number }} */ (WEATHER_PLACES.get(placeId));
      const entry = { expires: Infinity, promise: fetchOpenMeteo(fetchFn, place, timeoutMs) };
      cache.set(key, entry);
      const result = await entry.promise;
      entry.expires = now() + (result.ok ? ttlMs : failTtlMs);
      return { ...result, cached: false };
    },
  };
}

/** @param {{ fetch: typeof globalThis.fetch, now: () => number, ownerSub: string | null }} opts */
export function createWeather({ fetch: fetchFn, now, ownerSub }) {
  return {
    service: createWeatherService({ fetch: fetchFn, now }),
    limiter: createLimiter({
      now,
      ownerSub,
      limits: WEATHER_LIMITS,
      globalLimits: WEATHER_GLOBAL_LIMITS,
    }),
  };
}

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   weather: ReturnType<typeof createWeather>,
 *   userId: string, query: string, id: string,
 *   log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handleWeather(_req, res, { weather, userId, query, id, log }) {
  const places = new URLSearchParams(query).getAll("place");
  const place = places.length === 1 ? places[0] : "";
  if (!WEATHER_PLACES.has(place)) {
    log({ event: "weather", id, code: "invalid_input" });
    return sendError(res, 400, "invalid_input", { field: "place" });
  }
  if (!weather.limiter.check(userId, "weather")) {
    log({ event: "weather", id, place, code: "rate_limited" });
    return sendError(res, 429, "rate_limited");
  }
  const r = await weather.service.get(place);
  if (r.ok) {
    log({ event: "weather", id, place, code: "ok", cached: r.cached });
    return sendJson(res, 200, { weather: { place, ...r.value } });
  }
  log({ event: "weather", id, place, code: "weather_unavailable", cached: r.cached });
  return sendError(res, r.status, "weather_unavailable");
}
