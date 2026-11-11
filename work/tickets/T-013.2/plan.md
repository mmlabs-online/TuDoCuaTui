Status: READY

# Plan — T-013.2: `/api` endpoints for every WardrobeRepo operation

Gate: **plan-approval** (ticket field `Gate: plan-approval`). The implementer starts only after Ming writes "Plan approved" under *Notes / answers from Ming* in `ticket.md`.

The contract was approved with the T-013 plan as **A8–A14** (`work/tickets/T-013/plan.md:236-252`), and this plan follows it as written. The new choices are **A15–A27** below, for Ming to confirm.

## Feature summary
T-013.2 is a T-ticket and is not in `docs/feature-list.md`. It implements:

- **D23** (`work/decisions.md`): "accessed only by a Node API in the same image as the SPA … **No in-app authentication for now** (single user); **Cloudflare Access** protects `tudocuatui.mmlabs.online`."
- **Ticket goal:** "the JSON `/api` endpoints on the T-013.1 server shell, covering everything `WardrobeRepo` does today, against the T-012 Postgres schema."
- **Ticket scope:**
  - "API router mounted on the T-013.1 shell; input validation; central DB error mapping; CSRF checks."
  - "Parameterised SQL only; never return or log pg error text, `DATABASE_URL` or tokens."
  - "API tests against a real Postgres (CI rule from T-012: no skipping when `CI` is set), incl. location NFC race, wear ±1 / `already` / 404, and an enum-drift test against `pg_enum`."
- **ACs:**
  - "Every `WardrobeRepo` operation has an endpoint with tests."
  - "Invalid input → 400 with a code; DB errors never leak SQL or internals."
- **Ming's note (2026-11-11):** "Route only from the same raw `pathname` computed in `server/app.js`, inside the guarded `/api` branch; percent-decode individual segments (ids) only after the access check — never decode-then-route."

`WardrobeRepo` (`src/data/repo.ts:14-23`) has five operations: `list`, `locations`, `save`, `remove` and `wear`. Each one maps to a route in A10:

