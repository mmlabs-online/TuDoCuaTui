Verdict: PASS

## Attempt 1 — 2026-11-18

### Checks (run by reviewer)
- `pnpm typecheck` — `tsc --noEmit && tsc -p tsconfig.server.json` clean (exit 0).
- `pnpm format:check` — "All matched files use the correct format." (318 files).
- `pnpm test` — Tests 1658 passed | 221 skipped (1879), exit 0. Matches impl-log.
- `pnpm build` — built in 592 ms, exit 0.
- Playwright (D42, one-off): re-ran `weather-verify.cjs` against a fresh `pnpm dev --port 5199 --strictPort` → exit 0,
  `failures: []`. 390×844 and 1280×800, light and dark: summary "Hà Nội · 18–22°C · Mưa 70% · Open-Meteo", "Trời lạnh" and
  "Có thể mưa" chips, a Khoác piece in each outfit, select 40 px high inside the modal, no horizontal scroll, contrast
  17.12 (light) / 14.14 (dark, select bg rgb(28, 42, 36)). Hot HCMC 34 °C in November: 0 Khoác, "Trời nóng" chips.
  Weather 502: 3 outfits, the note visible, 0 `role="alert"`. Screenshots viewed (390 light/dark, 1280 light/dark, hot,
  failed): layout clean in both themes, picker and summary wrap fine at 390 px. The script's hot/failed screenshots are
  taken during the 0.2 s modal fade (page bleeds through); I re-took them after 500 ms (`weather-hot-390-settled.png`,
  `weather-failed-390-settled.png` in the scratchpad `f-704-2/` folder) and both are clean. Script artifact, not a product issue.

### Acceptance criteria
- [x] 1. Cold/hot/rain change suggestions; thresholds exported — `suggest.ts:41-54` (`WEATHER_COLD_MAX_C = 24`,
  `WEATHER_HOT_MAX_C = 32`, `WEATHER_RAIN_CHANCE = 60`, `maxC <= 24`, `maxC >= 32`, `rainChance >= 60`); tests
  `suggest.test.ts` › weather block (8 tests incl. boundaries 24/24.1, 32/31.9, 60/59) pass.
- [x] Without weather, output identical to F-704.1 — `wanted = [season]` makes `inSeason` equivalent to the old
  `includes(season)`, outer condition reduces to `COLD_SEASONS.includes(season)`, PRNG call order unchanged; test
  "weather: no weather gives the F-704.1 result" deep-equals with `run(items)`; all F-704.1 tests unchanged and green.
- [x] 2. Failure/timeout never blocks suggestions — `OutfitsModal.tsx` `Promise.race` with `WEATHER_WAIT_MS = 5000`,
  rejection → `failed` → suggestions without weather; tests "failing weather client still shows outfits and a short note",
  "slow weather client: outfits appear after WEATHER_WAIT_MS"; client errors mapped to `WeatherError`
  (`src/data/weather.test.ts`). Playwright 502 case confirms.
- [x] 3. Place validated against the fixed list only — `server/weather.js:139-144` (`getAll("place")`, exactly one,
  `WEATHER_PLACES` is a `Map` so `__proto__`/`constructor` cannot match); test "400 for missing, unknown, repeated or
  prototype-key place; provider not called".
- [x] 4. Cache 1 h per place + VN day, single-flight, failures 5 min — `server/weather.js:89-113` (pending promise stored
  with `expires: Infinity`, key `place|UTC+7 date`, sweep of expired entries bounds the map); tests "second call within
  TTL…", "refetches after TTL", "refetches on a new VN day", "concurrent calls share one provider fetch", "a failure is
  cached for 5 minutes, then retried".
- [x] 5. Outbound safety — URL built only from constants and the Map's lat/lon (`server/weather.js:62-70`, no user input
  reaches the URL: no SSRF, one host); `redirect: "error"`, `AbortSignal.timeout(4000)` (covers body read too),
  `readCapped` 32 KiB, strict `parseForecast` (date regex, finite −40..60, `minC ≤ maxC`, rain 0..100 or null); tests
  "calls api.open-meteo.com…", "502 … table" (11 cases), "504 on timeout, 502 on a network error".
