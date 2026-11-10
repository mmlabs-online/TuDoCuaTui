Status: READY

# Plan — T-013 (slice T-013.1): Node server shell — SPA static serving, health/readiness, Cloudflare Access guard

Gate: **plan-approval** (ticket field `Gate: plan-approval`; Areas include security). The implementer starts only after Ming writes "Plan approved" under *Notes / answers from Ming*. Assumptions A1–A14 are the choices Ming confirms or overrides; A8–A14 fix the `/api` contract for slice T-013.2 now, so Ming decides them once.

**This plan covers slice T-013.1 only** (see `## Split proposal`). The ticket's three ACs are split: AC3 plus the T-011 security notes land here; AC1 and AC2 land in T-013.2.

## Feature summary
T-013 is a T-ticket and is not in `docs/feature-list.md`. It implements decisions in `work/decisions.md`:

- **D23:** "accessed only by a Node API in the same image as the SPA (replaces nginx from T-007). **No in-app authentication for now** (single user); **Cloudflare Access** protects `tudocuatui.mmlabs.online`."
- **D24:** "`DATABASE_URL` is plain `postgres://tudocuatui:<pw>@postgres:5432/tudocuatui`, no SSL … Migrate command contract: `node server/migrate.js`. Readiness probe: `/readyz` on :3000."

Ticket text:
- Goal: "One Node/TypeScript server in the TuDo image serves the built SPA and a JSON `/api` backed by Postgres, covering everything `WardrobeRepo` does today."
- Scope: "Server (framework chosen in the plan; minimal deps) … health/readiness (`/healthz`, `/readyz` with DB check)", "Parameterised SQL only; connection pool; no secrets in responses or logs", "API tests against a real Postgres in CI", "Photos: out of scope".
- AC3 (this slice): "Serves `dist/` with SPA fallback and correct caching (as nginx did in T-007)."
- Notes (T-011 security review): "Validate the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`: JWKS signature, `aud`, `iss`) — neighbours on the shared `web` network can reach the API directly. Provide `/readyz` with `select 1` on :3000, pg pool max 5, never log `DATABASE_URL`."