| Repo method | Endpoint | Success |
|---|---|---|
| `list()` | `GET /api/items` | 200 `{ items: ItemRow[] }`, newest `created_at` first |
| `locations()` | `GET /api/locations` | 200 `{ locations: string[] }`, ordered by `sort_order, name` (A14) |
| `save(item)` | `PUT /api/items/:id` | 200 `{ item: ItemRow }` |
| `remove(item)` | `DELETE /api/items/:id` | 204, also when the item is already gone |
| `wear(item, delta)` | `POST /api/items/:id/wear` `{ delta, today }` | 200 `{ wear_count, last_worn, already }` |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | AC1: `GET /api/items` (`list`) | `server/api.db.test.ts` › "GET /api/items → rows newest first, ItemRow shape" and › "empty DB → `{ items: [] }`" |
| 2 | AC1: `GET /api/locations` (`locations`) | `api.db.test.ts` › "GET /api/locations → names ordered by sort_order, name" |
| 3 | AC1: `PUT /api/items/:id` (`save`): idempotent upsert, NFC location get-or-create in the same transaction | `api.db.test.ts`:<br>› "PUT creates with the client UUID, then updates; created_at unchanged, updated_at bumped"<br>› "PUT twice with the same body is idempotent (one row)"<br>› "location NFC race: 8 concurrent PUTs with NFC/NFD forms → one location row"<br>› "a failing item insert rolls back a newly created location"<br>› "full round-trip of every field" |
| 4 | AC1: `DELETE /api/items/:id` (`remove`) | `api.db.test.ts` › "DELETE → 204, item and its wear logs gone; DELETE again → 204" |
| 5 | AC1: `POST /api/items/:id/wear` (`wear`): ±1, `already`, 404 | `api.db.test.ts`:<br>› "wear +1 → count 1, last_worn today, already false; +1 again → already true, count 1"<br>› "wear −1 removes the latest day; to zero → last_worn null"<br>› "wear on an unknown id (+1 and −1) → 404 not_found" |
| 6 | AC2: invalid input → 400 with a code | `server/validate.test.ts` (every field and reason). `server/api.test.ts` (no DB) › "invalid bodies → 400 `invalid_input` with field and reason", › "malformed JSON → 400 `invalid_json`", › "bad id → 400 `invalid_input` field `id`", › "`today` outside ±1 day → 400 field `today`" |
| 7 | AC2: DB errors never leak SQL or internals | `server/errors.test.ts` (mapping table). `api.test.ts` › "stub pool rejecting with a pg-like error (message, detail, query text, password) → 500 `{code:"internal", requestId}`; body and log lines contain none of it". The reviewer greps `server/api.js`, `server/items.js` and `server/errors.js`: no `err.message`, `err.detail`, `err.stack` or whole error object is ever sent or logged. |
| 8 | Ticket: CSRF (A11) | `api.test.ts`:<br>› "PUT/POST/DELETE with `Sec-Fetch-Site: cross-site` or `same-site` → 403 `forbidden_origin`"<br>› "`same-origin`, `none` or no header → allowed"<br>› "PUT/POST without `Content-Type: application/json` → 415"<br>› "no `Access-Control-*` header on any /api response" |
| 9 | Ticket: parameterised SQL only | The reviewer reads `server/items.js`. Every value goes through `$n` parameters, and no SQL string is built from input. |
| 10 | Ticket: enum-drift test against `pg_enum` | `api.db.test.ts` › "server enum constants equal pg_enum (item_category, item_status, in order)" and › "every SEASONS value passes the items.seasons check" |
| 11 | Ming's note: route from the raw `pathname` inside the guarded branch; decode ids only after the access check | `api.test.ts` › "routing uses the raw pathname: `/api/items/%2e%2e`, `/api/items/<uuid>%2Fwear`, `/api/%69tems`, `/api/items/`, `/api/items//wear` → 404/400, never a DB call". `app.test.ts` › "/api routes are unreachable without a valid JWT (401 before any handler or body read)". The reviewer reads `app.js` and `api.js`: `handleApi` is called only after `access.verify`, it receives the `pathname` computed in `app.js`, and it never re-parses `req.url`. |
| 12 | Body limit and no DB → 503 | `api.test.ts` › "body > 256 KB → 413 `payload_too_large` (Content-Length and chunked)", › "pool null → 503 `db_unavailable` on every endpoint with valid input" |
| — | Checks green (R8) | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `CI=true TEST_DATABASE_URL=… pnpm test:coverage` (thresholds on `server/validate.js` and `server/errors.js`) and `pnpm build` all pass, and the CI `ci` job is green. |
| — | Scope (R1, R7, R10) | `git diff --stat origin/main...HEAD` touches only the files listed below. Nothing under `src/**`, `vite.config.ts`, `Dockerfile`, `docker/**`, `scripts/**`, `.github/**`, `db/migrations/**`, `server/migrat*.js`, `server/index.js`, `server/access.js`, `server/static.js`, `server/db.js` or `package.json`/`pnpm-lock.yaml` is touched. |

## Ming verification after merge
None. Production keeps running the nginx image until T-015, and the SPA does not call `/api` until T-014.

Optional local run (requires a local Postgres):
1. `DATABASE_URL=… node server/migrate.js`
2. `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start`
3. `curl -s localhost:3000/api/items` should return `{"items":[]}`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/api.js` | create | `handleApi(req, res, ctx)`: the router over the raw `pathname` (A15), the method check and 405, CSRF (A11), body reading, validation, the no-DB 503 and the DB error mapping. It is the only caller of `items.js`. |
| `server/items.js` | create | All SQL: `listItems`, `listLocations`, `saveItem` (one transaction), `removeItem`, `wearItem`, plus `toItemRow(row)` for the wire shape (A9). Parameterised only. |
| `server/validate.js` | create | Pure: `CATEGORIES`, `STATUSES`, `SEASONS`, `isUuid`, `isCalendarDate`, `vnToday(now)`, `parseItemInput(body)`, `parseWearInput(body, now)`. Returns `{ ok: true, value }` or `{ ok: false, field, reason }` (A13, A16–A19). |
| `server/errors.js` | create | Pure: `mapDbError(err)` → `{ status, code }` (A20) and `dbLogFields(err)` → `{ code, constraint, routine }` (strings only). |
| `server/http.js` | modify | Add `readJson(req, { limit })` → `{ ok: true, value }` or `{ ok: false, status, code }` (415/413/400, A21). `sendJson` and `sendError` stay as they are. |
| `server/app.js` | modify | Replace the placeholder `return sendError(res, 404, "not_found")` (line 66) with `return handleApi(req, res, { pool, pathname, id, log, now, setRoute })`. Add an optional `now = () => Date.now()` to `createApp` (A12 clock), and widen the `pool` JSDoc type to cover `connect()`. Nothing else changes. |
| `server/app.test.ts` | modify | Two existing tests use `/api/items` as a "not found" path, and that path is now a real route: › "access off (dev) → /api reaches the router (404 JSON)" and › "log: … never the URL". Point them at `/api/nope`. Rewrite the log test so it asserts the route template (`/api/items/:id`) and that the raw id and query never appear. Add the case in AC row 11. |
| `server/api.test.ts` | create | Request-level tests without a DB (`pool: null` or a stub `{ query, connect }`). Covers routing, 404/405, CSRF, 415/413/`invalid_json`/`invalid_input`, 503, DB error mapping and no leaks. |
| `server/api.db.test.ts` | create | Endpoint tests against real Postgres: `createTestDb()` + `runMigrations` on `db/migrations`, `createApp` with `createPool(db.url)`, `listen(0)`, `fetch`. Includes the NFC race and the enum-drift test. Uses `describe.skipIf(!dbAvailable)`; `server/test/pg.ts` throws in CI without `TEST_DATABASE_URL`, so these tests cannot skip in CI. |
| `server/validate.test.ts` | create | Pure tests for every validation rule and reason code. |
| `server/errors.test.ts` | create | Pure tests for the mapping table and `dbLogFields`. |
| `server/README.md` | modify | Replace "endpoints arrive in T-013.2" with an endpoint table, the error codes and reasons, the wire format (A9) and the CSRF rules. Keep the router note at line 20. |
| `vitest.config.ts` | modify | Add `"server/validate.js": thresholds` and `"server/errors.js": thresholds` to `coverage.thresholds`. `api.js` and `items.js` stay report-only (their DB paths skip locally without Postgres, same reasoning as T-012 A8 and T-013.1). This is not a Figma Make file, so R10 does not apply. |

No new dependency: the slice uses `pg` (existing) and `node:*` modules only.

## Tests to write
Every new test file starts with `// @vitest-environment node`. DB files import `server/test/pg.ts`.

