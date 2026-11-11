# Review — T-013

## Attempt 1 — 2026-11-10 (slice T-013.1)
Verdict: PASS

Scope: slice T-013.1 only (plan.md `## Split proposal`). Judged against AC3, the T-011 security notes and the
plan's verification table (rows 1–8 + checks + scope). AC1/AC2 belong to T-013.2.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0 (tsc app + `tsconfig.server.json`).
- format:check: exit 0, "All matched files use the correct format" (149 files).
- test (no DB): 48 files passed, 3 skipped; 543 passed, 27 skipped. Matches impl-log.
- test (local PostgreSQL 16, scram-sha-256 password auth, `TEST_DATABASE_URL` set): 51 files, 570 passed.
- test:coverage (`CI=true` + DB): 570 passed, exit 0, thresholds met. server rows: app.js 97.5/92.3/100/97.05,
  db.js 100/66.66/83.33/100, static.js 96/93.75/85.71/100; access.js and http.js are fully covered (not listed).
- build: `pnpm build` exit 0.
- Temp Postgres stopped and its data dir deleted afterwards.
- Manual run of `node server/index.js` on the built `dist/` (with `env -i`, no `DATABASE_URL`):
  - Access off (`TUDO_ACCESS_DISABLED=1`):
    - `/` and `/some/deep/path`: 200 `text/html` with `no-cache`.
    - `/assets/index-*.js`: 200 `text/javascript` with `public, max-age=31536000, immutable`.
    - `/assets/missing.js`: 404 `text/plain`.
    - `/favicon.png` and `/robots.txt`: 200 with no Cache-Control.
    - `/healthz`: 200 `no-store`. `/readyz`: 503.
    - `/api` and `/api/items`: 404 JSON.
    - `POST /`: 405 with `Allow: GET, HEAD`.
    - Every response carried nosniff, Referrer-Policy, `X-Frame-Options: DENY` and `X-Request-Id`.
    - SIGTERM: exit 0.
  - Path traversal, sent with `curl --path-as-is`: `/../package.json`, `/%2e%2e/%2e%2e/etc/passwd`,
    `/assets/..%2f..%2fpackage.json`, `/%00`, `//etc/passwd`, `/assets/%5c..%5cpackage.json`, `/%E0%A4%A`,
    `/.env`, `/..%2fpackage.json`, `/assets/../../package.json`, `/server/index.js`,
    `/%2e%2e%2fserver%2findex.js`, `/assets/%2e%2e/%2e%2e/package.json`. Each returned index.html (200) or 404;
    none returned file content from outside `dist/`.
  - Access on (`CF_ACCESS_TEAM_DOMAIN=team.cloudflareaccess.com`, `CF_ACCESS_AUD`, `NODE_ENV=production`):
    - `/api` and `/api/items` with no header: 401 `{"error":{"code":"unauthorized"}}`.
    - Garbage token: 401 (`ERR_JWS_INVALID` logged).
    - Well-formed fake RS256 token: 401; the JWKS fetch fails with no egress, so it fails closed.
    - `CF_Authorization` cookie only: 401. `OPTIONS /api/items`: 401. `/api/../index.html`: 401.
    - `/healthz`, `/` and `/readyz` stay open (200, 200, 503).
    - The log contains no token: grep for the token returned 0.
  - Config failures, each exit 2 with a fixed message: production without `CF_ACCESS_*`; production with
    `TUDO_ACCESS_DISABLED=1`; team domain `evil.com`; no env at all.
- impl-log claims match the reviewer's runs.

### Acceptance criteria
- [x] AC3 / plan row 1: serves `dist/` with SPA fallback and the nginx caching rules.
  - Evidence: `server/static.js:56-61` (cache rules) and `:69-94` (fallback; `/assets/*` 404).
  - Tests: `server/static.test.ts:55-122`.
  - Manual probes above.
  - `/version.txt` → `no-cache` is shown by `static.test.ts:65-70`; local builds have no version.txt.