Reference behaviour for AC3 is `docker/nginx.conf`:
- `try_files $uri /index.html`;
- `/assets/` gets `try_files $uri =404` and `Cache-Control "public, max-age=31536000, immutable"`;
- `/index.html` and `/version.txt` get `no-cache`;
- every response gets `nosniff`, `strict-origin-when-cross-origin` and `X-Frame-Options DENY`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | AC3: serves `dist/` with SPA fallback and the nginx caching rules. | `server/static.test.ts` and `server/app.test.ts` (static cases) pass against a temp fixture `dist/`. Manual check: `pnpm build && TUDO_ACCESS_DISABLED=1 node server/index.js`, then `curl -sI localhost:3000/`, `/some/deep/path`, `/assets/<real>.js`, `/assets/missing.js` and `/version.txt`. Expect: `/` and the deep path return 200 `text/html` with `no-cache`; the real asset returns 200 with `immutable`; the missing asset returns 404; `/version.txt` returns `no-cache`; all carry the three security headers. |
| 2 | Path safety: nothing outside `dist/` is ever served. | `server/static.test.ts` › "traversal attempts never escape the root". Cases: `/../package.json`, `/%2e%2e/%2e%2e/etc/passwd`, `/assets/..%2f..%2fpackage.json`, `/%00`, `//etc/passwd`, `/assets/%5c..%5cpackage.json`, a malformed `%E0%A4%A`. Each returns 400 or 404/index.html and never file content from outside the root. The reviewer also reads `resolveStaticPath`. |
| 3 | T-011 note: the Cloudflare Access JWT is validated (JWKS signature, `aud`, `iss`) on `/api/*`. | `server/access.test.ts` (list under Tests) uses a local key pair and JWKS, with no network. `server/app.test.ts` › "/api without a valid JWT → 401 JSON; static and health stay open". |
| 4 | Fail closed when Access is not configured. | `server/access.test.ts` › "loadAccessConfig" cases. `server/index.cli.test.ts` › "NODE_ENV=production without CF_ACCESS_* exits 2", and › "TUDO_ACCESS_DISABLED=1 is refused in production (exit 2)". |
| 5 | T-011 note: `/readyz` runs `select 1` on :3000; `/healthz` is liveness only. | `server/app.db.test.ts` › "/readyz → 200 with a reachable DB". `server/app.test.ts` › "/readyz → 503 `{status:"unavailable"}` with no pool" and › "/healthz → 200 without a DB". `server/index.cli.test.ts` › "starts on PORT with no DATABASE_URL; /healthz 200, /readyz 503; SIGTERM exits 0". The listen port defaults to 3000; the reviewer reads `server/index.js`. |
| 6 | T-011 note: pg pool max 5. Date parser returns a string (T-012 follow-up). | `server/db.test.ts` › "createPool options: max 5, timeouts, application_name, statement_timeout". `server/app.db.test.ts` › "pool returns `date` as 'YYYY-MM-DD' and leaves the global pg.types untouched". |
| 7 | T-011 note and ticket: `DATABASE_URL` is never logged or returned. | `server/index.cli.test.ts` › "unreachable DATABASE_URL: /readyz 503; stdout, stderr and the body contain neither the URL nor the password". This runs against 127.0.0.1:1, so no DB is needed. The reviewer greps `server/*.js` for `console.*(err)`, `process.env` dumps and logging of whole error objects: none allowed. |
| 8 | Unknown routes and methods are JSON under `/api`; there is never an SPA fallback for `/api`. | `server/app.test.ts` › "/api/anything (valid JWT) → 404 JSON `not_found`, never index.html", › "POST / → 405 with `Allow: GET, HEAD`". |
| — | Checks green (R8); coverage thresholds on the new pure modules. | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (and `pnpm test:coverage` with `CI=true` plus `TEST_DATABASE_URL`), and `pnpm build` all pass. The CI `ci` job is green. |
| — | Scope (R1, R7, R10). | `git diff --stat origin/main...HEAD` touches only the files listed below. Specifically, it touches nothing under `src/**`, `vite.config.ts`, `Dockerfile`, `.dockerignore`, `docker/**`, `scripts/**`, `.github/workflows/release.yml`, `supabase/**`, `db/migrations/**` or `server/migrat*.js`. |

## Ming verification after merge
None. Production keeps running the nginx image until T-015, so nothing changes live.

Optional local run:
1. `pnpm build`
2. `TUDO_ACCESS_DISABLED=1 node server/index.js`
3. Open `http://localhost:3000`. The app runs in local mode, as today.

