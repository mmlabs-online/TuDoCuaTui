# Review — T-013.2

## Attempt 1 — 2026-11-11
Verdict: PASS

Judged against plan.md (A15–A27, approved 2026-11-11), the T-013 contract A8–A14, both ticket ACs, Ming's
routing note, and CLAUDE.md R1–R10 (D25 replaces RLS). Diff: `git diff origin/main...HEAD` on
`claude/loving-fermi-t90upb` (commits `0b5dbd7`, `d59472b`, `13e38d6`).

### Checks (run by reviewer)
Local PostgreSQL 16.15, temp data dir under /tmp, scram password auth, port 55432. Stopped and deleted afterwards.
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: "All matched files use the correct format."
- test (with `TEST_DATABASE_URL`): 55 files, 626 tests passed, exit 0. This matches impl-log.md.
- `CI=true pnpm test:coverage` (with `TEST_DATABASE_URL`): 626 passed, thresholds met, exit 0. Report-only rows:
  `api.js` 98.2% statements / 95.6% branches, `items.js` 100/91.7, `http.js` 100/92.3. `validate.js` and `errors.js`
  are fully covered, so the reporter omits them.
- build: pass (`vite build`, exit 0)
- Smoke run: `TUDO_ACCESS_DISABLED=1 node server/index.js` against a DB migrated with `node server/migrate.js`,
  exercised with curl and a raw-socket client:
  - GET items, empty and filled: 200. GET locations: 200.
  - PUT create, which ignored the `id` and `wear_count` keys in the body. PUT with an NFD + padded location name:
    one location row, in NFC form. PUT with an upper-case id: returned lowercase. Omitted fields reset (A16).
  - Wear:
    - +1 → `{1, today, already:false}`; +1 again → `already:true`.
    - −1 → `{0, null, false}`; −1 at zero → 200, unchanged.
    - `today` 2020-01-01 → 400 `todayOutOfRange`; delta 0 → 400 `invalidValue`.
    - +1 and −1 on an unknown id → 404 `not_found`.
  - DELETE: 204, again 204, never-existing id 204.
  - Invalid input → 400 with `field`/`reason`: blank name, Vietnamese category label, string price, negative price,
    2026-02-30, `monsoon`, array body. Malformed or empty JSON → 400 `invalid_json`.
  - Content type: text/plain, form and missing Content-Type (PUT and POST) → 415.
  - CSRF: PUT, DELETE and POST with `Sec-Fetch-Site: cross-site` or `same-site` → 403 `forbidden_origin`.
    `same-origin` → 200. A cross-site GET is allowed, and no CORS headers are sent.
  - 300 KB body → 413 with `Connection: close`: tested with Content-Length, with curl chunked, and with a slow
    64 KB-per-50 ms chunked socket client. All three got a clean 413 response, not a reset.
  - Encoded and odd paths:
    - `%2D` or `%61` inside the id → 400 `idInvalid`.
    - `/api/%69tems`, raw `/api/items/../locations`, `/api/items/`, `/api/items//wear` and `…/wear/` → 404.
    - `<uuid>%2Fwear` (POST) → 405 on `/api/items/:id`.
    - None of these reached the DB.
  - Methods: HEAD/OPTIONS on `/api/items`, GET on `…/wear`, PATCH on `:id` → 405 with the right `Allow`.
  - Postgres stopped while the server ran: `/api/items` and PUT → 503 `db_unavailable`. The log line is
    `{event:"db_error", id, code:"ECONNREFUSED"}`.
  - No `DATABASE_URL`: validation still runs (400), and valid requests → 503; `/healthz` → 200.
  - Server log: route templates only. A grep for the password, port and SQL text found nothing.

### Acceptance criteria
- [x] **AC1: every `WardrobeRepo` operation has an endpoint with tests.**
  - `list` → GET /api/items: `server/api.db.test.ts:60,65`.
  - `locations` → GET /api/locations: `server/api.db.test.ts:91`.
  - `save` → PUT /api/items/:id: `server/api.db.test.ts:100,112,120,152,166,176`, covering upsert,
    idempotency, round-trip, the NFC race (8 concurrent PUTs), location reuse and transaction rollback.
  - `remove` → DELETE: `server/api.db.test.ts:196`.
  - `wear` → POST …/wear: `server/api.db.test.ts:207,221,240`, covering ±1, `already` and 404.
  - Enum drift against `pg_enum`: `server/api.db.test.ts:248,260`.
  - All pass against real Postgres. In CI they cannot skip, because `server/test/pg.ts` throws.
- [x] **AC2: invalid input → 400 with a code; DB errors never leak SQL or internals.**
  - Tests: `server/validate.test.ts` (21 cases), and `server/api.test.ts:202,211,229` (`invalid_json` and
    `invalid_input` with field/reason).
  - No leaks:
    - `server/api.test.ts:261` checks that the body and logs contain none of the message, detail or query.
    - `server/errors.js:21-32` maps errors and reads `message` only at `errors.js:28`, for an exact match on
      pg-pool's code-less string, which I confirmed at `pg-pool/index.js:224`.
    - `server/errors.js:35-44` logs only `code`, `constraint` and `routine`.
    - A grep of the new modules for `err.message`, `.detail`, `.stack` and `console.` found no match.
  - One input class still returns 500 instead of 400: a NUL character (see Issue 1). This follows the approved
    A18/A20, and nothing leaks.
