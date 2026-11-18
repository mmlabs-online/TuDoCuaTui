Status: READY

# Plan — F-704.2: Use today's weather in outfit suggestions

## Scope summary
- `docs/feature-list.md` F-704 · Outfit suggestion:
  > "Hôm nay mặc gì?": suggests 3 outfits from active items using season, **weather (optional)** and stale items first.
- Split recorded in F-704.1: F-704.1 = rules + UI (MERGED), **F-704.2 = weather (this plan)**, F-704.3 = AI ranking.
- Ticket scope, quoted: "A server endpoint (e.g. `GET /api/weather`) that returns today's min/max temperature and rain
  chance for the user's chosen place, fetched server-side from a weather provider and cached (e.g. 1 hour per place)";
  "A setting for the place: a city picked from a short list … no GPS, no precise location stored in the browser
  storage; off by default"; "`suggest` takes optional weather: cold → prefer outer and winter items, hot → skip outer,
  rain → note in the reason"; "The modal shows a one-line weather summary when on; when weather is off or fails,
  suggestions fall back to F-704.1 rules with no error blocking the modal."
- **Ming's answers (2026-11-18) override the ticket body:** "Provider: Open-Meteo (no key; personal use), fixed list of
  ~15 Vietnamese cities, no free text, no GPS"; "Place storage: **per device** (browser localStorage, off by default) —
  no table, no migration" (supersedes "stored per user on the server"); "cold when today's max ≤ **24 °C** (add outer),
  hot when max ≥ 32 °C (no outer), rain when chance ≥ 60 %"; "**One ticket** (no 2a/2b split)".
- Out of scope (ticket): GPS / precise geolocation, hourly forecasts, AI ranking (F-704.3). Also out: any table,
  migration or `WardrobeRepo` change; the Settings modal (the place picker lives in the outfits modal, A2).
- Rules that apply: R1 (weather is not wardrobe data; it goes through an injected client in `src/data/weather.ts`, the
  `aiSettings` precedent, never a `fetch` in a component; no local fallback data), R3 (no key anywhere; Open-Meteo needs
  none), R6 (Vietnamese copy in `src/features/outfits/copy.ts`, place labels ↔ ids in `src/constants/weather.ts`), R7,
  R8 (unit tests for every pure piece and the server route), R9 (390px + dark mode). D42 (one-off Playwright check, no
  dependency), D44 (no demo/local mode), BUG-006 (no App-level tests). High paths touched: `server/**` → `Gate:
  plan-approval`; `security-ai-generated-code-auditor` runs at review (areas include `security`, path `server/`).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | With weather on, cold (max ≤ 24 °C) adds Khoác and widens eligibility to Đông items; hot (max ≥ 32 °C) drops Khoác and Đông-only items; rain (≥ 60 %) adds a rain reason; thresholds are exported constants | `suggest.test.ts` › "weather: cold adds Khoác outside Đông", "weather: cold makes Đông-tagged items eligible", "weather: hot drops Khoác in Đông", "weather: hot skips Đông-tagged items when others exist", "weather: rain adds the rain reason", "weather: threshold boundaries", "weather: null rain chance is not rain", "weather: no weather gives the F-704.1 result" |