The new Ming item **M-13** (A5) is needed before T-015, not for this merge.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/index.js` | create | Entry point (`node server/index.js`). It reads env, builds the pool (or none) and the access verifier, calls `listen(PORT ‖ 3000, "0.0.0.0")`, and handles SIGTERM/SIGINT with a graceful close. Fixed log lines only. |
| `server/app.js` | create | `createApp({ pool, distDir, access, log })` returns the request handler. It holds the router (`/healthz`, `/readyz`, `/api/*` guard plus JSON 404, static), the security headers, the request id and the per-request JSON log line. Injectable for tests. |
| `server/http.js` | create | Small helpers: `sendJson(res, status, body)` and `sendError(res, status, code)`, which return an `{ error: { code } }` body with `Cache-Control: no-store`, plus the security-header constants. T-013.2 reuses them. |
| `server/static.js` | create | `resolveStaticPath(distDir, urlPath)` (pure, path-safe), the MIME map, the cache rules, and `serveStatic(req, res, distDir)`, which streams the file and supports HEAD. |
| `server/access.js` | create | `loadAccessConfig(env)` (pure; returns on/off or throws a config error) and `createAccessVerifier({ teamDomain, aud, jwks? })` built on jose `jwtVerify` with RS256 only and a remote JWKS by default. |
| `server/db.js` | create | `createPool(connectionString)` with max 5, timeouts, `application_name` and a per-pool `types` override for date OID 1082 → string; `pool.on("error")` logs `err.code` only; `ping(pool)` runs `select 1`. |
| `server/README.md` | create | The start contract for T-015 (`node server/index.js`, port 3000, `dist/` location), env vars (`DATABASE_URL`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `TUDO_ACCESS_DISABLED`, `NODE_ENV`, `PORT`), the local dev run, and the logging rules. |
| `server/static.test.ts` | create | Unit tests for path resolution, MIME and cache rules. No DB. |
| `server/access.test.ts` | create | JWT verification and config tests. No network, no DB. |
| `server/db.test.ts` | create | Pool option tests. No DB: it constructs the pool and inspects `pool.options`, with no connect. |
| `server/app.test.ts` | create | Request-level tests through `http.createServer(createApp(...)).listen(0)` and global `fetch`. No DB: `pool: null` or a stub `{ query }`. |
| `server/app.db.test.ts` | create | `/readyz` and the date parser against real Postgres. Uses `createTestDb` and `describe.skipIf(!dbAvailable)`, and cannot skip in CI. |
| `server/index.cli.test.ts` | create | Entry-point exit codes, health over a real port, SIGTERM, and no secret output (`child_process`). No DB. |
| `package.json` | modify | Add `jose` (^6) to `dependencies`. Add script `"start": "node server/index.js"`. |
| `pnpm-lock.yaml` | modify | Lockfile for `jose`. |
| `vitest.config.ts` | modify | Add coverage thresholds (the existing `thresholds` object) for `server/static.js`, `server/access.js` and `server/http.js`. These are pure modules whose tests always run without a DB. This is not a Figma Make file, so R10 does not apply. |
| `work/ming-todo.md` | modify | Add **M-13** (A5): copy the Access application's AUD tag and the team domain for T-015. Not secret. Workflow bookkeeping. |

`.github/workflows/ci.yml` and `tsconfig.server.json` stay unchanged. CI already runs a Postgres 17 service with `TEST_DATABASE_URL` on `test:coverage`, and `tsconfig.server.json` already includes `server/**/*.{js,ts}`. jose ships its own types.

## Tests to write
All server test files start with `// @vitest-environment node`. DB files import `server/test/pg.ts`, which throws in CI without `TEST_DATABASE_URL` (R8).

