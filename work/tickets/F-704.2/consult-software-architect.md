# F-704.2 consult — software-architect (2026-11-18)

## Findings
- No settings table exists apart from `ai_settings` (per user, keyed on `user_id`, RLS; D33/D32). A new table means
  `schema.db.test.ts` and `rls.db.test.ts` (they hard-code "five tables") need updating. A new table is additive, so
  an older image can still roll back over it.
- `server/ai/rateLimit.js#createLimiter` already takes custom `limits`/`globalLimits` (F-602 uses it). `readCapped.js`,
  `inflight.js` and the `AbortSignal.timeout` pattern in `claude.js` can be reused.
- The container already has general egress (JWKS, Drive, Claude/Gemini); the compose file has no host allowlist. CSP
  `connect-src` does not change, because only the server calls the provider.
- `suggestOutfits` is pure and its season comes only from the month — already wrong for Ho Chi Minh City; weather fixes it.
- AI settings use a separate client (`createHttpAiSettings`), not `WardrobeRepo`, so weather has a precedent to follow.

## Recommendations
1. **Curated place list, no geocoding.** A server constant of about 15 VN cities `{id, name, lat, lon}`;
   `GET /api/weather?place=<id>` accepts only a known id. The outbound URL is built only from these constants: no
   user-controlled URL (no SSRF) and only one host (`api.open-meteo.com`). Free text + geocoding would add a second
   host, user strings sent to a third party, and an unbounded cache.
2. **Place storage, cheapest:** city id in `localStorage` (try/catch, off by default). Coarse, a UI preference, not
   wardrobe data, so R1/D44 are unaffected and no migration. Trade-off: per device. Per user on the server instead
   needs a `weather_settings(user_id pk, place_id text check, …)` table with ENABLE+FORCE RLS in the same migration —
   a second High path plus the test updates above.
3. **Outbound call:** `forecast_days=1&timezone=Asia/Ho_Chi_Minh&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max`;
   `AbortSignal.timeout(4000)`, `redirect:"error"`, `readCapped` 32 KiB; validate finite, in-range numbers. Response
   `{weather:{place, date, minC, maxC, rainChance}}` or 502/504 `weather_unavailable`. Log fixed fields only.
4. **Cache:** in-memory `Map` keyed `placeId|VN date`, 1 h TTL, single-flight via `inflight.js`; cache failures ~5 min.
   The list caps the size; no DB.
5. **Rate limit:** a separate `createLimiter`, ~60/h per user and 600/h global. Outbound calls are already capped at
   roughly places × 24 per day.
6. **Client:** `src/data/weather.ts` `createHttpWeather` (same pattern as aiSettings), injected into `OutfitsModal`.
   With weather on, wait at most ~5 s (longer than the server timeout), then render either way; keep the seed fixed so
   suggestions do not reshuffle.
7. **`suggest()`:** optional `weather?: {minC, maxC, rainChance}`; exported thresholds: cold `maxC ≤ 20` → add outer,
   prefer Đông items; hot `maxC ≥ 32` (or `minC ≥ 25`) → no outer, demote Đông; rain `≥ 60%` → reason `rain`. Weather
   overrides the month season for the outer choice. New reasons `cold`/`hot`/`rain` via copy (R6).
8. **Deploy:** no new env and no secret (Open-Meteo needs no key); `.env.example` unchanged; hard-coded base URL. Show an
   "Open-Meteo" credit on the summary line (CC BY 4.0).
9. **Split:** F-704.2a — suggest rules, weather summary UI and setting, with a fake client (not High). F-704.2b — server
   endpoint, cache, limiter and HTTP client (High, `plan-approval`).

## Risks
- Open-Meteo's free tier is non-commercial only: fine for a personal app, may matter if others use it later.
- Thresholds that suit Hà Nội mislabel Ho Chi Minh City days; tune with Ming.
- Waiting for weather can delay the modal by up to ~5 s when the provider is slow.

## Open questions (for Ming)
1. Is Open-Meteo OK?
2. A fixed city list, or free text (needs geocoding and a second host)?
3. Place per device (localStorage, no migration) or per account (new table, migration)?
4. Thresholds OK: cold ≤ 20 °C, hot ≥ 32 °C, rain ≥ 60%?
5. Split into 2a/2b OK?