| 2 | Weather failure or timeout never blocks suggestions | `OutfitsModal.test.tsx` › "failing weather client still shows outfits and a short note", "slow weather client: outfits appear after WEATHER_WAIT_MS"; `weather.test.ts` › "maps a thrown fetch / non-ok / bad shape to WeatherError" |
| 3 | Server endpoint validates the place (fixed list only) | `server/weather.test.ts` › "400 for missing, unknown, repeated or prototype-key place; provider not called" |
| 4 | Server caches results (1 h per place and VN day), single-flight, failures cached 5 min | `server/weather.test.ts` › "second call within TTL hits the cache", "refetches after TTL", "refetches on a new VN day", "concurrent calls share one provider fetch", "a failure is cached for 5 minutes, then retried" |
| 5 | Server outbound call has a timeout, `redirect: "error"`, a 32 KiB cap and strict response validation; URL built only from constants | `server/weather.test.ts` › "calls api.open-meteo.com with the place's coordinates and fixed params", "504 weather_unavailable on timeout", "502 weather_unavailable on non-2xx, bad JSON, oversized body, missing or out-of-range fields" |
| 6 | Per-user rate limit, separate from the AI limiter | `server/weather.test.ts` › "61st call in an hour is 429 for that user only" |
| 7 | No new secret in client code (R3); no provider key exists | Reviewer: `.env.example` unchanged, no `VITE_*` added, grep `open-meteo` only in `server/weather.js` (+ the credit link in copy). AC wording "`.env.example` lists the name" is moot: Open-Meteo has no key (Ming's answer) |
| 8 | Place is per device, off by default, from the fixed list only; nothing precise stored | `weatherPlace.test.ts` › "off by default", "ignores unknown stored ids", "survives a throwing localStorage", "save then load"; `OutfitsModal.test.tsx` › "off by default: no weather call", "picking a place stores it and fetches weather"; `server/weather.test.ts` › "client and server place ids match" |
| 9 | One-line weather summary with Open-Meteo credit when on | `OutfitsModal.test.tsx` › "shows the weather summary and credit"; `copy.test.ts` › "weather summary" |
| 10 | 390px and dark mode for the place picker and the summary | One-off Playwright check `weather-verify.cjs` (Approach step 9), run by implementer and re-run by reviewer; results + screenshots in impl-log / review |
| 11 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- After deploy: the home-server container reaches `api.open-meteo.com` (egress; the compose file has no allowlist per
  the consult). Open "Hôm nay mặc gì?", pick a city: the summary line shows today's min–max and rain chance.
- On a cold or rainy day (or by picking Sa Pa / Đà Lạt): Khoác appears and the rain chip shows; on a hot HCMC day no
  Khoác. Tune the thresholds if they feel wrong (consult risk: Hà Nội vs HCMC).
- Light and dark on the phone.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `server/weather.js` | **Create.** `WEATHER_PLACES` (id → lat/lon, `Map`), `WEATHER_LIMITS` / `WEATHER_GLOBAL_LIMITS`, `fetchOpenMeteo`, `parseForecast`, `createWeatherService` (cache, single-flight, failure cache), `handleWeather` route handler | Endpoint, provider call, cache | **Yes** |
| `server/weather.test.ts` | **Create.** Route + service tests listed below (node env, real `createApp` over `http`, fake `fetch`, injected `now`) | AC 3–6, 8 | **Yes** |
| `server/api.js` | **Modify (~6 lines).** `match`: `parts.length === 3 && a === "weather"` → `{ route: "/api/weather", allow: "GET" }`; dispatch to `handleWeather` before the item-id logic; ctx typedef gains `weather` | Routing | **Yes** |
| `server/app.js` | **Modify (~12 lines).** Dep `weatherFetch?: typeof fetch` (default `globalThis.fetch`); build `weather = { service: createWeatherService({ fetch: weatherFetch, now }), limiter: createLimiter({ now, ownerSub, limits: WEATHER_LIMITS, globalLimits: WEATHER_GLOBAL_LIMITS }) }`; pass to `handleApi` | Wiring; works without a DB pool | **Yes** |
| `server/README.md` | **Modify (1 table row + 1 line).** Document `GET /api/weather?place=<id>`, codes, cache, limits, outbound host | API docs kept in step | **Yes** |
| `src/constants/weather.ts` | **Create.** `WEATHER_PLACES: readonly { id: string; name: string }[]` (15 rows, Vietnamese names), `isWeatherPlaceId` | R6 labels ↔ ids | No |
| `src/data/weather.ts` | **Create.** `Weather` type, `WeatherError`, `createHttpWeather(fetchFn, base, auth) → { today(placeId) }` | Client (aiSettings pattern) | No |
| `src/data/weather.test.ts` | **Create.** Client tests | AC 2, R8 | No |
| `src/features/outfits/weatherPlace.ts` | **Create.** `WEATHER_PLACE_KEY = "tu-do-weather-place"`, `loadWeatherPlace()`, `saveWeatherPlace(id \| null)` (try/catch, validated) | Per-device setting | No |
| `src/features/outfits/weatherPlace.test.ts` | **Create.** | AC 8 | No |
| `src/features/outfits/suggest.ts` | **Modify.** Thresholds, `WeatherInput`, `weatherKind`, optional `opts.weather`, wanted seasons, outer rule, reasons `cold`/`hot`/`rain` | Rules | No |
| `src/features/outfits/suggest.test.ts` | **Modify.** Add weather tests | AC 1 | No |
| `src/features/outfits/copy.ts` | **Modify.** `reasons.cold/hot/rain`; `weather: { label, off, loading, unavailable, summary(name, minC, maxC, rain), credit, creditUrl }` | R6 | No |
| `src/features/outfits/copy.test.ts` | **Modify.** New copy outputs | R8 | No |
| `src/features/outfits/OutfitsModal.tsx` | **Modify.** Optional prop `weather?: WeatherClient`; place picker; fetch + wait ≤ `WEATHER_WAIT_MS`; summary line; pass weather to `suggestOutfits` | UI | No |
| `src/features/outfits/OutfitsModal.test.tsx` | **Modify.** Weather tests (fake client) | AC 2, 8, 9 | No |
| `src/App.tsx` | **Modify (hotspot, ≤ 6 lines).** `const weatherClient = useMemo(() => createHttpWeather(undefined, undefined, { getToken, onAuthLost }), [])`; `weather={weatherClient}` on `<OutfitsModal>` | Wiring only | No |
| `src/index.css` | **Modify.** `.outfit-weather` (row, wrap, `var(--muted)`), `.outfit-weather select` (tokens, min-height 40px), `.outfit-weather a` | R9 | No |

No migration, no `WardrobeRepo`, no `src/types/database.ts`, no `.env.example`, no `server/index.js`, no Dockerfile change.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/weather.test.ts` › 400 for missing, unknown, repeated or prototype-key place; provider not called | `?`, `?place=`, `?place=paris`, `?place=ha-noi&place=hue`, `?place=__proto__`, `?place=constructor`, `?place=HA-NOI` → 400 `invalid_input` `{ field: "place" }`; fake fetch call count 0 |
| … › calls api.open-meteo.com with the place's coordinates and fixed params | URL host `api.open-meteo.com`, path `/v1/forecast`, `latitude`/`longitude` equal the constant, `daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max`, `timezone=Asia/Ho_Chi_Minh`, `forecast_days=1`; init has `redirect: "error"` and a `signal`; no cookie/authorization header |
| … › 200 returns the weather shape | `{ weather: { place: "ha-noi", date: "2026-11-18", minC: 18.2, maxC: 23.9, rainChance: 70 } }`, `Cache-Control: no-store` |
| … › second call within TTL hits the cache | 2 requests → 1 fetch |
| … › refetches after TTL | `now` + 1 h + 1 ms → 2 fetches |
| … › refetches on a new VN day | `now` 16:59 UTC → 17:00 UTC same UTC date → 2 fetches (key uses UTC+7 date) |
| … › concurrent calls share one provider fetch | fetch resolves on a deferred; 3 parallel requests → 1 fetch, 3 × 200 |
| … › 502 weather_unavailable on non-2xx, bad JSON, oversized body, missing or out-of-range fields | table: 500; `"<html>"`; 40 KiB body; `daily` missing; arrays empty; `maxC` `"20"`; `minC` 99; `minC > maxC`; `rainChance` 101 / -1; `date` "18/11" |
| … › null rain chance is accepted | `precipitation_probability_max: [null]` → 200 `rainChance: null` |
| … › 504 weather_unavailable on timeout | service built with `timeoutMs: 50` (via `createWeatherService` directly) and a fetch that waits for `signal` abort → `{ ok: false, status: 504 }`; thrown fetch (network) → 502 |
| … › a failure is cached for 5 minutes, then retried | 500 then 200: second call within 5 min → 502 without a fetch; at + 5 min + 1 ms → fetch, 200 |
| … › 61st call in an hour is 429 for that user only | user A: 60 × 200 (cache hits), 61st 429 `rate_limited`; user B 200 |
| … › 405 for non-GET | POST → 405, `Allow: GET` |
| … › logs fixed fields only | captured log entries for success/failure contain only `event, id, place, code, cached` (no lat/lon, URL, body, error object) |
| … › client and server place ids match | imports `../src/constants/weather.ts`: same ids in the same order; 15 ids, each `/^[a-z]+(-[a-z]+)*$/`; coordinates inside 8–24 °N, 102–110 °E |
| `src/data/weather.test.ts` › today calls /api/weather with the place and request options | URL `/api/weather?place=ha-noi`; `redirect: "manual"`, `credentials: "same-origin"`, `cache: "no-store"`, `Accept: application/json` |
| … › returns the parsed weather | fields as sent; `rainChance: null` kept |
| … › maps a thrown fetch / non-ok / bad shape to WeatherError | reject → status 0; 502 → status 502; `{ weather: { maxC: "x" } }` → error; opaque redirect → error |
| `weatherPlace.test.ts` › off by default | empty storage → `null` |
| … › ignores unknown stored ids | stored `"paris"` → `null` |
| … › survives a throwing localStorage | `getItem`/`setItem`/`removeItem` throw → `load` returns `null`, `save` does not throw |
| … › save then load | `save("da-lat")` → `"da-lat"`; `save(null)` removes the key |
| `suggest.test.ts` › weather: no weather gives the F-704.1 result | same items/now/seed with and without `weather: undefined` → deep-equal; mild weather (max 28, rain 10) in July → same main/pieces as no weather |
| … › weather: cold adds Khoác outside Đông | July + `{ maxC: 22 }` → every outfit has the Khoác; reasons include `cold` |
| … › weather: cold makes Đông-tagged items eligible | July, dresses `["Đông"]` and `["Hạ"]` (same wear state): with cold the Đông dress can appear (over seeds 1..20); without weather it never does |
| … › weather: hot drops Khoác in Đông | January + `{ maxC: 33 }` → no Khoác; reasons include `hot` |
| … › weather: hot skips Đông-tagged items when others exist | January + hot: `["Đông"]` dress never appears while a `["Hạ"]` or untagged dress exists; only `["Đông"]` dresses → they are used (fallback) |
| … › weather: rain adds the rain reason | `rainChance: 60` → `rain` on every outfit; 59 → none |
| … › weather: threshold boundaries | `weatherKind`: max 24 → cold, 24.1 → mild; 32 → hot, 31.9 → mild; constants equal 24 / 32 / 60 |
| … › weather: null rain chance is not rain | `rainChance: null` → no `rain` |
| `copy.test.ts` › weather summary | `summary("Hà Nội", 18.4, 23.6, 70)` → `"Hà Nội · 18–24°C · Mưa 70%"`; `rainChance null` → no rain part; reasons cold/hot/rain strings |
| `OutfitsModal.test.tsx` › off by default: no weather call | fake client `today` not called; outfits rendered immediately; picker shows "Tắt" |
| … › picking a place stores it and fetches weather | select "Đà Lạt" → `localStorage["tu-do-weather-place"] === "da-lat"`, `today("da-lat")` called once |
| … › shows the weather summary and credit | stored place + client resolving → summary text, link "Open-Meteo" with `href` https://open-meteo.com/ and `rel` containing `noopener` |
| … › cold weather adds Khoác in July | `vi.setSystemTime` July, client returns max 20 → a Khoác piece is shown |
| … › failing weather client still shows outfits and a short note | client rejects → 3 outfits + unavailable note, no `role="alert"` |
| … › slow weather client: outfits appear after WEATHER_WAIT_MS | never-resolving client, fake timers: loading line first; after `WEATHER_WAIT_MS` outfits + unavailable note |
| … › no weather prop: picker hidden | existing F-704.1 behaviour when the prop is absent |

Existing F-704.1 tests must keep passing unchanged.

## Approach
1. **Places (both sides).** 15 cities, ascii slug ids, in this order:
   `ha-noi` Hà Nội 21.03,105.85 · `hai-phong` Hải Phòng 20.86,106.68 · `ha-long` Hạ Long 20.95,107.08 ·
   `sa-pa` Sa Pa 22.34,103.84 · `thanh-hoa` Thanh Hóa 19.81,105.78 · `vinh` Vinh 18.68,105.68 · `hue` Huế 16.46,107.59 ·
   `da-nang` Đà Nẵng 16.05,108.22 · `quy-nhon` Quy Nhơn 13.78,109.22 · `nha-trang` Nha Trang 12.24,109.19 ·
   `da-lat` Đà Lạt 11.94,108.44 · `buon-ma-thuot` Buôn Ma Thuột 12.67,108.04 · `ho-chi-minh` TP. Hồ Chí Minh 10.78,106.70 ·
   `vung-tau` Vũng Tàu 10.35,107.08 · `can-tho` Cần Thơ 10.03,105.79.
   Client `src/constants/weather.ts` has id + name only; server `server/weather.js` has id + lat/lon only (in a `Map`,
   so `__proto__` cannot match). The parity test keeps the ids equal. City-level coordinates only (no GPS, ticket).
2. **`server/weather.js`** (`// @ts-check`, JS like the rest of `server/`):
   - `WEATHER_LIMITS = { weather: { max: 60, windowMs: HOUR_MS } }`, `WEATHER_GLOBAL_LIMITS = { weather: { max: 600, windowMs: HOUR_MS } }`.
   - `fetchOpenMeteo(fetch, place, timeoutMs)`: URL `https://api.open-meteo.com/v1/forecast?` + `URLSearchParams` from
     constants only; `fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) })`
     (no custom User-Agent, nothing identifying); `!res.ok` → `{ ok: false, status: 502 }`; body via `readCapped(res, 32 * 1024)`
     (import from `./ai/readCapped.js`); abort/timeout (`err.name === "TimeoutError" || "AbortError"`) → 504; any other throw → 502.
   - `parseForecast(json)`: `daily.time[0]` matches `/^\d{4}-\d{2}-\d{2}$/`; `minC`, `maxC` finite numbers in −40..60 with
     `minC ≤ maxC`; `rainChance` finite 0..100 or `null`; else 502. Returns `{ date, minC, maxC, rainChance }`.
   - `createWeatherService({ fetch, now, ttlMs = 3_600_000, failTtlMs = 300_000, timeoutMs = 4000 })` → `{ get(placeId) }`.
     `Map` keyed `${placeId}|${vnDate(now())}` (`vnDate` = `new Date(t + 7h).toISOString().slice(0, 10)`), entry
     `{ expires, promise }`. On `get`: delete entries with `expires <= now()`; if an entry exists return its promise with
     `cached: true` (pending promises have `expires = Infinity` → single-flight); else store a new promise, and when it
     settles set `expires = now() + (ok ? ttlMs : failTtlMs)`. The list bounds the map (≤ 15 places × 2 dates).
     The promise never rejects (always `{ ok, ... }`).
   - `handleWeather(req, res, { weather, userId, query, id, log })`: `const places = new URLSearchParams(query).getAll("place")`;
     exactly one and `WEATHER_PLACES.has(it)` else 400 `invalid_input` `{ field: "place" }`; `weather.limiter.check(userId, "weather")`
     else 429 `rate_limited`; `r = await weather.service.get(place)`; ok → `sendJson(res, 200, { weather: { place, ...r.value } })`;
     else `sendError(res, r.status, "weather_unavailable")`. Log `{ event: "weather", id, place?, code, cached? }` only (R5-style
     fixed fields; no URL, coordinates, body or error object).
   The rate limit counts before the cache, so cache hits count too (simple, bounded; 60/h is plenty for a modal).
3. **Wiring.** `app.js` builds `weather` once per app instance (independent of `pool` and `ai`), passes it to `handleApi`;
   `api.js` adds the route (GET only; existing 405/404 handling applies) and dispatches before the `itemId` checks.
   No change to `index.js` (default `globalThis.fetch`), CSP (`connect-src` unchanged: only the server calls the provider),
   `.env.example` (no key) or Docker.
4. **`src/data/weather.ts`.** `export type Weather = { place: string; date: string; minC: number; maxC: number; rainChance: number | null }`;
   `WeatherError(status)`; `createHttpWeather(fetchFn = (...a) => fetch(...a), base = "/api", auth = {})` using
   `createAuthedFetch` like `aiSettings.ts`: `GET ${base}/weather?place=${encodeURIComponent(id)}` with
   `Accept: application/json`, `cache: "no-store"`, `credentials: "same-origin"`, `redirect: "manual"`; any throw, non-ok,
   bad JSON or bad shape (finite numbers, `rainChance` number or null) → `WeatherError`. `export interface WeatherClient { today(placeId: string): Promise<Weather> }`.
5. **`weatherPlace.ts`.** `loadWeatherPlace(): string | null` reads `localStorage[WEATHER_PLACE_KEY]` in try/catch and
   returns it only if `isWeatherPlaceId`; `saveWeatherPlace(id: string | null)` sets or removes in try/catch.
6. **`suggest.ts`.**
   `export const WEATHER_COLD_MAX_C = 24`, `WEATHER_HOT_MAX_C = 32`, `WEATHER_RAIN_CHANCE = 60`;
   `export type WeatherInput = { minC: number; maxC: number; rainChance: number | null }`;
   `export function weatherKind(w?: WeatherInput) → { cold: boolean; hot: boolean; rain: boolean }`
   (`cold = maxC ≤ 24`, `hot = maxC ≥ 32`, `rain = rainChance !== null && rainChance ≥ 60`; all false without `w`).
   `SuggestOptions.weather?: WeatherInput`. Wanted seasons: start `[season]`; cold → add `"Đông"`, remove `"Hạ"`;
   hot → add `"Hạ"`, remove `"Đông"`. `inSeason(i) = i.seasons.length === 0 || i.seasons.some((s) => wanted.includes(s))`
   (the existing pool fallback is unchanged). Outer: `cold || (!hot && COLD_SEASONS.includes(season))`.
   `OutfitReason` gains `"cold" | "hot" | "rain"`, appended after the existing ones on every outfit when the kind holds.
   Without weather nothing changes, including PRNG call order (`rank("outer")` is still called only when outer is used).
   `Suggestion` shape unchanged.
7. **UI.** Copy in `copy.ts`: `reasons.cold: "Trời lạnh"`, `reasons.hot: "Trời nóng"`, `reasons.rain: "Có thể mưa"`;
   `weather: { label: "Thời tiết", off: "Tắt", loading: "Đang xem thời tiết…", unavailable: "Chưa lấy được thời tiết, gợi ý theo mùa.",
   summary: (name, min, max, rain) => \`${name} · ${Math.round(min)}–${Math.round(max)}°C\` + (rain === null ? "" : \` · Mưa ${Math.round(rain)}%\`),
   credit: "Open-Meteo", creditUrl: "https://open-meteo.com/" }`. The chip renderer maps `cold/hot/rain` through `COPY.reasons`.
   `OutfitsModal` gets `weather?: WeatherClient`; `export const WEATHER_WAIT_MS = 5000`.
   State: `place` (`useState(loadWeatherPlace)`), `status: "off" | "loading" | "ready" | "failed"`, `data: Weather | null`.
   Effect on `[place, weather]`: no client or no place → `off`; else `loading`, `Promise.race([weather.today(place), timeout(WEATHER_WAIT_MS)])`
   → `ready` + data or `failed`; a `cancelled` flag ignores stale results. `now` and `seed` stay as in F-704.1, so the set
   does not reshuffle once shown. While `loading`, show the loading line instead of the cards and the "Đổi gợi ý" button
   (at most 5 s). `suggestOutfits(..., { now, seed, avoid, weather: status === "ready" ? data : undefined })`.
   Above the season line, only when the prop is present: `.outfit-weather` row with `<label>{label} <select>` (options
   "Tắt" + the 15 cities) and, when `ready`, the summary + credit link (`target="_blank" rel="noopener noreferrer"`);
   when `failed`, the unavailable note (muted text, no alert). Changing the select calls `saveWeatherPlace` and `setPlace`.
   `App.tsx`: one `useMemo` client + one prop.
8. **CSS.** `.outfit-weather` flex-wrap row, gap, `color: var(--muted)`, font-size like `.outfit-season`; the select
   uses `var(--surface)`, `var(--border)`, `var(--text)` tokens, min-height 40px, max-width 100%; no fixed widths so it
   fits 390px.
9. **One-off Playwright check (D42, AC 10): `weather-verify.cjs`, in the session scratchpad, not committed.** Same harness
   as F-704.1's `outfits-verify.cjs` (`pnpm dev --port 5199 --strictPort`, `page.route` mocks for `**/healthz`,
   `**/api/items`, `**/api/locations`, plus `**/api/weather**` → `{ weather: { place: "ha-noi", date, minC: 18, maxC: 22, rainChance: 70 } }`).
   Contexts 390×844 (mobile, touch) and 1280×800, light/dark via `localStorage["tu-do-theme"]`; preset
   `localStorage["tu-do-weather-place"] = "ha-noi"`. Assert: summary text and credit visible; select fully inside the
   modal; `scrollWidth <= innerWidth`; select background ≠ white in dark and text contrast ≥ 4.5; a Khoác piece and the
   rain chip are shown; then mock weather as 500 → outfits still render with the note. Screenshots for 4 combos; record
   command, output and paths in impl-log.