**`server/validate.test.ts`** (pure)
| Test (file › name) | Covers |
|---|---|
| "name: trims; '' or whitespace → `nameRequired`; non-string → `nameRequired`; 120 code points (emoji, Vietnamese with combining marks) ok, 121 → `nameTooLong`" | A13 |
| "category/status: each enum value ok; unknown or Vietnamese label → `invalidValue`; missing → default (`other`, `active`)" | A16 |
| "brand/size/material: trim, '' → null, 200 ok / 201 → `tooLong`, number → `invalidType`" | A13 |
| "notes: 2000 ok / 2001 → `tooLong`" | A13 |
| "price: null ok; 0 ok; 150000 ok; −1 → `priceNegative`; 1.5, NaN-like, '100', 1e14, 2^53 → `priceInvalid`" | A13 |
| "purchase_date: null or '' → null; '2026-02-29' and '2026-13-01' → `dateInvalid`; '2024-02-29' ok; timestamps → `dateInvalid`; future date accepted (no `dateFuture`)" | A13 |
| "colors/tags: arrays of strings; 50 entries ok, 51 → `tooMany`; entry of 51 code points → `tooLong`; non-array or non-string entry → `invalidType`" | A13 |
| "seasons: subset of the 4 values ok; 'monsoon' or Vietnamese label → `invalidValue`" | A13 |
| "location_name: NFC + trim; NFD 'Tủ' equals the NFC form; '' → null; 80 code points ok, 81 → `tooLong`" | A10, A18 |
| "body not a plain object (array, null, string) → field null, reason `notObject`" | A17 |
| "unknown keys (id, location_id, wear_count, created_at, user_id, __proto__) are dropped, never copied" | Whitelisting |
| "first error wins in fixed field order" | A17 |
| "isUuid: lowercase and uppercase v4 ok; 35/37 chars, non-hex, percent-encoded → false" | A15 |
| "parseWearInput: delta 1/−1 ok; 0, 2, '1', 1.0001 → `invalidValue`; today invalid → `dateInvalid`; vnToday ±1 ok, ±2 → `todayOutOfRange`; boundary at 17:00Z (UTC+7 midnight)" | A12, A19 |
| "vnToday uses UTC+7 regardless of process TZ" | A12 |

**`server/errors.test.ts`** (pure)
| Test | Covers |
|---|---|
| "22P02, 22001, 22003, 22007, 22008, 23502, 23514 → 400 `invalid_input`" | A20 |
| "23503 → 404 `not_found`; 23505, 40001, 40P01 → 409 `conflict`" | A20 |
| "08xxx, 53300, 57P01–57P03, 57014, ECONNREFUSED/ECONNRESET/ETIMEDOUT/ENOTFOUND/EAI_AGAIN, pg-pool connect timeout → 503 `db_unavailable`" | A20 |
| "anything else (no code, XX000, TypeError) → 500 `internal`" | A20 |
| "dbLogFields keeps only code/constraint/routine (strings), never message/detail/hint/where/query" | No leaks |