- [x] **Ming's note: route only from the raw `pathname`, inside the guarded branch, and decode ids only after the
  access check.**
  - `server/app.js:42` computes `pathname` once. `app.js:59-67` runs the access check, and only then does
    `app.js:68-77` call `handleApi`.
  - `server/api.js:33` splits that same string and never touches `req.url`.
  - `server/api.js:49-52` matches the id raw against the UUID regex and never decodes it (A15, stricter than the
    note).
  - Tests: `server/app.test.ts` "/api routes are unreachable without a valid JWT" (401, the stub pool is never
    called), and `server/api.test.ts:81` (raw-path cases, no DB call).
- [x] **CSRF (A11)**: `server/api.js:44-48` runs before the id check and before the body read. `server/http.js:45-48`
  checks the media type before reading. Tests: `server/api.test.ts:120,146,158`.
- [x] **Parameterised SQL only**: `server/items.js:34,40,55-57,61-87,101,111-124`. Every value is a `$n`
  parameter, and no SQL is built from input.
- [x] **Body limit and no-DB 503**: `server/http.js:50,54-57` and `server/api.js:70`. Tests: `server/api.test.ts:176,245`.
- [x] **Scope**: every changed file is in the plan's file list. The only others are workflow bookkeeping:
  `ticket.md`, `consult-software-architect.md`, the `ming-todo.md` plan-approval line, and `impl-log.md`.
  Nothing under `src/**`, `vite.config.ts`, `package.json`, the lockfile, `db/migrations/**`, `index.js`,
  `access.js`, `static.js` or `db.js` changed.
- [x] **Size (A27)**: 440 lines in the four new modules, plus `http.js` +29 and `app.js` +14, about 483 in total.
  That is over the ~450 guide, and impl-log.md records it as A27 requires. A27 says to record an overrun rather
  than cut, and I found no padding.

### Issues
#### Issue 1 — 🟡 should-fix — a NUL character in a string gives 500, not 400
- **Where**: `server/errors.js:4` (the `BAD_INPUT` set). Related: `server/validate.js:50-56,63-73`.
- **Expected**: AC2 says invalid input gets a 400 with a code.
- **Actual**: PUT with `{"name":"a\u0000b"}` or `{"tags":["x\u0000"]}` → Postgres raises `22021`
  (`report_invalid_encoding_int`) → 500 `internal`. Nothing leaks. The approved A20 table sends unlisted codes
  to 500, and A18 says there is no control-character filtering, so this follows the plan. It would still hit T-014
  imports of dirty data as a 500 per row.
- **Fix instruction** (now or in T-014): add `"22021"` to `BAD_INPUT` in `server/errors.js:4`, and add it to the
  400 case in `server/errors.test.ts:8`. Optionally add an `api.db.test.ts` case for a PUT with `\u0000` in
  `name` → 400 `invalid_input`.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- **R1**: `src/` is untouched, and local mode is unaffected.
- **R2**: there is no schema change. Under D25 there is no RLS by design.
- **R3**: no secret is sent or logged. Logs carry only the request id, code, constraint and routine. There is no
  `VITE_*` variable.
- **R4**: `primary_photo_path` is always null (`items.js:28`).
- **R5**: `wear_count` and `last_worn` are read from `items_with_stats` only (`items.js:122`), and nothing derived
  is written.
- **R6**: there is no UI copy, and the server sees DB ids only.
- **R7**: the diff stays inside the plan.
- **R8**: checks are green, the new pure logic has tests, and the DB tests cannot skip in CI.
- **R9**: there is no UI.
- **R10**: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

### Nits (do not block)
- The rewritten log test in `server/app.test.ts` uses GET → 405 rather than the plan's `pool: null` → 503.
  It covers the same thing (route template, no id or query in the log).
- A lone surrogate (`"a\ud800"`) is stored as `a�` (U+FFFD) by JSON → UTF-8 encoding. This is harmless, and
  the plan does not mention it.
- `<uuid>%2Fwear` with POST gives 405 (the segment is treated as an id on `/api/items/:id`). The unit test only
  sends PUT (→ 400). Both responses are safe.

### Follow-ups (out of scope)
- Issue 1 (`22021` → 400) if it is not fixed in this ticket.
- These carry over from the plan:
  - `server/README.md:11` fail-closed wording.
  - Request id on the `access_denied` and `readyz_failed` log lines.
  - Add `server/api.js` and `server/items.js` to `.github/risk-tiers.yml`.
  - A bulk import endpoint, if import over HTTP is slow (A8).

### Security follow-ups to fix (Ming, 2026-11-11: "Sửa cả 2 rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. NUL (`\u0000`) in any string field → 500. Reject it in validation (`server/validate.js` `optString` / `stringArray` / `name` / `location_name`) with reason `invalidValue` and the field name; also add `22021` to `BAD_INPUT` in `server/errors.js:4` as a backstop. Tests in `validate.test.ts` and `errors.test.ts`.
2. Streamed (chunked) body over the cap: make the 413 reliable (`server/http.js:54-56`, `server/api.js:60-61`) — stop collecting but keep draining, or pause `req`, send the 413 with `Connection: close`, and destroy the socket on `res` `finish`. Test: chunked upload in several delayed writes still receives the JSON 413.
