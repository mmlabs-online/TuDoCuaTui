# Security review — T-013.2

## Attempt 1 (2026-11-11) — security-ai-generated-code-auditor

No 🔴 blockers. Code read only; nothing run; no .env read.

### 🟡 Should fix
1. **Streamed (chunked) body over the cap may get ECONNRESET instead of the JSON 413** — `server/http.js:54-56`, `server/api.js:60-61`. `return tooBig` exits the `for await`, destroying `req` (and its socket) before `sendError(... Connection: close)` flushes. Cap and memory bound hold; AC row 12 behaviour not dependable. Fix: keep draining without collecting once over the limit, or pause `req`, send the 413 with `Connection: close`, destroy the socket on `res` `finish`. Test: chunked upload in several delayed writes.
2. **NUL (`\u0000`) in any string field → 500 `internal`** — `server/validate.js:50-56,63-73,80-82,122-128`; `server/errors.js:4`. Postgres rejects with `22021`, not in `BAD_INPUT`. Breaks AC2. Fix: reject NUL in `optString`/`stringArray`/`name`/`location_name` with `invalidValue` (preferred) or map `22021` → 400; tests in `validate.test.ts` and `errors.test.ts`.

### 🟢 Notes
1. SQL injection clean — all values `$n` (`items.js:34-126`); fixed ORDER BY/columns; UUID check before use (`api.js:49-52`).
2. Auth bypass clean — `handleApi` only after `access.verify` (`app.js:59-77`), raw `pathname`, no re-parse/decode (`api.js:33`); encoded ids → `idInvalid`.
3. CSRF sound — `Sec-Fetch-Site` cross-site/same-site → 403 (`api.js:44-48`); JSON content type forces preflight; no CORS headers.
4. Mass assignment clean — fixed key list (`validate.js:139-156`); `id` from path; `created_at` never updated (`items.js:65-70`).
5. Prototype pollution: no exposure (tested `validate.test.ts:144`).
6. Error leakage clean — responses carry `code` (+`requestId` on 500); logs carry `code`/`constraint`/`routine` (`errors.js:35-44`); no `DATABASE_URL`.
7. Transactions correct (`items.js:50-94`). Optional: `release(err)` only for connection-class errors, so healthy connections survive constraint errors.
8. Pool bounded (`db.js:10-29`); exhaustion → 503 in ~3 s.
9. Body reading: declared over-limit refused up front; fatal UTF-8 decode → 400; parse errors incl. RangeError → 400; lone surrogates stored as U+FFFD (acceptable).
10. Unread bodies on early returns/DELETE drain uncapped on keep-alive; Node default timeouts; no `maxConnections`. Low risk (behind Access + JWT). Follow-up (index.js, out of scope): `server.requestTimeout` ~30 s, `maxConnections`, `Connection: close` on early returns with a body.
11. Validation limits bounded (arrays ≤50 × ≤50 cp; text caps; price, dates, delta, today window).
12. No pagination on `GET /api/items` — fine for one user; follow-up if large.
13. Add `server/api.js`, `server/items.js` to `.github/risk-tiers.yml` (plan follow-up).

### Risks / open questions
- `TUDO_ACCESS_DISABLED=1` opens the API fully by design; must never be set in production (T-015).

## Attempt 2 (2026-11-11) — security-ai-generated-code-auditor (commit b87d67b)

Both attempt-1 🟡 fixed. No 🔴, nothing new above 🟢. Code read only.

1. **NUL fixed** — `server/validate.js:26` `hasNul` in `optString` (:55), `stringArray` (:72), `name` (:84), `location_name` (:129), all before `trim()`; enum/regex fields can't carry NUL; backstop `server/errors.js:4` `22021` → 400. Tests `validate.test.ts:26-42` (9 fields + field name), `errors.test.ts:9`.
2. **Chunked 413 fixed (best-effort)** — `server/http.js:55-66` data/end/error events, overflow removes data listener, pauses `req`, resolves; `server/api.js:60-63` 413 + `Connection: close`, `req.socket.destroy()` on `finish`. Test `api.test.ts:190-207` (64 KB every 20 ms). No memory growth, harmless double resolve, no unhandled `'error'`, no listener leak, paused `req` cannot outlive the response.

### 🟢 Notes
1. Promise can hang if `req` was already destroyed before listeners attach (`http.js:55-66`) — not a leak (GC'd), only a missing access-log line. Hardening: resolve on `'close'` and/or return early on `req.destroyed`.
2. On `'error'` the partial body is still parsed (`http.js:65`) — truncated JSON → 400 in practice. Cleaner: an "aborted" state that skips all processing.
3. 413 delivery is best-effort (`api.js:62`): destroy with unread bytes → TCP RST may lose the 413; fine on loopback/cloudflared normally. Full fix: lingering close. If `api.test.ts:190` flakes, this is why.
4. Optional tests: mid-body client abort (handler finishes, no DB work); `req.listenerCount("data") === 0` after overflow.
5. Attempt-1 follow-ups stand: `server.requestTimeout`, `maxConnections`, risk-tiers entries.