**`server/api.test.ts`** (no DB)
| Test | Covers |
|---|---|
| "unknown /api paths → 404 `not_found`; known path, wrong method → 405 with `Allow` (`GET` / `PUT, DELETE` / `POST`)" | Routing |
| "routing uses the raw pathname: `/api/items/%2e%2e`, `/api/items/<uuid>%2Fwear`, `/api/%69tems`, `/api/items/`, `/api/items//wear`, `/api/items/<uuid>/wear/` → 404 or 400, stub pool never called" | Ming's note, A15 |
| "bad id (`not-a-uuid`, percent-encoded uuid) on PUT/DELETE/POST wear → 400 `invalid_input` field `id` reason `idInvalid`" | A15 |
| "PUT/POST/DELETE with `Sec-Fetch-Site: cross-site` or `same-site` → 403 `forbidden_origin`, before the body is read; `same-origin`, `none` or no header → passes" | A11 |
| "PUT/POST with no Content-Type, `text/plain`, `application/x-www-form-urlencoded` → 415; `application/json; charset=utf-8` and `Application/JSON` → accepted" | A11, A21 |
| "body > 256 KB → 413 `payload_too_large` (declared Content-Length and chunked); exactly 256 KB is read" | A21 |
| "malformed JSON, empty body, invalid UTF-8 → 400 `invalid_json`" | AC2 |
| "invalid bodies → 400 `invalid_input` with field and reason" (a few cases end to end) | AC2 |
| "`today` outside ±1 day of the injected clock → 400 field `today` reason `todayOutOfRange`" | A12 |
| "pool null → 503 `db_unavailable` on every endpoint with valid input" | R8 (consult) |
| "stub pool rejecting with a pg-like error (message with SQL, detail, password, `code: 'XX000'`) → 500 `{code:"internal", requestId}` matching `X-Request-Id`; body and log lines contain none of the secret strings" | AC2 |
| "stub pool rejecting with 23503 on wear → 404; ECONNREFUSED on list → 503" | A20 |
| "save: a stub client error after `begin` → `rollback` is called and the client is released" | Transaction hygiene |
| "every /api response: `Cache-Control: no-store`, JSON content type (except 204), no `Access-Control-*` header" | A11 |
| "log line: route template (`/api/items`, `/api/items/:id`, `/api/items/:id/wear`, `/api/locations`, `/api` for unmatched); a db_error line carries id and code only" | Logging |

**`server/api.db.test.ts`** (real Postgres; `truncate … cascade` in `beforeEach`)
| Test | Covers |
|---|---|
| "empty DB → GET /api/items `{ items: [] }`, GET /api/locations `{ locations: [] }`" | AC1 |
| "GET /api/items → rows newest first; ItemRow shape: price number or null, purchase_date/last_worn 'YYYY-MM-DD' or null, created_at/updated_at ISO strings, wear_count number, location_name, primary_photo_path null even when an item_photos row exists" | AC1, A9 |
| "GET /api/locations → names ordered by sort_order, name" | AC1, A14 |
| "PUT creates with the client UUID → 200 `{ item }`; PUT again with changes → same id, created_at unchanged, updated_at bumped" | AC1, A10 |
| "PUT twice with the same body is idempotent (one row)" | A10 |
| "full round-trip of every field (incl. Vietnamese text, emoji, arrays, null price/date)" | AC1 |
| "location NFC race: 8 concurrent PUTs (different items) with 'Tủ phòng ngủ' in NFC and NFD, padded with spaces → all 200, one locations row in NFC form, all items share it" | A10 race |
| "location_name null or '' → location_id null; an existing location is reused" | A10 |
| "a failing item insert rolls back a newly created location (transaction)" (trigger the failure with a DB-only constraint, e.g. a stub that bypasses validation, or by calling `saveItem` directly with an invalid enum) | A10 same transaction |
| "DELETE → 204 and the item and its wear logs are gone; DELETE again → 204; DELETE of a never-existing UUID → 204" | AC1, A10 |
| "wear +1 → `{ wear_count: 1, last_worn: today, already: false }`; +1 again same day → `already: true`, count 1" | AC1 |
| "wear −1 removes the latest day (logs on two days); −1 to zero → `{ wear_count: 0, last_worn: null, already: false }`; −1 at zero → 200 unchanged" | AC1, A22 |
| "wear on an unknown id: +1 → 404 (FK 23503), −1 → 404" | AC1 |
| "server enum constants equal pg_enum (item_category, item_status, in enumsortorder)" | Enum drift |
| "every SEASONS value passes the items.seasons check" | Enum drift (check constraint) |