| Test (file › name) | Covers |
|---|---|
| `static.test.ts` › "`/` and `/index.html` resolve to index.html with `no-cache`" | AC3 |
| `static.test.ts` › "`/version.txt` → `no-cache`, `text/plain; charset=utf-8`" | AC3 |
| `static.test.ts` › "`/assets/x.js` found → `public, max-age=31536000, immutable`, `text/javascript; charset=utf-8`" | AC3 |
| `static.test.ts` › "`/assets/missing.js` → 404, never index.html" | AC3 |
| `static.test.ts` › "unknown non-asset path → fallback index.html (`no-cache`)" | AC3 SPA fallback |
| `static.test.ts` › "directory path (`/assets`, `/assets/`) → fallback/404, never a listing" | AC3 |
| `static.test.ts` › "traversal attempts never escape the root" (cases in AC table row 2) | Path safety |
| `static.test.ts` › "dot-segment files (`/.env`, `/.git/config`) are never served" | Path safety |
| `static.test.ts` › "MIME map: html, js, css, svg, png, ico, txt, json, webmanifest, woff2; unknown → application/octet-stream" | AC3 |
| `access.test.ts` › "valid RS256 token with right aud/iss passes" | JWT |
| `access.test.ts` › "missing header → reject" | JWT |
| `access.test.ts` › "bad signature (other key) → reject" | JWT |
| `access.test.ts` › "wrong aud → reject" / "wrong iss → reject" | JWT |
| `access.test.ts` › "expired → reject; nbf in the future beyond tolerance → reject" | JWT |
| `access.test.ts` › "`alg: none` and HS256 tokens → reject" | JWT algorithm pinning |
| `access.test.ts` › "JWKS fetch failure → reject (fail closed)" | JWT (a key source that throws) |
| `access.test.ts` › "verifier never reads the `CF_Authorization` cookie" | Header-only |
| `access.test.ts` › "loadAccessConfig: both set → on; issuer `https://<team>.cloudflareaccess.com`, certs URL `/cdn-cgi/access/certs`" | Config |
| `access.test.ts` › "loadAccessConfig: one or both missing → config error, unless TUDO_ACCESS_DISABLED=1 outside production → off" | Fail closed |
| `access.test.ts` › "loadAccessConfig: TUDO_ACCESS_DISABLED=1 with NODE_ENV=production → config error" | Fail closed |
| `access.test.ts` › "loadAccessConfig: team domain not `*.cloudflareaccess.com` → config error" | Config |
| `db.test.ts` › "createPool options: max 5, connectionTimeoutMillis 3000, idleTimeoutMillis 30000, statement_timeout 5000, application_name tudocuatui-api" | T-011 note |
| `app.test.ts` › "/healthz → 200 `{status:"ok"}` without a DB, `no-store`" | Health |
| `app.test.ts` › "/readyz → 503 `{status:"unavailable"}` with no pool and with a stub pool whose query rejects; no error detail in body" | Readiness |
| `app.test.ts` › "/api without a valid JWT → 401 JSON `unauthorized`; static and health stay open" | JWT guard scope (A2) |
| `app.test.ts` › "/api/anything (valid JWT) → 404 JSON `not_found`, never index.html" | `/api` never falls back |
| `app.test.ts` › "access off (dev) → /api reaches the router (404 JSON)" | Dev mode |
| `app.test.ts` › "POST / → 405 with `Allow: GET, HEAD`; HEAD / → 200 with no body" | Methods |
| `app.test.ts` › "every response has nosniff, Referrer-Policy, X-Frame-Options DENY and an X-Request-Id" | Headers |
| `app.test.ts` › "log: one JSON line per request with method, route template, status, ms, id; never the raw URL, query, headers or the token" | Logging |
| `app.db.test.ts` › "/readyz → 200 with a reachable DB" | Readiness |
| `app.db.test.ts` › "pool returns `date` as 'YYYY-MM-DD' and leaves the global pg.types untouched" | T-012 follow-up (date parser) |
| `index.cli.test.ts` › "NODE_ENV=production without CF_ACCESS_* exits 2 with a fixed message" | Fail closed |
| `index.cli.test.ts` › "TUDO_ACCESS_DISABLED=1 is refused in production (exit 2)" | Fail closed |
| `index.cli.test.ts` › "starts on PORT with no DATABASE_URL; /healthz 200, /readyz 503; SIGTERM exits 0" | Start contract, D24 |
| `index.cli.test.ts` › "unreachable DATABASE_URL: /readyz 503; stdout, stderr and the body contain neither the URL nor the password" | Never log `DATABASE_URL` |

The CLI tests start the server with `PORT=0`, or a free port found by the test, and set `TUDO_ACCESS_DISABLED=1` without `NODE_ENV=production` unless a test says otherwise. They pass an explicit minimal env (no `...process.env`), so a developer's env cannot leak in.

