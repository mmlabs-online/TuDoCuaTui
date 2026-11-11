# Security review — T-013 (slice T-013.1)

## Attempt 1 (2026-11-10) — security-ai-generated-code-auditor

No 🔴 blockers. Static read only; no .env read; tests not run.

Sound: Access JWT (`server/access.js:48-53` RS256, issuer, audience, 30 s tolerance; team-domain regex `:7,17` blocks SSRF/host injection; any jwtVerify/JWKS failure → 401 `:55-58`, `app.js:57-62`; header only; `TUDO_ACCESS_DISABLED` refused in production `:28-31`, exit 2 `index.js:27-29`; only jose `err.code` logged `app.js:60`). Static serving contained (`static.js:36-46`: bad encoding/NUL/backslash → bad; dot segments → notFound; root containment; no directory listing; MIME allow-map; nosniff/Referrer-Policy/X-Frame-Options on every response). Secrets: DATABASE_URL only into `pg.Pool`; logs use code/name and route templates; `index.cli.test.ts:66-82` leak test. Pool max 5, 3 s connect, 5 s statement_timeout, per-pool date parser. No body reads; Node default timeouts; jose JWKS cooldown. `src/**` imports no `jose`/`pg`/`server/`.

### 🟡 Should fix
1. **fd leak on aborted downloads** — `server/static.js:91-93`: `stream.pipe(res)` doesn't destroy the read stream when `res` closes early; a `web` neighbour could exhaust fds. Fix: `pipeline(fs.createReadStream(file), res, () => {})` from `node:stream`.
2. **Non-origin-form request URLs / single pathname for T-013.2** — `server/app.js:38,55`: absolute-form (`GET http://x/api/items`) or `/%61pi/items` miss the `/api` prefix and fall to static (harmless now). Fix: 400 `bad_request` when `req.url` doesn't start with `/`; T-013.2 dispatches only from the same `pathname` inside the guarded branch; add an app.test case for absolute-form.

### 🟢 Notes
3. Symlinks in `dist/` followed by `fs.stat` (`static.js:48`); optional `realpath` containment.
4. Prod check needs exact `NODE_ENV=production` (`access.js:29`); T-015 must set it and never set `TUDO_ACCESS_DISABLED`; smoke test `/api` → 401; optionally log "access check OFF" as warning.
5. Any valid token for the AUD is accepted (no email/sub check) — keep the Access policy limited to Ming; no Service Auth policy.
6. No CSP/HSTS (same as nginx; HSTS at the edge). CSP is a follow-up.
7. Unauthenticated `/readyz` runs `select 1` per request; bounded by pool/timeout (A2).
8. `server/README.md:11` undersells fail-closed (missing vars exit 2 in every env unless disabled outside production).
9. `access.test.ts:162-168` can pass without asserting; add `expect.assertions(1)` or `toThrow`.
10. No request id on `access_denied` / `readyz_failed` lines (`app.js:50,60`).

### Risks / open questions
- Prod fail-closed depends on T-015's `NODE_ENV` and outbound HTTPS to `<team>.cloudflareaccess.com` (A6); blocked egress = every `/api` 401 (safe but outage).
- Will T-015 set `NODE_ENV=production` in the Dockerfile or only in compose?

## Attempt 2 (2026-11-11) — security-ai-generated-code-auditor (commit f047bd6)

Both attempt-1 🟡 fixed. No 🔴, no new 🟡. Code read only.

### 🟢 Notes
1. **fd leak fixed** — `server/static.js:5,92` `pipeline(fs.createReadStream(file), res, () => {})`; read errors destroy `res`, no unhandled `'error'`; pre-header errors still reach `app.js:71-79`; headers unchanged (`:87-90`); HEAD returns before opening a stream (`:91`).
2. **Non-origin-form URLs fixed** — `server/app.js:38-40,57`: URLs not starting with `/` → 400 `bad_request` before routing; one `pathname` drives health, `/api` guard and static. Checked `/API/x`, `//api/x`, `/api%2Fx`, `/%61pi/x`, `/api;x` → static fallback (nothing guarded reachable); `/api/../x` → guard then 404; `/api?q` → guarded. Test `server/app.test.ts:101-117` (raw socket); README note `server/README.md:20`.
3. **Rule for the T-013.2 router** — match on the raw `pathname`; percent-decode individual segments (ids) only after the access check; never decode-then-route. Add to README.md:20 or the T-013.2 plan.
4. Attempt-1 note #8 (`server/README.md:11` wording) still open — docs only.

Other attempt-1 🟢 notes unchanged (optional). Risk unchanged: prod fail-closed relies on T-015 setting exactly `NODE_ENV=production` and never `TUDO_ACCESS_DISABLED`; T-013.2 reviewer must check the router note.