**`server/app.test.ts`** (modified)
| Test | Covers |
|---|---|
| "access off (dev) → /api reaches the router (404 JSON)", now on `/api/nope` | Existing test kept valid |
| "log: … route template; never the raw URL, id, query, headers or token", rewritten to use `/api/items/<uuid>?secret=qq` with `pool: null`, expecting route `/api/items/:id` and status 503 | Logging |
| "/api routes are unreachable without a valid JWT: PUT /api/items/<uuid> with a body → 401, and the stub pool and body reader are never called" | Ming's note |

## Approach
1. **`server/validate.js`** (pure, `// @ts-check`, no imports from `src/`):
   - **Constants:**
     - `CATEGORIES = ["top","bottom","dress","outer","shoes","bag","accessory","sport","home","other"]`
     - `STATUSES = ["active","stored","laundry","lent","out"]`
     - `SEASONS = ["spring","summer","autumn","winter"]`
     - These are copied from `db/migrations/20261110120000_init.sql:16-20,55`. The enum-drift test guards them.
   - **Helpers:**
     - `cpLen = (s) => [...s].length` counts code points, matching Postgres `char_length` and `validate.ts`.
     - `isUuid` uses `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, the same regex as `mappers.ts:86`.
     - `isCalendarDate(s)`: `^\d{4}-\d{2}-\d{2}$`, year 1000–9999, then a UTC round trip.
     - `vnToday(now)`: `new Date(now + 7*3600e3).toISOString().slice(0,10)`. Vietnam has no DST, and this is the same rule as `toDateOnly` in `serialize.ts:32-38`.
   - **`parseItemInput(body)`:**
     - Body not a plain object → `notObject`.
     - Then check fields in a fixed order: `name`, `category`, `status`, `brand`, `size`, `material`, `price`, `purchase_date`, `location_name`, `colors`, `seasons`, `tags`, `notes`. Return the first error (A17).
     - Build a **new** object from those keys only.
     - Rules: A13, plus A16 (defaults) and A18 (strings).
   - **`parseWearInput(body, now)`:**
     - `delta` must be exactly the number `1` or `-1`.
     - `today` must pass `isCalendarDate`, and `|day(today) − day(vnToday(now))| ≤ 1` (A12).
2. **`server/errors.js`** (pure):
   - `mapDbError(err)` follows the table in A20.
   - `dbLogFields(err)` returns `code`, `constraint` and `routine` only, and only when they are strings.
   - Neither function ever reads `message`, except for the one exact-equality check on pg-pool's connect-timeout message in A20. Even that message is never logged or returned.
3. **`server/http.js` › `readJson(req, { limit = 262144 })`:**
   1. Check the media type: the part of `Content-Type` before `;`, trimmed and lowercased, must be `application/json`. Otherwise → `{ ok:false, status:415, code:"unsupported_media_type" }`, without reading the body.
   2. If `Content-Length` is greater than `limit` → 413 at once.
   3. Otherwise collect chunks. Once the total exceeds `limit`, stop collecting → 413. On a 413, the caller sends `Connection: close`.
   4. Decode with `new TextDecoder("utf-8", { fatal: true })`, then `JSON.parse`. Any failure, or an empty body → 400 `invalid_json`.
   5. A request that aborts or errors → reject. The top-level catch in `app.js` destroys the response.
4. **`server/items.js`** (all SQL; `$n` parameters only):
   - **`toItemRow(r)`:**
     - Copy all 20 view columns.
     - `price` → `r.price === null ? null : Number(r.price)`. This is safe because `numeric(14,0)` is below 2^53.
     - `created_at`/`updated_at` → `.toISOString()`.
     - `primary_photo_path: null` (A9).
     - Dates are already strings thanks to the per-pool 1082 parser in `db.js`.
   - **`listItems(pool)`:** `select * from items_with_stats order by created_at desc, id`.
   - **`listLocations(pool)`:** `select name from locations order by sort_order, name` → `string[]`.
   - **`saveItem(pool, id, v)`:** take one client with `pool.connect()`, then:
     1. `begin`
     2. If `v.location_name` is set: `insert into locations (name) values ($1) on conflict (name) do update set name = excluded.name returning id`. This is the race-free form already pinned by `schema.db.test.ts:42-50` (A23).
     3. `insert into items (id, name, category, status, brand, size, material, price, purchase_date, location_id, colors, seasons, tags, notes) values ($1…$14) on conflict (id) do update set name = excluded.name, … , notes = excluded.notes`. `id` and `created_at` are never updated; `updated_at` comes from the trigger.
     4. `commit`
     5. On error: `rollback` (ignore its failure), then `client.release(err)` so a broken connection is discarded, and rethrow. Otherwise `client.release()`.
     6. After commit, read back with `select * from items_with_stats where id = $1`. No row (deleted concurrently) → `null` → 404.
   - **`removeItem(pool, id)`:** `delete from items where id = $1`. Wear logs and photo rows cascade (schema).
   - **`wearItem(pool, id, delta, today)`:**
     - `+1`: `insert into wear_logs (item_id, worn_on) values ($1, $2) on conflict (item_id, worn_on) do nothing returning id`, with `already = rowCount === 0`. An FK error 23503 propagates and maps to 404.
     - `−1`: `delete from wear_logs where id = (select id from wear_logs where item_id = $1 order by worn_on desc limit 1)`, with `already = false` (A22).
     - Then `select wear_count, last_worn from items_with_stats where id = $1`. No row → `null` → 404.
5. **`server/api.js` › `handleApi(req, res, { pool, pathname, id, log, now, setRoute })`:**
   1. **Route** on `pathname.split("/")`, the raw string from `app.js`, with no decoding (A15). Exact shapes:
      - `["", "api", "items"]` → `/api/items`
      - `["", "api", "locations"]` → `/api/locations`
      - `["", "api", "items", X]` → `/api/items/:id`
      - `["", "api", "items", X, "wear"]` → `/api/items/:id/wear`
      - Anything else (including empty or trailing segments) → `setRoute("/api")` and 404 `not_found`.
      - Call `setRoute(template)` for every match.
   2. **Method:** a matched path with a wrong method → 405 `method_not_allowed` with `Allow`.
   3. **CSRF** for PUT, POST and DELETE: `sec-fetch-site` of `cross-site` or `same-site` → 403 `forbidden_origin` (A11).
   4. **Id:** `X` must pass `isUuid` on the raw segment. No decoding is done: a valid UUID contains no `%`, so a percent-encoded id fails as `idInvalid` (A15). Failure → 400 `invalid_input`, field `id`, reason `idInvalid`.
   5. **Body** (PUT and POST): `readJson`. A failure → `sendError(status, code)`, plus `Connection: close` on 413.
   6. **Validate:** `parseItemInput` / `parseWearInput(body, now())`. Failure → 400 `{ error: { code: "invalid_input", field, reason } }`.
   7. `!pool` → 503 `db_unavailable`.
   8. **Call `items.js`** and send the result: 200 / 204 / 404 as in the table above.
   9. **On error:** `const m = mapDbError(err)`. Log `{ event: "db_error", id, ...dbLogFields(err) }`. Then send `sendError(res, m.status, m.code, m.code === "internal" ? { requestId: id } : {})`.
   - No CORS headers. GET routes accept `GET` only (A24).
6. **`server/app.js`:**
   - Import `handleApi`.
   - Add `now = () => Date.now()` to the destructured deps.
   - In the guarded branch, after the `access.verify` block, call `return handleApi(req, res, { pool, pathname, id, log, now, setRoute: (t) => { route = t; } })`.
   - The `/api` prefix check, the access check and the single `pathname` stay exactly as they are (security review attempt 2, note 3).
   - Widen the `pool` JSDoc to `{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> } | null`, so the existing `{ query }` stubs still type-check. `saveItem` treats a missing `connect` as a programming error, which reaches the existing 500 path.
7. **`server/README.md`:** add the endpoint table, the error codes (A10 list) and reason codes (A17), the wire format (A9), the CSRF rules (A11) and the `today` rule (A12). The router note stays.
8. **`vitest.config.ts`:** add the two thresholds.
9. Run `pnpm format`, then all Checks, including `CI=true TEST_DATABASE_URL=… pnpm test:coverage` against a local Postgres 17 if available. Otherwise state in `impl-log.md` that the DB tests were left to CI.

Rules:
- **R1:** `src/` is untouched. Local mode is unaffected; the SPA does not call `/api` until T-014.
- **R2:** no schema change (D25: no RLS by design; the T-012 schema is used as is).
- **R3:** nothing secret is sent or logged. Only `code`/`constraint`/`routine` and the request id are logged, and there is no `VITE_*` variable.
- **R4:** no photos. `primary_photo_path` is always `null`.
- **R5:** `wear_count`/`last_worn` are read from `items_with_stats` only, and nothing derived is written.
- **R6:** no UI copy. The server sees DB ids only; labels stay in `mappers.ts`.
- **R7:** only the listed files.
- **R8:** tests above; DB tests cannot skip in CI; thresholds on the pure modules.
- **R9:** no UI.
- **R10:** `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