## Approach
1. **Dependencies.** Run `pnpm add jose@^6` (A3). Add nothing else: the server uses `node:http`, `node:fs`, `node:path`, `node:crypto` and the existing `pg`. All files are plain ESM JS with `// @ts-check` and JSDoc, with no build step (A1, following T-012 A7). Server code never imports from `src/` or `@/`.
2. **`server/http.js`.** It holds:
   - `SECURITY_HEADERS`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
   - `sendJson`, which sets `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`.
   - `sendError(res, status, code)` → `{ error: { code } }`.

   Error codes in this slice: `unauthorized`, `not_found`, `method_not_allowed`, `bad_request`. T-013.2 adds the rest (A10).
3. **`server/static.js`.**
   - `resolveStaticPath(distDir, rawPath)` returns `{ file } | { notFound } | { bad }`:
     1. Take the path part only and `decodeURIComponent` it. A decoding error → `bad`.
     2. Reject `\0`, `\\` and any segment that starts with `.`.
     3. `path.resolve(distDir, "." + decoded)` must equal `distDir` or start with `distDir + path.sep`.
     4. `fs.stat` it. Regular file → `file`; anything else → `notFound`.
   - `serveStatic`:
     - A found file is served with the MIME map, `Content-Length` and the cache rule: `/assets/*` → immutable; `index.html` and `version.txt` → `no-cache`; other files get no `Cache-Control`, as in nginx.
     - Missing under `/assets/` → 404 `text/plain` "Not found".
     - Any other missing path, or `bad` → `index.html` with `no-cache` (nginx behaviour). If `index.html` itself is missing → 404.
     - HEAD sends the headers only.
     - Stream with `fs.createReadStream`; on a stream error, destroy the response.
   - No gzip, no ETag (A7).
4. **`server/access.js`.**
   - **`loadAccessConfig(env)`**:
     - `CF_ACCESS_TEAM_DOMAIN` (host such as `mmlabs.cloudflareaccess.com`, validated `^[a-z0-9-]+\.cloudflareaccess\.com$`) and `CF_ACCESS_AUD` (non-empty, no whitespace) → `{ mode: "on", issuer: "https://<team>", certsUrl: "https://<team>/cdn-cgi/access/certs", aud }`.
     - Otherwise, if `TUDO_ACCESS_DISABLED === "1"` and `NODE_ENV !== "production"` → `{ mode: "off" }`.
     - Otherwise throw `AccessConfigError` with a fixed message naming the missing variable names, never values.
   - **`createAccessVerifier({ issuer, aud, jwks = createRemoteJWKSet(new URL(certsUrl)) })`** returns `{ verify(req): Promise<boolean> }`:
     - Read only `req.headers["cf-access-jwt-assertion"]`; missing → false.
     - `jwtVerify(token, jwks, { issuer, audience: aud, algorithms: ["RS256"], clockTolerance: 30 })`.
     - Any throw → false, and the caller logs only `err.code` (a jose code such as `ERR_JWT_EXPIRED`), never the token.
   - JWKS caching and rotation come from jose's defaults.
5. **`server/db.js`.**
   - `createPool(url)` → `new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 5000, application_name: "tudocuatui-api", types: { getTypeParser: (oid, fmt) => oid === 1082 ? (v) => v : pg.types.getTypeParser(oid, fmt) } })`.
   - No `ssl` (D24). Never call the global `pg.types.setTypeParser`.
   - `pool.on("error", (e) => log({ event: "pool_error", code: e.code }))`.
   - `ping(pool)` → `pool.query("select 1")`. `numeric` stays a string here; T-013.2 converts `price`.
