# Consult — software-architect — T-013 (2026-11-10)

Files read: `/home/user/TuDoCuaTui/work/tickets/T-013/ticket.md`, `work/decisions.md` (D23–D25), `work/tickets/T-012/{plan,review}.md`, `db/migrations/20261110120000_init.sql`, `server/*`, `server/test/pg.ts`, `src/data/{repo,mappers,importRunner}.ts`, `src/types/item.ts`, `src/features/items/validate.ts`, the T-014 and T-015 tickets, `package.json`, `tsconfig*.json`, `vitest.config.ts`, `Dockerfile`, `docker/nginx.conf`, `scripts/check-image.sh`, `.github/workflows/ci.yml`. I did not read any `.env` file.

## Findings
1. **The scope says "import many", but `WardrobeRepo` has no such method.** It has only `list`, `locations`, `save`, `remove` and `wear` (`src/data/repo.ts:14-23`). `importRunner.ts` calls `save` once per row and keeps going when one row fails. AC1 ("every WardrobeRepo operation has an endpoint") does not need a bulk endpoint. That makes the scope line and the AC disagree; see Open question 1.
2. **`server/` cannot import `src/` code.** `server/` is plain ESM JS checked by `tsconfig.server.json` (NodeNext, no `@` alias). `src/data/mappers.ts` and `validate.ts` are TS that uses `@/` imports and Supabase `Database` types with `tudo_*` names. Sharing code would mean adding a build step or moving modules around.
3. **`mappers.ts` already converts the view-row shape to and from `Item`.** The columns of the new view `items_with_stats` match the old `tudo_items_with_stats` columns that `rowToItem` reads, apart from the table name and `user_id`. So if the API sends and receives DB-shaped rows, T-014 can keep using `rowToItem`/`itemToRow` and only change the types. R6 still holds: labels and ids are converted only in `mappers.ts`, and the server never sees a Vietnamese label.
4. **pg return types (pinned by the T-012 schema test):**
   - `price` (numeric) comes back as a string.
   - `date` comes back as a JS `Date` unless an OID 1082 parser is registered.
   - `created_at` comes back as a `Date`.
   - The schema test registers the parser per client (`schema.db.test.ts:20`), not globally.
5. **`check-image.sh` (T-015 will reuse it) runs the container with no env at all,** then probes `/`, a deep path, a missing asset and `/version.txt` with `wget`. So the server has to start without `DATABASE_URL`, and static files must be served without a JWT. Otherwise T-015 needs dummy env and a changed script.
6. **R10 blocks a Vite dev proxy** (`vite.config.ts` is off-limits). Testing against the API locally means `pnpm build` and then running the Node server against `dist/`, or a CORS setup, which I advise against.
7. **The vitest default environment is `jsdom`.** Server tests need `// @vitest-environment node`, as the T-012 tests do. `server/**/*.js` is in the coverage include list but has no threshold.
8. **CSRF exposure.** The app has no login of its own, but the browser sends Cloudflare Access's `CF_Authorization` cookie automatically. A state-changing endpoint that accepts a simple (non-preflighted) cross-site request could be driven from another site.

## Recommendations
- **R1 — Framework: `node:http` with a small hand-written router; no framework dependency.** There are about 5 API routes plus static files. This matches T-012's zero-build, few-deps choice and the ticket's "minimal deps".
  - Trade-off: we write body parsing, MIME types and path safety ourselves (about 150 lines, unit-tested).
  - Alternatives: Hono + `@hono/node-server` (small, has `serveStatic` and `app.request()` for tests), or Fastify (heavier). Pick Hono only if the planner judges the hand-written static/body code to be the bigger risk.