## Specialist input used
- **`work/tickets/T-013/consult-software-architect.md`:**
  - **R3:** adopted as fixed by A8–A10:
    - one route per repo method;
    - the `save` transaction (with the location upsert form adapted, see A23);
    - the wear SQL;
    - ItemRow conversion (price as a number, per-pool 1082 parser, ISO timestamps).

    The consult's camelCase wear response (`{ wearCount, lastWorn, already }`) is **not** adopted: A9 makes it snake_case.
  - **R4:** adopted (whitelist, reason codes, enum constants plus drift test, caps, no `dateFuture`, 415/413/`invalid_json`/405/404 JSON).
  - **R5:** adapted as already approved in A11: `Sec-Fetch-Site` instead of comparing `Origin` with `Host`.
  - **R8:** "no DATABASE_URL → `/api` 503 `db_unavailable`" adopted.
  - **R9:** central mapper adopted and extended (A20). It adds 409 for 23505/serialisation failures and 503 for connection-class errors and timeouts, so an outage does not look like a bug (500). Only `code`/`constraint`/`routine` are logged, and a no-leak test is included.
  - **R10:** adopted (`createTestDb` + `runMigrations` + `listen(0)` + `fetch`; NFC race; wear twice; unknown location). The coverage threshold applies to the pure modules only, not all of `server/**`, as in T-013.1.
  - **Optional `server/api-types.d.ts`:** not adopted (A25).