6. **`server/app.js`, `createApp({ pool, distDir, access, log })`.** For each request:
   1. Set `X-Request-Id` (`crypto.randomUUID()`) and the security headers.
   2. Parse the pathname from `req.url`.
   3. Route:
      - `/healthz` (GET/HEAD) → 200 `{status:"ok"}`.
      - `/readyz` → if `pool` is set and `ping` succeeds → 200 `{status:"ready"}`; otherwise 503 `{status:"unavailable"}`. On failure, log only `err.code`.
      - Path `/api` or starting `/api/`:
        - If `access` is set and `!(await access.verify(req))` → 401 `unauthorized`.
        - Otherwise 404 `not_found`. T-013.2 mounts the API router here.
        - Never a static fallback.
      - Everything else: GET/HEAD → `serveStatic`; other methods → 405 with `Allow: GET, HEAD`.
   4. On `res` `finish`, log one JSON line: `{ ts, id, method, route, status, ms }`. `route` is a template (`static`, `/healthz`, `/readyz`, `/api`), never `req.url`.
   5. A top-level try/catch → 500 `internal` with `requestId`, logging only `err.code`/`err.name`.
   - Send no CORS headers.
7. **`server/index.js`.**
   1. Read env.
   2. `loadAccessConfig(process.env)`. On `AccessConfigError`, print the fixed message and `process.exit(2)`. Off → print one line `access check OFF (dev)`.
   3. `DATABASE_URL` set → `createPool`; unset → `pool = null` and print `database not configured`. Never print the value or a parsed form.
   4. `distDir` = `path.resolve(dirname(fileURLToPath(import.meta.url)), "../dist")`.
   5. `PORT` defaults to 3000; bind `0.0.0.0`. Print `listening on :<port>`.
   6. SIGTERM/SIGINT → `server.close()`, `server.closeIdleConnections()`, `await pool?.end()`, `process.exitCode = 0`, with a 10 s `unref`'d force-exit timer.
   7. `unhandledRejection`/`uncaughtException` → fixed message plus `err.code`, exit 1.
   - `server/migrate.js` and `server/migrator.js` stay unchanged (D24).
8. **`vitest.config.ts`.** Add `"server/static.js": thresholds, "server/access.js": thresholds, "server/http.js": thresholds` to `coverage.thresholds`. `app.js` and `db.js` stay report-only, because their DB paths skip locally without Postgres (same reasoning as T-012 A8).
9. **`work/ming-todo.md`.** Add M-13: "Cloudflare Access values for the Node server (D23, after M-11, before T-015): in Zero Trust → Access → Applications → TuDo → Overview, copy the **Application Audience (AUD) Tag**, and from Settings → Custom Pages the **team domain** (`<team>.cloudflareaccess.com`). Paste both into T-015's *Notes / answers from Ming*. Neither is secret. The Node server refuses to start in production without them."
10. **`server/README.md`.** Write the start contract, the env table, the dev run (`pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`; no Vite proxy, because of R10) and the logging rules.
11. Run `pnpm format`, then all Checks.