- **R2 — Use plain ESM JS with `// @ts-check` and JSDoc, no build step.** Add the new files under `server/`, already covered by `tsconfig.server.json`.
  - Suggested files: `server/index.js` (entry: env, pool, listen :3000, SIGTERM/SIGINT → `server.close()` + `pool.end()`, since Node as PID 1 ignores signals otherwise), `server/app.js` (`createApp({ pool, distDir, access })` returns a request handler, for injection in tests), `server/api.js`, `server/static.js`, `server/access.js`, `server/validate.js`, `server/db.js`.
  - Document `node server/index.js` as the start contract T-015 should use as the image `CMD`. Keep `server/migrate.js` unchanged (D24).
  - Optionally publish the wire types as `server/api-types.d.ts`, so T-014 can import them as types only.
- **R3 — API shape, one endpoint per repo method (AC1).** Everything is under `/api`, uses JSON, and sets `Cache-Control: no-store`.

  | Method | Endpoint | Request | Response |
  |---|---|---|---|
  | `list` | `GET /api/items` | — | `{ items: ItemRow[] }`, ordered by `created_at desc` |
  | `locations` | `GET /api/locations` | — | `{ locations: string[] }`, ordered by `sort_order, name` |
  | `save` | `PUT /api/items/:id` | body: item fields + `location_name` | `200 { item: ItemRow }` |
  | `remove` | `DELETE /api/items/:id` | — | `204`, also when the item is already gone (matches the local repo) |
  | `wear` | `POST /api/items/:id/wear` | `{ delta: 1 \| -1, today: "YYYY-MM-DD" }` | `{ wearCount, lastWorn, already }` |

  - **`save` details:**
    - `:id` must be a UUID. The client generates it with `crypto.randomUUID()` when `item.id` is not a UUID (T-014). This makes retries idempotent and avoids a separate POST.
    - The body is what `itemToRow` returns, minus `id` and `location_id`, plus `location_name`.
    - Run it in one transaction:
      1. NFC + trim the location name, then get-or-create it with `insert … on conflict (name) do nothing returning id`, falling back to a `select`.
      2. `insert … on conflict (id) do update set …`, never touching `created_at`.
      3. After commit, read the row back from `items_with_stats`.
  - **`wear` details:**
    - `today` comes from the client's `localToday()` (T-012 A4).
    - +1: `insert … on conflict (item_id, worn_on) do nothing returning id`; `already = rowCount === 0`.
    - −1: a single `delete … where id = (select id … order by worn_on desc limit 1)`.
    - Then read the stats from the view.
    - Foreign-key violation `23503` → `404 not_found`.
  - `ItemRow` is the view row with `price` converted to a number (safe, since numeric(14,0) < 2^53), dates as `YYYY-MM-DD` via a per-pool 1082 parser (pg `Pool` `types` option, not the global `pg.types`), and timestamps in ISO format.
  - No photo URLs yet. Return `primary_photo_path` as `null`, or drop it.
- **R4 — Validation: a separate pure module `server/validate.js` (AC2).** It builds a new object from whitelisted fields only.
  - Error format: `400 { error: { code: "invalid_input", field, reason } }`.
  - Reuse `validate.ts` reason codes where they overlap (`nameRequired`, `nameTooLong` counting code points ≤120, `priceNegative`, `priceInvalid`, `dateInvalid`), so T-014 can show the existing Vietnamese messages.
  - Check:
    - category and status against server constants that mirror the DB enums;
    - seasons as a subset of the 4 values;
    - price as an integer, 0 ≤ price < 1e14, or `null`;
    - `purchase_date` as a real calendar date;
    - location ≤80 characters after NFC (empty → `null`);
    - `delta` ∈ {1, −1};
    - `today` as a real date.
  - Add caps the DB does not have: brand/size/material ≤200, notes ≤2000, colors/tags ≤50 entries of ≤50 characters.
  - Add a DB test that compares the server enum constants with `pg_enum`, to catch drift.
  - Do not enforce `dateFuture` on the server (the client owns "today").
  - Other request errors:
    - `415` if Content-Type is not `application/json`;
    - `413` if the body is over 256 KB (no photos yet);
    - `400 invalid_json` for malformed JSON;
    - `405` and `404` as JSON under `/api`.