- **`work/tickets/T-013/security-review.md`:**
  - Attempt 2, note 3: adopted as A15 (raw pathname, handler only after the access check, ids matched raw against the UUID regex, no decode-then-route). It is tested in AC row 11.
  - Attempt 1, note 10 (request id on log lines): adopted for the new `db_error` line only.
  - Attempt 1, note 8 (README wording): left as a follow-up (R7).
- **`server/README.md:20`** router note: followed as written.

## Assumptions
A1–A14 are approved with T-013 and are not reopened. **A15–A27 are new and need Ming's confirmation.**

- **A15 — Raw-segment routing; ids are never decoded.**
  - The router splits the raw `pathname` from `app.js` on `/` and matches literal segments exactly.
  - The id segment is checked against the UUID regex **as is**. A canonical UUID contains no `%`, so no decoding step is needed; an encoded or otherwise odd id → 400 `idInvalid`.
  - This is stricter than "decode only after the access check" and satisfies it.
  - Trailing slashes and empty segments → 404.
  - Upper-case UUIDs are accepted, and Postgres returns them lowercase.
- **A16 — `PUT` is a full replacement.**
  - The body is the `itemToRow` shape minus `id`/`location_id`, plus `location_name`.
  - Only `name` is required. Omitted optional fields take the DB defaults: `null`, `[]`, `category "other"`, `status "active"`. So a PUT that omits `status` resets it to `active`.
  - T-014 always sends every field, because `itemToRow` does.
  - Unknown keys are ignored, not rejected. This keeps T-014 free to send `id`/`location_id` from `itemToRow`.
- **A17 — Error body and reasons.**
  - Validation returns only the **first** error, in fixed field order: `{ error: { code: "invalid_input", field, reason } }`, with `field` in snake_case (`name`, `price`, `purchase_date`, `location_name`, …, `id`, `delta`, `today`, or `null` for the whole body).
  - Reasons reused from `validate.ts`: `nameRequired`, `nameTooLong`, `priceNegative`, `priceInvalid`, `dateInvalid`.
  - New reasons: `invalidType`, `invalidValue`, `tooLong`, `tooMany`, `notObject`, `idInvalid`, `todayOutOfRange`.
  - DB-detected 400s (A20) carry no `field`/`reason`.
- **A18 — String normalisation.**
  - `name`, `brand`, `size`, `material` and `notes` are trimmed, and `''` becomes `null`. `name` must be non-empty.
  - Only `location_name` is NFC-normalised (A10).
  - `colors`/`tags` entries are stored as sent (no trim or dedupe; the client already controls them). `seasons` is checked as a subset, and duplicates are allowed as the DB allows them.
  - No control-character filtering.