Rules:
- **R1:** `src/` is untouched and local mode is unaffected.
- **R2/D25:** no schema change.
- **R3:** no `VITE_*` variable. `CF_ACCESS_*` are runtime server env vars and not secret. `DATABASE_URL` is never logged or returned.
- **R4:** no photos.
- **R5:** n/a.
- **R6:** no UI copy.
- **R7:** only the file list above.
- **R8:** the tests above; DB tests cannot skip in CI; thresholds on the pure modules.
- **R9:** n/a.
- **R10:** `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

## Specialist input used
`consult-software-architect.md`:

- **Adopted:**
  - R1: `node:http` with no framework.
  - R2: plain ESM JS, `createApp` injection, signal handling, and the start contract `node server/index.js`.
  - R6: static rules and path safety. The traversal test list is extended with dotfiles and backslashes.
  - R7: jose, `/api`-only guard, env names, fail closed, injectable key source, the full rejection test list, never logging the token.
  - R8: `/healthz` with no DB, `/readyz` returning 503 without detail, starting without `DATABASE_URL`, pool settings, `pool.on("error")`.
  - R9 (logging part): request id, route template, code-only error logging, a no-leak test.
  - R10: test approach (`listen(0)` plus `fetch`, no supertest).
  - R11: scope boundary with T-014 and T-015.
  - Risks "egress" and "missing Access config" → M-13 and A5/A6.
- **Deferred to T-013.2, contract fixed now as A8–A14:** R3 API shape, R4 validation, R5 CSRF, the R9 DB error mapper, the API DB tests, and the enum-drift test.
- **Adapted:**
  - **R5 CSRF:** use `Sec-Fetch-Site` instead of comparing `Origin` with `Host` (A11). Cloudflare Tunnel's Host handling is then irrelevant.
  - **R8:** `statement_timeout` uses pg's `statement_timeout` client option, not `options: "-c …"`. Same effect, and simpler.
- **Not adopted:**
  - `server/api-types.d.ts`: T-013.2 decides this, together with the routes.
  - ETag/304 and gzip: A7.
  - A coverage threshold on all of `server/**/*.js`: `migrate.js` (child process) and the DB paths would fail it locally. Thresholds go on the pure modules only.

## Assumptions
Numbered for Ming's plan approval. A1–A7 apply to this slice. A8–A14 fix the T-013.2 contract now, so Ming approves them once.

- **A1 — Framework: `node:http` plus a hand-written router, plain ESM JS (`// @ts-check`), no build step, no framework.** This matches T-012's `server/` style. About 370 lines of production JS in this slice.
- **A2 — The JWT guard covers `/api/*` only.** The static SPA, `/version.txt`, `/healthz` and `/readyz` hold no data and stay open. On the public hostname they are behind Cloudflare Access anyway (M-11). Only neighbours on the `web` network could fetch the public bundle directly. This keeps `check-image.sh` smoke-testable without a JWT.
- **A3 — New runtime dependency `jose` ^6** (zero dependencies, own types). No other new packages.
- **A4 — Env names:**
  - `CF_ACCESS_TEAM_DOMAIN`: the full host, e.g. `<team>.cloudflareaccess.com`.
  - `CF_ACCESS_AUD`.
  - `TUDO_ACCESS_DISABLED=1`: dev only, refused when `NODE_ENV=production`.
  - `PORT`: default 3000.
  - `DATABASE_URL`: D24.

  None of the names match `check-image.sh`'s secret-name grep (`KEY|SECRET|TOKEN|PASSWORD`).
- **A5 — Ming supplies the AUD tag and team domain through a new item M-13** (added in this ticket), needed before T-015. T-015 puts them in the app's `compose.yml` `environment:`, not in the env file, because they are not secret.
- **A6 — Fail closed:**
  - With `NODE_ENV=production` and missing `CF_ACCESS_*`, the server exits 2 at start.
  - A JWKS fetch failure → 401, never a pass. This needs outbound HTTPS from the container to `<team>.cloudflareaccess.com`; T-015 or M-11 must verify it.
  - Consequence for T-015: `check-image.sh` runs the container without env. Either T-015 sets `NODE_ENV=production` only in compose (not in the image), or it passes dummy `CF_ACCESS_*` to the smoke run. T-015 decides.
- **A7 — No gzip and no ETag/Last-Modified.** Cloudflare compresses at the edge, and hashed assets are immutable. `index.html` is re-fetched on each navigation (small file). Recorded as a follow-up, not in the diff.
- **A8 — "Import many" is dropped from T-013.** `WardrobeRepo` has no bulk method (`src/data/repo.ts:14-23`). `importRunner.ts` calls `save` per row and keeps per-row error semantics, and AC1 is satisfied 1:1. The ticket's Scope line ("import many") conflicts with AC1; this plan follows AC1. A bulk endpoint can be a later ticket if import gets slow.
- **A9 — Snake_case, DB-shaped wire format.** `ItemRow` is the `items_with_stats` row with `price` as a number, `purchase_date` and `last_worn` as `YYYY-MM-DD`, `created_at`/`updated_at` as ISO strings, and `primary_photo_path` always `null` until T-005. T-014 then reuses `rowToItem`/`itemToRow`; labels ↔ ids stay in `mappers.ts` (R6). The wear response is also snake_case: `{ wear_count, last_worn, already }`.
- **A10 — Routes for T-013.2** (one per repo method):
  - `GET /api/items`
  - `GET /api/locations`
  - `PUT /api/items/:id` (client UUID, idempotent upsert, location by NFC-trimmed name, get-or-create in the same transaction)
  - `DELETE /api/items/:id` (204, also when already gone)
  - `POST /api/items/:id/wear` `{ delta, today }`

  Errors are `{ error: { code, field?, reason? } }`, with codes `invalid_input`, `invalid_json`, `unsupported_media_type` (415), `payload_too_large` (413, 256 KB), `not_found`, `method_not_allowed`, `forbidden_origin`, `conflict`, `db_unavailable` (503) and `internal` (500 with `requestId`). pg messages and details are never returned or logged. All SQL is parameterised.