10. Checks: `pnpm format`, then `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Specialist input used
From `consult-software-architect.md`:
- Adopted: curated server-side place list, `GET /api/weather?place=<id>`, URL only from constants (no SSRF, one host).
- Adopted: localStorage per device (Ming confirmed), no table/migration.
- Adopted: Open-Meteo params, `AbortSignal.timeout(4000)`, `redirect: "error"`, `readCapped` 32 KiB, strict validation,
  response `{ weather: { place, date, minC, maxC, rainChance } }`, 502/504 `weather_unavailable`, fixed-field logs.
- Adopted: in-memory cache keyed `place|VN date`, 1 h TTL, failures ~5 min; size bounded by the list.
- Changed: single-flight by storing the pending promise in the cache map, not `inflight.js` (that module is an in-flight
  counter/cap, not request coalescing).
- Adopted: separate `createLimiter` 60/h per user, 600/h global, owner exempt from global as elsewhere.
- Adopted: `src/data/weather.ts` like `aiSettings`, injected into `OutfitsModal`; wait ≤ ~5 s, fixed seed.
- Adopted with Ming's numbers: thresholds cold max ≤ 24 (consult proposed 20), hot max ≥ 32, rain ≥ 60; consult's extra
  "or minC ≥ 25" hot rule dropped (not in Ming's answer). Weather widens/narrows season eligibility and decides outer.
- Adopted: reasons via copy (R6); Open-Meteo credit on the summary line (CC BY 4.0).
- Rejected: 2a/2b split (Ming chose one ticket).

## Assumptions
- A1: Rain chance `null` from the provider is accepted and treated as "no rain" (provider gaps should not hide temperatures).
- A2: The place picker lives in the outfits modal (where the summary is), not in the Settings modal — the ticket only
  says "a setting … picked from a short list"; this keeps the diff out of the Settings/AI UI.
- A3: Cache hits count against the per-user limit (60/h); a user opening the modal 60+ times an hour falls back to
  season rules (failure path), which is acceptable.
- A4: The cache is per process; a restart refetches. Ming's single container makes this enough.
- A5: Weather reasons (`cold`/`hot`/`rain`) are shown on every outfit, since weather applies to the whole day.
- A6: Size: roughly 350 lines of code + 450 lines of tests (~800), over the ~400 guide; Ming chose one ticket, and the
  test files carry most of it.
- A7: Hotspot: `src/App.tsx` (≤ 6 lines). No other ticket is IN_PROGRESS / REVIEW / DONE on the board now.
- A8: Open-Meteo free tier is non-commercial (consult risk); fine for the personal app.

## Blocking questions
None.

## Split proposal
None (Ming: one ticket).