- **A19 — Number and date rules.**
  - `price` must be `null` or a safe integer with `0 ≤ price < 1e14` (numeric(14,0)). Strings are rejected (`priceInvalid`), and `0` is stored as `0`.
  - `purchase_date` and `today` must be `YYYY-MM-DD`, year 1000–9999, and a real calendar date. `purchase_date: ""` is treated as `null`.
  - `delta` must be exactly `1` or `-1` (JSON number).
- **A20 — DB error mapping:**

  | pg / Node error | Response |
  |---|---|
  | `22P02`, `22001`, `22003`, `22007`, `22008`, `23502`, `23514` | 400 `invalid_input` |
  | `23503` | 404 `not_found` |
  | `23505`, `40001`, `40P01` | 409 `conflict` |
  | class `08`, `53300`, `57P01`–`57P03`, `57014` (statement timeout), `ECONNREFUSED`/`ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`EAI_AGAIN`, and pg-pool's code-less "timeout exceeded when trying to connect" (matched by exact message; the implementer confirms the string in the installed `pg-pool`) | 503 `db_unavailable` |
  | everything else | 500 `internal` with `requestId` |

- **A21 — Body handling.**
  - The limit is 256 KB (262 144 bytes) of raw body.
  - The media type is compared case-insensitively, and parameters are ignored.
  - Invalid UTF-8, an empty body or malformed JSON → 400 `invalid_json`.
  - 413 responses close the connection.
  - The body is read only after routing, the method check, CSRF and the id check, so unauthenticated or obviously bad requests never cost a body read.
- **A22 — Wear semantics follow the current Supabase repo:**
  - `−1` deletes the latest log whatever its date. `today` is still required and validated on `−1` for one uniform body.
  - `−1` at zero → 200 with the unchanged stats.
  - `last_worn` is `null` when there are no logs; T-014 maps `null` → `""`.
  - Both deltas → 404 for an unknown item.
- **A23 — Location get-or-create uses `insert … on conflict (name) do update set name = excluded.name returning id`.** This is one statement that always returns the id, already proven race-free in `schema.db.test.ts:42-50`. The consult's "do nothing + fallback select" is replaced by it. Same effect, one round trip fewer.
- **A24 — Status codes and methods.**
  - `PUT` → 200 for both create and update (not 201).
  - `GET` routes accept `GET` only (no `HEAD`), with `Allow: GET`. `/api/items/:id` gives `Allow: PUT, DELETE`; `/api/items/:id/wear` gives `Allow: POST`.
  - `DELETE` needs no Content-Type and ignores any body.
- **A25 — No shared wire-type file.** The wire format is documented in `server/README.md`. T-014 defines its client types in `src/`, because `src/` cannot import `server/` (consult finding 2).
- **A26 — DB-less operation.** With no pool, every API route still validates input and then returns 503 `db_unavailable`. The SPA and health endpoints are unaffected, so T-015's smoke test without env keeps working.
- **A27 — Size: about 400 lines of production JS.** Estimate: `validate.js` ~130, `api.js` ~110, `items.js` ~85, `errors.js` ~35, `http.js` +40, `app.js` +5. That is at the ~400-line guide, so this plan does not split (see `## Split proposal`). If the implementer exceeds ~450 lines, it records that in `impl-log.md` rather than cutting tests.
- **Hotspot files** shared with T-014 and T-015: `vitest.config.ts` (thresholds block) and `server/README.md` (T-015 adds image notes). This slice does not touch `package.json`/`pnpm-lock.yaml`.

Follow-ups (not in this diff):
- `server/README.md:11` wording on fail-closed (security review attempt 1, note 8).
- Request id on the `access_denied`/`readyz_failed` log lines (attempt 1, note 10).
- `.github/risk-tiers.yml`: add `server/api.js` and `server/items.js` (write paths) next to the T-013.1 follow-up for `access.js`/`index.js`.
- A bulk import endpoint, if `importRunner` over HTTP proves slow (A8).

## Blocking questions
None. Every new choice has a default (A15–A27) for Ming to confirm at plan approval.

## Split proposal
None. The slice is about 400 lines of production JS (A27), right at the guide, and it is one feature: the five endpoints of one interface. Splitting reads from writes would leave T-014 blocked until both halves land, and it would duplicate the router, CSRF and error-mapping scaffolding across two review cycles. If Ming prefers a split anyway, the cut would be:
- **T-013.2a:** `validate.js`, `errors.js`, `readJson`, router, `GET /api/items`, `GET /api/locations`.
- **T-013.2b:** `PUT`, `DELETE` and wear, with the NFC race and transaction tests.