- **A11 — CSRF for T-013.2:**
  - PUT and POST require `Content-Type: application/json`.
  - Mutating requests with `Sec-Fetch-Site` of `cross-site` or `same-site` → 403 `forbidden_origin`.
  - No CORS headers.
- **A12 — `today` is bounded.** The server accepts `today` only within ±1 day of the server's Asia/Ho_Chi_Minh date, using an injectable clock. Otherwise 400 `invalid_input` with field `today`. The client still owns "today" (T-012 A4), but a broken clock or a hand-crafted request cannot log arbitrary dates.
- **A13 — Server-side caps the DB lacks:** brand, size and material ≤200 characters; notes ≤2000; colors and tags ≤50 entries of ≤50 characters each. Validation reuses the reason codes of `validate.ts` where they overlap (`nameRequired`, `nameTooLong` counting code points ≤120, `priceNegative`, `priceInvalid`, `dateInvalid`). `dateFuture` is not enforced on the server.
- **A14 — The server does not expose `src/` default locations.** `/api/locations` returns DB rows ordered by `sort_order, name`; T-014 decides whether to merge defaults.
- **Hotspot files** shared with T-013.2, T-014 and T-015: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts` and `work/ming-todo.md`.

Follow-ups (not in this diff):
- `.github/risk-tiers.yml`: add `server/access.js` and `server/index.js` as High (auth-equivalent).
- gzip/ETag (A7).
- T-015: `HEALTHCHECK` via `node -e "fetch('http://127.0.0.1:3000/healthz')…"` (bookworm-slim has no `wget`), a `check-image.sh` rewrite (new `ROOT`, plus a smoke check that `/api` returns 401), and the A6 consequence.
- Update CLAUDE.md "Risk tiers" text for the Node server (Ming).

## Blocking questions
None. Every open point has a default (A1–A14) for Ming to confirm at plan approval.

## Split proposal
The whole ticket is about 700 lines of production JS (static ~80, access ~60, http ~40, db ~40, app ~90, index ~60, validate ~130, API handlers and SQL ~150, error mapping ~40) plus large test files. That is well over the ~400-line guide, and it contains two independently testable halves:

- **T-013.1 — this plan.** Server shell: entry point, static SPA serving (AC3), `/healthz` and `/readyz` (pool max 5, date parser), the Cloudflare Access guard on `/api/*`, and the logging rules. About 370 lines. Once merged, T-015 can start (the image, `check-image.sh` with its `/api` → 401 smoke test, and compose), in parallel with T-013.2.
- **T-013.2 — next.** The `/api` endpoints for every `WardrobeRepo` operation (AC1), validation and error mapping (AC2), CSRF (A11), API tests against real Postgres including the location NFC race, wear ±1/`already`/404, and the enum-drift test against `pg_enum`. It follows the contract in A8–A14. T-014 depends on T-013.2.

The orchestrator should create `work/tickets/T-013.2/ticket.md` (Gate: plan-approval, Depends on: T-013.1) and point T-014 at T-013.2. T-015 can depend on T-013.1.