- [x] Row 2, path safety.
  - Evidence: `server/static.js:35-53`. It decodes the path (`bad` on a decoding error), rejects `\0` and `\`,
    rejects any dot-prefixed segment, and does the `root + path.sep` prefix check before `stat`, with `isFile` only.
  - Tests: `static.test.ts:126-160`. Manual traversal probes above.
- [x] Row 3, Access JWT validated (signature, `aud`, `iss`) on `/api/*`.
  - Evidence: `server/access.js:41-60`. It reads only the `cf-access-jwt-assertion` header and calls jose
    `jwtVerify` with issuer, audience, `algorithms: ["RS256"]` and `clockTolerance: 30`. The guard is at
    `server/app.js:55-63`.
  - Tests: `access.test.ts:45-117` cover a valid token, missing header, other key, wrong aud, wrong iss,
    expired, future nbf, `none`/HS256, a JWKS failure and the cookie being ignored. `app.test.ts:244-251`.
- [x] Row 4, fail closed.
  - Evidence: `server/access.js:13-35` and `server/index.js:25-30` (exit 2).
  - Tests: `access.test.ts:135-160`, `index.cli.test.ts:290-299`. Manual config-failure runs above.
- [x] Row 5, `/readyz` runs `select 1`; `/healthz` is liveness only; port 3000.
  - Evidence: `server/app.js:41-53`, `server/db.js:34-36`, `server/index.js:42`.
  - Tests: `app.db.test.ts:245-249` (real PG, passed), `app.test.ts:217-242`, `index.cli.test.ts:301-310`.
- [x] Row 6, pool max 5 and the date parser.
  - Evidence: `server/db.js:10-26`. The `types` override is per pool; the global `setTypeParser` is never called.
  - Tests: `db.test.ts:176-198`, `app.db.test.ts:251-255` (real PG, passed).
- [x] Row 7, `DATABASE_URL` never logged or returned.
  - Evidence: `server/index.js:37-39` prints only "database not configured". The pool, readyz and unhandled
    paths log only `code`/`name` (`db.js:27-29`, `app.js:50`, `app.js:70-74`, `index.js:15-20`). The grep of
    `server/*.js` found no logging of whole errors or env dumps (`migrate.js` is pre-existing and unchanged).
  - Tests: `index.cli.test.ts:322-338`.
- [x] Row 8, `/api` is never an SPA fallback; methods.
  - Evidence: `server/app.js:55-67`.
  - Tests: `app.test.ts:253-275`.
- [x] Checks green: see above.
- [x] Scope (R1, R7, R10).
  - `git diff --name-only origin/main...HEAD` touches only the plan's file list plus T-013 workflow files
    (ticket, plan, consult, impl-log).
  - No path under `src/`, `vite.config.ts`, `Dockerfile`, `docker/`, `scripts/`, `supabase/`, `db/migrations`,
    `server/migrat*`, `.github/`, `AGENTS.md`, `.figma/` or `work/backlog.md`.
  - The plan deviation `verify()` → `{ ok, code? }` (impl-log § Scope self-check) is justified: the plan asks
    for code-only logging.

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: `src/` is untouched.
- R3: no `VITE_*` variable; `CF_ACCESS_*` are runtime server env and not secret.
- R7: scope as above.
- R8: checks green; DB tests ran against real PG; thresholds were added for static/access/http
  (`vitest.config.ts:57-59`).
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

### Nits (do not block)
- `server/static.js:57`: the immutable rule checks the raw (undecoded) `urlPath`. So `/assets%2Fx.js` is served
  with no Cache-Control, and `/%61ssets/missing.js` falls back to index.html instead of 404. Harmless.
- `server/static.js:59`: any nested `*/index.html` gets `no-cache`; nginx matched only `= /index.html`. Harmless.
- `server/static.js:84`: a second `stat` after `resolveStaticPath` (a TOCTOU window). A file vanishing between
  the two calls gives a 500 rather than a 404.
- `server/index.js:42`: `PORT=""` becomes port 0 (a random port). `Number(process.env.PORT || 3000)` would be
  safer.
- `server/static.js:46`: the containment check is lexical, so a symlink inside `dist/` would be followed. This
  matches nginx defaults, and `dist/` is build output.
- `index.cli.test.ts:311-319`: the Access-on child is killed without awaiting its exit.

### Follow-ups (out of scope)
- T-013.2: mount the API router on the same `pathname` and after the guard at `server/app.js:55-63`.
  `/API/...`, `//api/...`, `/api%2F...` and absolute-form `http://host/api/...` currently fall to the SPA. Keep
  the guard and the router on one shared prefix match so no variant reaches a handler unguarded.
- T-015: with no env, the image exits 2, as plan A6 notes. `check-image.sh` must pass dummy `CF_ACCESS_*` or
  `TUDO_ACCESS_DISABLED=1` without `NODE_ENV=production`. Verify container egress to
  `<team>.cloudflareaccess.com` for the JWKS fetch; without it every `/api` call is 401.
- Plan follow-ups still stand: risk-tiers entries for `server/access.js` and `server/index.js`; gzip/ETag (A7);
  the HEALTHCHECK via node fetch.

### Security follow-ups to fix (Ming, 2026-11-11: "Sửa cả 2 rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. `server/static.js:91-93` — fd leak on aborted downloads: replace `stream.pipe(res)` with `pipeline(fs.createReadStream(file), res, () => {})` from `node:stream` (cleans up both sides); add a test if practical.
2. `server/app.js:38,55` — request URLs not in origin-form: return 400 `bad_request` when `req.url` does not start with `/` (absolute-form, `*`); add an app.test case for absolute-form. Keep one `pathname` variable as the single source for the `/api` guard (T-013.2 must dispatch from it inside the guarded branch — note this in `server/README.md`).