- [x] 6. Separate per-user limiter — `createWeather` builds its own `createLimiter` with `WEATHER_LIMITS` (60/h) and
  `WEATHER_GLOBAL_LIMITS` (600/h), not the AI one; test "61st call in an hour is 429 for that user only". Endpoint sits
  behind the existing `/api` authentication (`server/app.js` `auth.authenticate` before `handleApi`).
- [x] 7. No new secret / env — `.env.example` not in the diff, no `VITE_*`, no new env var; `open-meteo` appears only in
  `server/weather.js:70` and the credit link `copy.ts:24`. Logs fixed fields only (test "logs fixed fields only").
  Error shape via `sendError` (`{ error: { code, details? } }`), codes `invalid_input`/`rate_limited`/`weather_unavailable`
  consistent with the rest of `server/`; 405 via the existing `match` path.
- [x] 8. Per device, off by default, fixed list — `weatherPlace.ts` read/write wrapped in try/catch, validated with
  `isWeatherPlaceId`; tests "is off by default", "ignores unknown stored ids", "survives a throwing localStorage",
  "save then load"; modal tests "off by default: no weather call", "picking a place stores it and fetches weather";
  parity test "client and server place ids match".
- [x] 9. Summary line + Open-Meteo credit (`target="_blank" rel="noopener noreferrer"`) — modal test "shows the weather
  summary and credit", `copy.test.ts` › "weather summary"; Playwright confirms.
- [x] 10. 390 px and dark mode — Playwright run above; `.outfit-weather` uses tokens only (`src/index.css`).
- [x] 11. All checks pass — see above.

Client wiring: `src/data/weather.ts` follows the `aiSettings` pattern (`createAuthedFetch`, `redirect: "manual"`,
`cache: "no-store"`, shape validation); no component calls `fetch` (R1 spirit). `App.tsx` change is wiring only (+6
lines: import, `useMemo` client, prop). No App-level tests added (BUG-006). Tests never reach the real API: server tests
inject `weatherFetch` fakes; other server tests never hit `/api/weather`; client tests use fake clients, and the place
is off by default.

### Scope
Every changed file is in the plan's file list. `work/ming-todo.md` (M-31) was changed by the orchestrator's
plan-gate commits (ced2f01, 2286c7a), not by the implementation. High paths touched (`server/**`) were named in the plan
and approved by Ming.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1 (injected client, no fetch in components, no fallback data), R3 (no key, no new env), R6 (copy
in `copy.ts`, labels ↔ ids in `src/constants/weather.ts`), R7 (in plan), R8 (pure logic and route tested), R9 (390 px +
dark verified).

### Blockers from review agents
Security auditor runs in parallel; the orchestrator adds any 🔴 finding here.
None — security-review.md attempt 1: PASS, no 🔴 (two 🟡: global limit counts cache hits; 5 s timer not cleared).

### Nits (do not block)
- 💭 `OutfitsModal.tsx` effect: the 5 s `setTimeout` in the race is not cleared on cleanup/early resolve (harmless; noted
  in impl-log follow-ups).
- 💭 `suggest.ts`: with `hot` in Hạ the `wanted` array becomes `["Hạ", "Hạ"]` (harmless duplicate).
- 💭 Cold in a Hạ month removes Hạ from `wanted` (Hạ-only items drop to the pool fallback) — as planned; worth Ming's
  eye when tuning thresholds.
- 💭 `weather-verify.cjs` takes the hot/failed screenshots during the modal fade-in; add a short wait next time.

### Ming verification after merge
- After deploy: the container reaches `api.open-meteo.com`; open "Hôm nay mặc gì?", pick a city, the summary shows
  today's min–max and rain chance.
- On a cold/rainy day (or Sa Pa / Đà Lạt): Khoác appears and the rain chip shows; on a hot HCMC day no Khoác. Tune
  thresholds if needed.
- Light and dark on the phone.

### Follow-ups (out of scope)
- Open-Meteo free tier is non-commercial (A8); revisit if the app gets other users.
- The modal hides suggestions for up to 5 s while weather loads; consider showing season suggestions first if it feels slow.
