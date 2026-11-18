## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| server/weather.js (new) | Place list, Open-Meteo call, validation, cache + single-flight, limiter, route handler |
| server/weather.test.ts (new) | AC 3-6, 8 |
| server/api.js | Route `/api/weather` (GET) and dispatch |
| server/app.js | `weatherFetch` dep, per-instance weather service + limiter |
| server/README.md | API docs row |
| src/constants/weather.ts (new) | 15 cities, ids <-> names (R6) |
| src/data/weather.ts (new), weather.test.ts (new) | Client (aiSettings pattern), tests |
| src/features/outfits/weatherPlace.ts (new), weatherPlace.test.ts (new) | Per-device place setting |
| src/features/outfits/suggest.ts, suggest.test.ts | Weather rules and tests |
| src/features/outfits/copy.ts, copy.test.ts | Vietnamese copy |
| src/features/outfits/OutfitsModal.tsx, OutfitsModal.test.tsx | Picker, summary, fetch with 5 s wait |
| src/App.tsx | Wiring only (+6 lines) |
| src/index.css | `.outfit-weather` styles |

### Tests added / changed
- server/weather.test.ts: every test the plan lists (400 table, provider URL/params, 200 shape, null rain, 502 table, 504/502, cache TTL / VN day / single-flight / failure cache, 61st call 429, 405, fixed-field logs, client/server place parity) plus a `parseForecast` sanity test. Fake `fetch` only; the real Open-Meteo is never called.
- src/data/weather.test.ts (3), weatherPlace.test.ts (4), suggest.test.ts "weather" block (8), copy.test.ts "weather summary", OutfitsModal.test.tsx (7 incl. "no weather prop: picker hidden"). No App-level tests (BUG-006).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: All matched files use the correct format (318 files)
- test: Test Files 128 passed | 11 skipped (139); Tests 1658 passed | 221 skipped (1879)
- build: built in 886ms

### Playwright check (D42, one-off, not committed)
- Script: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-2/weather-verify.cjs (dev server `pnpm dev --port 5199 --strictPort`; mocks /healthz, /api/items, /api/locations, /api/weather; place preset to ha-noi).
- Command: `NODE_PATH=$(npm root -g) node weather-verify.cjs` -> exit 0, `failures: []`; summary: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-2/summary.json
- Combos: 390x844 and 1280x800, light and dark. Asserted: summary "Hà Nội · 18–22°C · Mưa 70%" and Open-Meteo link visible; chips "Trời lạnh" and "Có thể mưa" on all outfits; Khoác piece shown; select inside the modal, height 40px, no horizontal scroll; dark select background rgb(28, 42, 36), contrast 14.14 (light also >= 4.5).
- Extra: HCMC 34 °C in November (season Đông, which alone adds Khoác): 0 Khoác pieces and "Trời nóng" chips. Weather 502: 3 outfits, note "Chưa lấy được thời tiết, gợi ý theo mùa." visible, 0 role=alert.
- Screenshots (viewed 390 dark and 1280 light, layout fine, picker and summary wrap cleanly at 390): /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-2/weather-light-390.png, weather-dark-390.png, weather-light-1280.png, weather-dark-1280.png, weather-hot-390.png, weather-failed-390.png

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Ming: allow egress to `api.open-meteo.com` from the home-server container (no allowlist in compose per the consult; verify after deploy).
- The 5 s timer in the modal is not cleared when weather resolves early (harmless; the race ignores it).
- Open-Meteo free tier is non-commercial (A8).

### Scope self-check
- Could the diff be smaller? No; code is ~350 lines plus tests as planned.
- Diff size: +356 / -9 on tracked files, plus 7 new files.