- **R5 — CSRF.** Require `Content-Type: application/json` on PUT and POST; DELETE is always preflighted. Send no CORS headers. Reject a mutating request whose `Origin` header is present and does not match `Host` (`403 forbidden_origin`). This is cheap and needs no dependency.
- **R6 — Static files (AC3, matching `nginx.conf`):**
  - GET and HEAD only.
  - Resolve each path inside `distDir`: decode it, reject NUL and `..` that escapes the root, serve regular files only.
  - Use a small MIME map: html, js, css, svg, png, ico, txt, json, webmanifest, woff2.
  - `/assets/*`: a missing file is a real 404, never `index.html`. Found files get `public, max-age=31536000, immutable`.
  - `index.html` and `/version.txt` get `no-cache`.
  - Any other missing non-`/api` path returns `index.html` (`no-cache`).
  - `/api/*` never falls back to the SPA.
  - On every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
  - Skip gzip (Cloudflare compresses at the edge), or note it as a follow-up.
  - Optional: ETag/Last-Modified with 304.
- **R7 — Cloudflare Access JWT: use `jose` as a production dependency, not hand-rolled code.** jose has no dependencies of its own. Its `createRemoteJWKSet` caches keys, handles rotation and cooldown, and fetches lazily.
  - Verify with `jwtVerify(token, jwks, { issuer: "https://<team>.cloudflareaccess.com", audience: AUD, algorithms: ["RS256"] })`. `exp` and `nbf` are checked by default; add a small `clockTolerance` (about 30 s).
  - Read the `Cf-Access-Jwt-Assertion` header only, not the cookie.
  - Apply the check to `/api/*` only. Static files and `/healthz`/`/readyz` stay open: they hold no data, and this keeps `check-image.sh` working.
  - Env: `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. Neither is a secret, and neither name matches `check-image.sh`'s secret-name grep.
  - **Fail closed:**
    - If either is unset and `NODE_ENV=production`, the server refuses to start (exit 2, fixed message).
    - Outside production, an unset config needs an explicit `TUDO_ACCESS_DISABLED=1`. The server logs one line, "access check OFF (dev)", and refuses that flag when `NODE_ENV=production`.
    - A JWKS fetch failure gives `401` (or `503`), never a pass.
  - Design `access.js` so the key source can be injected. Tests then use jose `generateKeyPair` with `createLocalJWKSet` and need no network.
  - Required tests: missing header, bad signature, wrong `aud`, wrong `iss`, expired, `alg: none`/HS256 rejected, valid token passes, production config refusal.
  - Never log the token or any headers.
- **R8 — Health endpoints:**
  - `/healthz`: process liveness only, no DB, `200 ok`.
  - `/readyz`: `select 1` with a short timeout → `200` or `503 { status: "unavailable" }`, no error detail.
  - The server must start with `DATABASE_URL` unset. In that case `/readyz` returns 503 and `/api` returns `503 db_unavailable`. This keeps the T-015 smoke test working without a DB.
  - Pool settings: `max: 5`, `connectionTimeoutMillis` about 3000, `idleTimeoutMillis` 30000, `statement_timeout` about 5000 via `options`, `application_name: "tudocuatui-api"`.
  - Register `pool.on("error")` and log only the error code; without it, an idle-client error crashes the process.
- **R9 — Errors and logging:**
  - A central error mapper:
    - known codes `22P02` and `23514` → `400`;
    - `23503` → `404`;
    - everything else → `500 { error: { code: "internal", requestId } }`.
  - Never return a pg message or detail in a response.
  - Log one JSON line per request: method, route template (not the raw URL), status, ms, `requestId` (also sent as `X-Request-Id`).
  - On a 500, log only `err.code`, `err.constraint` and `err.routine`. Never log `message`/`detail` (they contain user data), the query parameters, headers or env.
  - Connection errors get a fixed message, as `migrator.js` does ("DATABASE_URL not printed").
  - Add a test that triggers a 500 and asserts that neither stdout/stderr nor the response body contains the DB URL or its password.
- **R10 — Tests:**
  - Pure unit tests for `validate.js`, routing, static path safety and `access.js`.
  - API tests against a real DB:
    1. `createTestDb()` + `runMigrations` from `server/test/pg.ts` and `migrator.js`;
    2. `createApp({ pool, distDir: <tmp fixture dist>, access: <test verifier> })`;
    3. `http.createServer(handler).listen(0)`;
    4. call it with the global `fetch`. No supertest is needed.
  - Cover every endpoint, including wear +1 twice → `already`, −1, the location NFC race, and save with an unknown location.
  - Use the same CI rule as T-012: these tests cannot be skipped when `CI` is set.
  - Add a coverage threshold for `server/**/*.js` (R8).
- **R11 — Scope boundary:**
  - **T-013:** server code, `jose` dependency, tests, CI changes only if needed (the Postgres service already exists), and a start-contract note.
  - **T-014:** `createHttpRepo` (UUID generation, `rowToItem`/`itemToRow`, sends `today`), the API-mode flag, no AuthGate.
  - **T-015:** `Dockerfile` (runtime `node:22-bookworm-slim`, non-root `USER`, copy `dist/`, `server/`, `db/migrations/` and prod `node_modules`), `HEALTHCHECK` via `node -e "fetch(...)"` (bookworm-slim has no `wget`), a `check-image.sh` rewrite (`ROOT` changes, and smoke checks of `/healthz` plus "`/api` returns 401 without a JWT"), `NODE_ENV=production`, and the CF env in `compose.yml`.
  - T-013 must not touch `Dockerfile`, `docker/` or `check-image.sh`. The CI `image` job keeps building the nginx image until T-015.

## Risks
- **Container egress:** the JWKS fetch needs outbound HTTPS from the container. If the `web` or `db` networks have no egress, every `/api` call returns 401. T-015/M-11 should verify this.
- **Missing Access config in prod:** if `CF_ACCESS_AUD` or the team domain is missing, the fail-closed design keeps the container down. That is the intended behaviour, but Ming needs the AUD tag from the dashboard. Add it to M-11 or a new M item.
- **Wear semantics differ by mode:** the local repo's −1 restores the previous `lastWorn` from session memory, while the DB derives it from the logs. Behaviour can differ slightly between modes; the DB version is more correct.
- **Client-owned "today":** a client with a wrong clock can log a wear on the wrong date. This is accepted per A4; optionally reject dates more than ±1 day from the server's Asia/Ho_Chi_Minh date.
- **Hotspot file merge conflicts with T-014/T-015:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `ci.yml`.
- **Hand-written static serving** is the most likely place for a path-traversal bug. Write tests that request `%2e%2e/`, encoded NUL and absolute paths.
- **Mixed dependencies:** `dependencies` holds both SPA and server packages, so the prod `node_modules` in the image carries `react` and `@supabase/*` until T-015/T-016 prune it.

## Open questions (for Ming / planner)
1. "Import many": drop it from T-013 to stay 1:1 with `WardrobeRepo` (my recommendation), or add `POST /api/items/import` plus a `WardrobeRepo` method? The second option widens T-014 and changes `importRunner`'s per-row error semantics.
2. Should the JWT guard cover only `/api/*` (recommended) or the static SPA too? Covering static files means T-015 must change the smoke test.
3. Env names and opt-out flag: are `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `TUDO_ACCESS_DISABLED` (dev only) acceptable? Who supplies the AUD, and does it go in an M-11 update?
4. Should the wire format stay DB-shaped snake_case so T-014 reuses `mappers.ts` (recommended), or become a camelCase DTO, which means new mappers in T-014?
5. Should the server bound `today` (±1 day of the server date), or trust the client completely (current A4)?
