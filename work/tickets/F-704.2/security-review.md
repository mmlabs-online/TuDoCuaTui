# Security review — F-704.2

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-18

**Overall result: PASS. No 🔴 blockers; 2 🟡 non-blocking findings.** Code read only; no edits, commits or check runs.

### Findings
🟡 **1. Any 10 users can switch weather off for everyone else for an hour** (`server/weather.js:15`, `server/weather.js:145`).
- The limiter counts every call before the cache is checked (plan assumption A3), so the global ceiling of 600/h is
  used up by cache hits too. Ten accounts each sending 60 cache-hit requests reach it; every other non-owner then gets
  429 for the rest of the hour. Small damage: the modal falls back to season rules and the owner is exempt from the
  global limit. The global limit adds no outbound protection, because the cache already caps provider calls at about
  15 places × 24 refreshes per day plus a retry every 5 minutes after a failure.
- Fix (pick one): count the global limit only on a cache miss (check it inside `service.get` just before
  `fetchOpenMeteo`), or raise `WEATHER_GLOBAL_LIMITS.weather.max` well above 10 × the per-user max. Reasonable as a
  follow-up rather than rework.

🟡 **2. The 5-second wait timer is never cleared** (`src/features/outfits/OutfitsModal.tsx:45-47`). Not a security issue:
the `cancelled` flag stops stale updates and `Promise.race` already handles the timeout promise, so nothing fires late
and there is no unhandled rejection. Fix: keep the `setTimeout` id and `clearTimeout` it in the cleanup and once the
race settles.

### Verified as correct
- **SSRF:** the URL is a fixed `https://api.open-meteo.com/v1/forecast?` plus `URLSearchParams` built only from constant
  lat/lon in `WEATHER_PLACES` and literals (`server/weather.js:62-70`). The place must be exactly one `place` parameter
  and a key of a `Map` (`:139-141`), so `__proto__`/`constructor` are rejected; nothing user-sent reaches the URL.
- **Outbound hardening:** `redirect: "error"`, `AbortSignal.timeout(4000)`, `Accept` as the only header, no cookies or
  authorization forwarded. The body is read via `readCapped` (32 KiB; `server/ai/readCapped.js`), which cancels the
  reader when over the cap and returns null on unparsable JSON. The timeout also covers the body read (stalled body →
  504). All throws are caught (`:78-81`), so the stored promise never rejects.
- **Response validation:** `parseForecast` (`:43-53`) checks the date with a regex, finite numbers in -40..60 with
  min ≤ max, rain chance 0..100 or null; it builds a new four-field object, so no provider fields are copied through
  (no prototype-pollution path). The spread at `:152` spreads only that object.
- **Cache size:** keys are `<validated id>|<VN date>` (at most 15 × 2 live entries); expired entries swept on every
  `get`; pending entries use `expires = Infinity` (single-flight), bounded by the 4 s timeout; failures cached 5 min.
- **Auth and rate limits:** `/api/*` goes through `auth.authenticate` before `handleApi` (`server/app.js:117-123`); the
  weather route is dispatched inside `handleApi` (`server/api.js:110-112`), GET only with the usual 405. Separate
  per-user limiter (60/h) and global (600/h, owner exempt), wired at `server/app.js:50`.
- **Errors and logs:** `sendError(..., "weather_unavailable")` with no details, status 502 or 504 only; no provider URL,
  body or exception exposed. Logs carry only `event, id, place, code, cached`; `place` is logged only after validation
  (test at `server/weather.test.ts:247`).
- **Secrets and config:** no new env variable, key or `VITE_*`; `open-meteo` appears only in `server/weather.js`, its
  tests, the README and the credit URL in `copy.ts`.
- **CSP:** no change needed; `connect-src` (`server/http.js:13`) is unchanged because only the server calls the provider.
- **localStorage:** `src/features/outfits/weatherPlace.ts` wraps every access in try/catch; reads accept only values
  passing `isWeatherPlaceId`; writes save only listed ids and remove the key otherwise; only a city id is stored.
- **Client:** `src/data/weather.ts` URL-encodes the id, uses `redirect: "manual"`, `credentials: "same-origin"`,
  `cache: "no-store"`, validates the response shape; React escapes the summary text. The credit link
  (`OutfitsModal.tsx:112`) has `target="_blank" rel="noopener noreferrer"` and a constant URL.

### Follow-ups (outside this ticket)
- If finding 1 is not fixed here, record "count the global weather limit only on a cache miss" as a follow-up.
