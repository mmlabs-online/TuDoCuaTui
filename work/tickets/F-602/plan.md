Status: READY

# Plan — F-602.1: JSON backup and restore, server endpoints (slice 1 of 2)

> This plan covers **F-602.1 only** (server: `GET /api/backup`, `POST /api/restore`, validation, limits, DB tests).
> F-602.2 (repo methods, UI, Vietnamese copy) is described under `## Split proposal`. Estimated size is under
> `## Split proposal`.
>
> **Gate note for the orchestrator.** Every file in this slice is under `server/**`, which is **High** in
> `.github/risk-tiers.yml:10` ("API, Identity token check, DB access ..."). The ticket says "Expected tier: Medium"
> and `Gate: none`. Workspace rule §8 requires plan approval for tickets that touch High paths, so F-602.1 should
> run with `Gate: plan-approval` and the PR will be High (Ming reviews it). No migration is needed (see Approach).

## Feature summary
`docs/feature-list.md` F-602 (lines 218-221):
> - Export the full JSON (items + wear logs + locations, with photo paths) under `{version: 1}`.
> - Restore upserts by id and is idempotent: running it twice changes nothing.
> - **AC:** export, restore into an empty account and export again give identical JSON (except timestamps and photo URLs).

`work/decisions.md` D1:
> Restore keeps ids when they are free or already owned by the caller; ids owned by another user get new ids, and
> every reference is remapped. Photos are not restored across accounts (their paths are owner-scoped). The AC
> "restore into an empty account" becomes "same account after wipe → identical JSON".

`work/decisions.md` D44: the app always runs against the Node API; there is no local or demo mode.

Ticket scope bullets this slice implements (ticket.md lines 26-38, 43):
> - Export `{ version: 1, exportedAt, locations[], items[], wearLogs[] }` with DB ids and enum ids (not labels).
>   Photos are referenced by their `item_photos` id only, for information; no `/api/photos` URLs, no blob: or
>   data: URLs, no photo bytes.
> - The export comes from the server in one call, scoped to the signed-in user (new endpoint, e.g. `GET /api/backup`) ...
> - Restore validates the file (version, shape, sizes) on the client and again on the server, then upserts
>   locations → items → wear logs by id in **one transaction** on the server (new endpoint, e.g. `POST /api/restore`).
>   Running it twice changes nothing.
> - Id rules (D1): an id that is free or already owned by the caller is kept; an id owned by another user gets a
>   new id and every reference (item → location, wear log → item) is remapped. Ownership is enforced by the
>   existing per-request `app.user_id` RLS, never by ids from the file.
> - Restore never creates or relinks photos, and never clears the photo of an item that already exists. Items
>   restored without a live photo show no photo; the summary counts them.
> - Request body limit and a per-user rate limit for restore, consistent with the other `/api` routes.

Conflict noted (not blocking): the feature list says "with photo paths"; the ticket (re-scoped 2026-11-17) and D1
narrow this to the `item_photos` id only. The ticket is followed (it is the later, more specific text and photo paths
no longer exist since Drive, T-005.x).

## Acceptance criteria → verification
Ticket ACs that are fully or partly server-side. The Vietnamese message part of AC4 and AC5 (390px, dark mode)
belong to F-602.2.

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Export → delete the items of the same account → restore → export again gives identical JSON, apart from timestamps and photo references (D1). | `pnpm test` › `server/backup.db.test.ts` › "AC1: export, delete items, restore, export is identical except exportedAt and photo_id" and "AC1: full wipe including locations round-trips". Also asserts `wear_count`/`last_worn` in `items_with_stats` match the pre-wipe values (R5). |
| 2 | Restoring the same file twice changes nothing. | `server/backup.db.test.ts` › "AC2 same account: second restore leaves every row (incl. updated_at) identical" and "AC2 cross account: second restore into B creates no duplicates and changes nothing". Both compare a full row snapshot of `locations`, `items`, `wear_logs`, `item_photos` before/after the second run; second summary has `inserted = updated = 0`. |
| 3 | Restoring into a different account succeeds: rows whose id belongs to someone else get new ids, every reference is remapped, the other user's rows are untouched; photos are skipped and counted (D1). | `server/backup.db.test.ts` › "AC3: restore A's file as B remaps ids and refs, A untouched, photosMissing counted" (A's rows snapshot byte-identical before/after; B's items have derived ids ≠ A's; B's `items.location_id` and `wear_logs.item_id` point to B's rows; `photosMissing` = number of file items with a `photo_id`). Plus "location merge by name", "foreign wear-log id", "squatted derived id uses next attempt". |
| 4 | An invalid or oversized file is rejected ... and writes nothing (transaction). *(Vietnamese message: F-602.2.)* | `server/backup.db.test.ts` › "AC4: invalid file → 400 invalid_input with field/reason, zero rows written", "AC4: body over cap → 413, zero rows", "AC4: failure after writes started (all derived ids squatted) → 409 restore_conflict, zero rows written". Unit: `server/validate.test.ts` › `parseBackup` cases. |
| 5 | Limits: body cap, per-user rate limit, one restore in flight per user. | `server/backup.test.ts` › "415 / 413 / 429 / 503 restore_busy / 408 slow body" cases; `server/ai/rateLimit.test.ts` › "custom limits"; reviewer reads `server/app.js` wiring. |
| 6 | Export is scoped to the caller and contains no derived or secret fields. | `server/backup.db.test.ts` › "export: caller's rows only, no user_id / wear_count / last_worn / location_name / URLs, deterministic order". |

Checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test` (DB tests need the local test Postgres, as for the
existing `*.db.test.ts`), `pnpm build`.

## Ming verification after merge
- After F-602.2 merges (not this slice): the ticket's manual test — on the real app, export → delete items → restore
  → export → diff.
- For this slice alone: none (no UI uses the endpoints yet). Optional smoke on the deployed app:
  `GET /api/backup` with a signed-in session returns the JSON.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/backup.js` (new) | `handleBackup(req,res,ctx)` for both routes; `exportBackup(pool,userId,now)`; `restoreBackup(pool,userId,backup)`; `uuidv5(name, ns)` and `derivedId(userId, oldId, attempt)`; constants `RESTORE_MAX_BYTES`, `RESTORE_LIMITS`, `RESTORE_GLOBAL_LIMITS`, `RESTORE_BODY_TIMEOUTS` | Scope bullets 2-6; architect R-A/R-B; keeps `items.js` untouched (R7) |
| `server/validate.js` | Add `BACKUP_CAPS` and `parseBackup(body, caps = BACKUP_CAPS)`; items reuse `parseItemInput` per row (no rule copy) | Server-side validation (scope bullet 3, AC4) |
| `server/api.js` | `match()`: `/api/backup` (GET), `/api/restore` (POST); one early branch to `handleBackup` right after the `Sec-Fetch-Site` check; extend the ctx typedef with `backup` | Route the new endpoints (architect R-A, finding 8) |
| `server/app.js` | Create `backup: { slots: createInFlight({ perUser: 1, total: 1, exempt: ownerSub }), limiter: createLimiter({ now, ownerSub, limits: RESTORE_LIMITS, globalLimits: RESTORE_GLOBAL_LIMITS }) }` and pass it to `handleApi` | Rate limit + concurrency (scope bullet 7, architect R-D) |
| `server/ai/rateLimit.js` | `createLimiter` accepts optional `limits` / `globalLimits` (default: current `LIMITS` / `GLOBAL_LIMITS`); kinds come from `Object.keys(limits)`; no behaviour change for AI | Reuse the limiter without coupling restore to AI (architect R-D) |
| `server/http.js` | `readJson(req, { limit, timeouts })`: optional `{ totalMs, idleMs }`; when given, a slow body answers 408 `request_timeout`. Without `timeouts` the behaviour is unchanged | The single restore slot must not be held by a slow sender (architect risk "no body timeouts"); opt-in so other routes are unchanged |
| `server/README.md` | Document `GET /api/backup`, `POST /api/restore`, the file format, summary shape, new error codes/reasons, limits | Server API docs are kept in this file |
| `server/backup.db.test.ts` (new) | DB tests listed below | AC1-AC4, ticket test plan |
| `server/backup.test.ts` (new) | Unit: uuidv5/derivedId; handler limits without a DB | AC5, R8 |
| `server/validate.test.ts` | `parseBackup` cases | AC4, R8 |
| `server/ai/rateLimit.test.ts` | Custom limits case; defaults unchanged | R8 |
| `server/http.test.ts` (new) | `readJson` timeouts (408) and unchanged default | R8 |

Nothing under `db/migrations/`, `src/`, `items.js` or `photos.js` changes.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/validate.test.ts` › parseBackup › accepts an empty backup and a full one; output has no `user_id` / unknown row keys; Vietnamese names (NFC) kept | shape, never trust `user_id` from file |
| › rejects non-object (`notObject`), `version` ≠ 1 or `"1"` (`versionUnsupported`), unknown top-level key (`unknownKey`), missing/non-array lists (`invalidType`), `exportedAt` not a string (`invalidType`) | AC4 |
| › caps: each list one over a small injected cap → `tooMany` | AC4, limits |
| › ids: non-uuid → `idInvalid` (field e.g. `items[2].id`); duplicate id within a list → `duplicateId` | AC4 |
| › item rows: errors from `parseItemInput` come back with an indexed field (`items[3].name` / `nameRequired`, `items[0].price` / `priceNegative`, deprecated category `bag` → `invalidValue`) | reuse of item rules |
| › timestamps: `created_at` / `updated_at` must be ISO `YYYY-MM-DDTHH:mm:ss.sssZ` that round-trips through `Date` (e.g. `2026-02-30T00:00:00.000Z` → `timestampInvalid`) | AC1 timestamps |
| › locations: name trimmed + NFC; empty / > 80 code points rejected; duplicate name after NFC (composed vs decomposed "Tủ") → `duplicateName`; `parent_id` = own id → `invalidValue`; `parent_id` not in file → `danglingRef`; cycle A→B→A → `cycle`; `sort_order` must be a safe 32-bit integer | location edge cases |
| › refs: `items[i].location_id` not in file → `danglingRef` (null ok); `wearLogs[i].item_id` not in file → `danglingRef` | reference integrity |
| › wear logs: `worn_on` `2026-02-30` → `dateInvalid`; `2001-01-01` accepted (no "today" window); duplicate `(item_id, worn_on)` → `duplicateWear` | R5 parity |
| › `photo_id`: null or uuid, else `idInvalid`; not used otherwise | photos ignored |
| `server/backup.test.ts` › uuidv5 matches RFC 4122 vector (`www.example.com` in the DNS namespace → `2ed6657d-e927-568b-95e1-2665a8aea6a2`) | deterministic remap |
| › derivedId is deterministic, version 5, RFC variant, and differs by user, by old id and by attempt | AC2 cross-account |
| › handler (createApp, no pool): `GET /api/backup` → 503 `db_unavailable`; `POST /api/restore` wrong content type → 415; `Content-Length` over cap → 413 + `Connection: close`; valid body with no pool → 503 after validation; invalid body → 400 with field/reason | limits, ordering |
| › handler: second concurrent restore by the same user → 503 `restore_busy` with `Retry-After`; limiter exhausted → 429 `rate_limited` and the slot is released; slow body with small timeouts → 408 `request_timeout` | concurrency, rate limit |
| › `POST /api/restore` with `Sec-Fetch-Site: cross-site` → 403 `forbidden_origin`; `PUT /api/backup` → 405 | CSRF, method |
| `server/ai/rateLimit.test.ts` › custom `limits`/`globalLimits` with a new kind enforce their own windows; default construction still enforces the AI values | parameterisation |
| `server/http.test.ts` › readJson with `timeouts` answers 408 on an idle body; without `timeouts` a normal body still parses and over-limit still gives 413 | readJson change |
| `server/backup.db.test.ts` › export: caller's rows only (B's rows absent); keys exactly as in the format below; no `user_id`, `wear_count`, `last_worn`, `location_name`, URLs; deterministic order | export scope, R5 |
| › AC1: seed A (2 locations, items with Vietnamese names, arrays, price, `purchase_date`, one with an `item_photos` row, wear logs on several dates); export; DELETE every item through `/api/items/:id`; restore; export → deep-equal except `exportedAt` and `photo_id`; `wear_count`/`last_worn` equal | AC1 |
| › AC1 full wipe including A's locations → identical | AC1 |
| › AC2 same account: restore twice → full row snapshot (incl. `created_at`, `updated_at`) identical; second summary all `unchanged` | AC2 |
| › overwrite: edit an owned item after export, restore → file values back, `updated: 1`; its `item_photos` row and `primary_photo_id` unchanged; wear logs added after export are kept (restore never deletes) | "never clears the photo", merge semantics |
| › AC3: B restores A's file → B's items have derived ids, refs remapped, wear counts match, A's snapshot byte-identical, `photosMissing` counted; restoring again as B → no duplicates, snapshot unchanged | AC3 + AC2 cross-account |
| › location merge: B already has a location with the same name under another id → mapped to it, B's row unchanged, items point to it; owned-location rename that clashes with another owned name → skipped, no error | location rules |
| › foreign wear-log id: a file wear-log id that B already uses → A gets the log under a new id; second run no-op | wear-log remap |
| › squatted derived id: B pre-creates an item with `derivedId(B, x, 0)` → B's restore uses attempt 1; second run idempotent | squatting |
| › AC4: all 5 attempts squatted for one item (placed after other rows) → 409 `restore_conflict`, zero rows written for the caller | transaction rollback |
| › AC4: invalid last wear log → 400, zero rows; body over `RESTORE_MAX_BYTES` → 413, zero rows | AC4 |
| › near-cap run: 3000 items + 50 000 wear logs restore without `57014` (statement_timeout) and within 30 s | statement_timeout / pool risk |

## Approach

**Wire format (version 1).** Top-level keys camelCase (ticket), rows snake_case (DB column names), no `user_id`:
```
{ version: 1, exportedAt: ISO,
  locations: [{ id, name, parent_id, sort_order, created_at }],
  items:     [{ id, name, category, status, brand, size, material, price, purchase_date, location_id,
                colors, seasons, tags, notes, created_at, updated_at, photo_id }],
  wearLogs:  [{ id, item_id, worn_on }] }
```
`photo_id` = `items_with_stats.primary_photo_id`, informational only. Timestamps through `toISOString()` (ms).

1. **Limiter** (`server/ai/rateLimit.js`): add optional `limits` / `globalLimits` params; derive kinds from the keys;
   keep exports and defaults so `server/app.js` AI wiring and existing tests are unchanged.
2. **readJson timeouts** (`server/http.js`): optional `timeouts`; same timer pattern as `readBody` in `photos.js`
   (total + idle, `req.pause()` on timeout); result `{ ok:false, status:408, code:"request_timeout" }`.
3. **Validation** (`server/validate.js`): `BACKUP_CAPS = { bytes: 8 MiB, locations: 200, items: 3000, wearLogs: 50000 }`.
   `parseBackup` checks, in order: object, `version === 1`, no unknown top-level keys, `exportedAt` string, the three
   arrays and caps (before looking at rows), then each list (ids, duplicates, fields), then references, location
   cycles, duplicate `(item_id, worn_on)`. Items: call `parseItemInput(row)` and prefix its `field` with `items[i].`;
   add `id`, `location_id`, timestamps, `photo_id` to the parsed value. Locations: name NFC + trim like `saveItem` /
   `parseItemInput`. Return a normalized value built only from known keys. Error reasons are constants; never echo
   file data.
4. **Export** (`exportBackup`): one `withUser(..., { readOnly: true })` with three selects scoped by
   `user_id = $1`: locations and items ordered by `date_trunc('milliseconds', created_at), id` (so the order is the
   same after a ms-truncated restore), wear logs by `item_id, worn_on, id`; items read from `items_with_stats` for
   `primary_photo_id`. Map rows explicitly (do not spread DB rows). Accept READ COMMITTED skew between the three
   selects (architect finding 10; do not change `db.js`).
5. **Restore** (`restoreBackup`), one `withUser` (read-write) transaction. **Never trigger a SQL error on purpose**
   (architect finding 4, DB optimizer finding 2): only `ON CONFLICT DO NOTHING` and RLS-scoped `UPDATE`, never
   `ON CONFLICT DO UPDATE`.
   - First statement: `select pg_advisory_xact_lock(hashtextextended('restore:' || $1, 0))` (DB optimizer A), same
     pattern as the photo-quota lock.
   - **Locations** (≤ 200, row by row is fine), for each file row in file order:
     a. caller owns the id (`select ... where id = $1 and user_id = $caller`) → target = id; update `name`,
        `sort_order` only where `IS DISTINCT FROM` and the new name is not held by another caller-owned location
        (otherwise leave the name);
     b. else caller has a location with that name → target = that row (merge by name, D8 spirit); do not modify it;
     c. else `insert (id, user_id, name, sort_order, created_at) ... on conflict do nothing returning id` with the
        file id, then with `derivedId(caller, id, k)` for k = 0..4 (stop at the first insert, or at a derived id the
        caller already owns); none → abort with `RestoreConflict`.
     Second pass: `parent_id` through the map, set only on rows inserted in this run or owned-by-id rows (with
     `IS DISTINCT FROM`); merged rows are never modified.
   - **Items**, set-based, chunks of ≤ 500 rows via `jsonb_to_recordset($n::jsonb)`; `location_id` through the map.
     Pending = all file items with candidate id = file id. Repeat for k = -1 (file id), 0..4 (derived):
     1. `insert into items (id, user_id, <columns>, created_at, updated_at) select ... on conflict do nothing returning id` → inserted;
     2. `select id from items where user_id = $caller and id = any($ids)` → owned (includes just inserted);
     3. `update items i set <explicit columns, never timestamps> from (...) x where i.id = x.id and i.user_id = $caller and (cols) is distinct from (x.cols) returning i.id` for owned-not-inserted → updated; the rest unchanged (the guard keeps the `items_updated_at` trigger from bumping `updated_at`, DB optimizer finding 5);
     4. still pending = not owned → candidate = `derivedId(caller, fileId, k+1)`.
     Pending after k = 4 → abort with `RestoreConflict` (409 `restore_conflict`, whole transaction rolled back).
   - **Wear logs**, set-based in chunks: `insert (id, user_id, item_id, worn_on) select ... from unnest(...) on conflict do nothing returning id`
     with mapped `item_id`; for rows not inserted, `select item_id, worn_on from wear_logs where user_id = $caller and item_id = any(...)`;
     pairs present → unchanged; the rest (foreign id) → insert again **without** id (default `gen_random_uuid()`):
     a wear-log id has no references and the `(item_id, worn_on)` pair keeps the second run a no-op.
   - **Photos**: never read or write `item_photos`. `photosMissing` = count of file items with `photo_id` not null
     whose target id has `primary_photo_id is null` in `items_with_stats` (one query at the end).
   - Summary (counts only, no ids — DB optimizer I):
     `{ locations: { inserted, updated, unchanged, merged, remapped }, items: { inserted, updated, unchanged, remapped }, wearLogs: { inserted, unchanged }, photosMissing }`.
     `remapped` = rows whose target id ≠ file id (informational; also counted in one of the other buckets).
   - Restore adds and overwrites; it never deletes (F-602.2 copy must say so).
6. **Handler** (`handleBackup`), in `server/backup.js`:
   - `GET /api/backup`: `!pool` → 503 `db_unavailable`; else 200 `{ version, exportedAt: new Date(now()).toISOString(), ... }`.
   - `POST /api/restore`, order follows `tagPhoto.js`: content type `application/json` else 415 (unread); declared
     `Content-Length` > `RESTORE_MAX_BYTES` → 413 (unread, `Connection: close`); `backup.slots.tryAcquire(userId)`
     else 503 `restore_busy` + `Retry-After: 5`; `backup.limiter.check(userId, "restore")` else 429 `rate_limited`;
     `readJson(req, { limit: RESTORE_MAX_BYTES, timeouts: RESTORE_BODY_TIMEOUTS })` (413 handling as in
     `api.js:134-139`); `parseBackup` → 400 `invalid_input { field, reason }`; `!pool` → 503; `restoreBackup` →
     200 `{ summary }`; `RestoreConflict` → 409 `restore_conflict`; other errors → `mapDbError` like `api.js:169-174`.
     Release the slot in `finally`.
   - Log one line `{ event: "restore", id, code, ms, counts }` — never body content, ids or names.
7. **Wiring**: two `match()` entries and one early branch in `api.js` after the `Sec-Fetch-Site` check (so writes keep
   the CSRF guard); `app.js` builds the `backup` context. Update `server/README.md`.

Rules: **R1** — the client still goes through `WardrobeRepo` (F-602.2); nothing here calls the DB outside `withUser`.
**R2** (Postgres equivalent) — no migration; RLS is the ownership layer and every query also filters
`user_id = $caller`. **R3** — no secret involved. **R4** — photos untouched (no Drive call, no `item_photos` write).
**R5** — `wear_count` / `last_worn` not exported, recomputed by the view; tested. **R6** — server sends codes and
reasons only; Vietnamese text is F-602.2. **R7** — `items.js`, `photos.js`, `db.js` untouched. **R8** — unit and DB
tests listed above. **R9** — no UI in this slice.

## Specialist input used
- Architect finding 1 / DB optimizer finding 3 (random remap breaks AC2 cross-account) → **adopted**: deterministic
  uuidv5 in Node (`node:crypto` sha1), no `uuid-ossp` (would need a migration → High + plan-approval).
- DB optimizer D (attempt bump up to 5 against squatting, since `PUT /api/items/:id` accepts client ids) → **adopted**
  for items and locations; architect's "abort with 409 if the derived id is foreign" kept as the final fallback.
- Architect finding 4 / DB optimizer finding 2 (no `DO UPDATE`, no caught errors inside the transaction) → **adopted**.
- `IS DISTINCT FROM` guard against the `updated_at` trigger (architect 5, DB optimizer 5) → **adopted**.
- Restore `created_at` / `updated_at` on insert (architect finding 6, open question 3) → **adopted**; never touched on
  existing rows.
- Locations: merge by name, two passes for `parent_id` (architect R-B, DB optimizer B) → **adopted**; DB optimizer's
  file-side cycle check → **adopted**.
- Wear logs set-based, keep ids where free (architect R-B, DB optimizer E) → **adopted**, with one simplification:
  foreign wear-log ids get a database default id instead of a derived id (no references; the `(item_id, worn_on)`
  key keeps reruns idempotent).
- Never touch `item_photos`; `photosMissing` via `items_with_stats` (both) → **adopted**.
- Advisory xact lock per user (DB optimizer A) **and** in-flight slot `perUser 1, total 1` (architect R-D) →
  **both adopted**: the slot protects the 5-connection pool and memory, the lock covers anything the in-process
  slot cannot.
- Validation Option 1 (server authoritative, client pre-checks only, architect R-C) → **adopted**; client pre-checks
  are F-602.2. Instead of extracting a helper from `parseItemInput`, `parseBackup` **calls `parseItemInput` per row**:
  it already ignores unknown keys, so no refactor of the existing PUT path is needed (smaller diff, same reuse).
- Caps: architect's 8 MiB / 200 / 3000 / 50 000 → **adopted** (DB optimizer's 10 MiB / 500 / 5000 / 100 000 rejected
  as larger than needed for one person's wardrobe; easy to raise).
- Separate limiter instance via parameterised `createLimiter` (architect R-D) → **adopted**; 10/h per user, 60/h global.
- `readJson` body timeouts (architect open question 6, default "debt issue") → **partly changed**: opt-in timeouts
  for restore only, because this plan's single global restore slot would otherwise be holdable by a slow sender;
  the other JSON routes stay as they are and get a `debt` issue (follow-up).
- Export ordering: architect's `created_at, id`, refined to `date_trunc('milliseconds', created_at), id` so the order
  is stable after the ms-truncated round trip. DB optimizer's location order `sort_order, name, id` not used.
- Replace "restore idempotency against a fake repo" with DB tests (architect R-G) → **adopted** (semantics live in SQL).
- Split F-602.1 / F-602.2 (architect R-F) → **adopted** (estimate below).
- Security consult (`security-ai-generated-code-auditor`) requested in the ticket has **not** run yet; see Assumptions.

## Assumptions
- **Gate / tier:** `server/**` is High in `.github/risk-tiers.yml`, so this slice should carry `Gate: plan-approval`
  and a High PR (see note at the top). The plan does not change that file.
- **Security review:** the ticket asks for `security-ai-generated-code-auditor`; no `consult-security-*.md` exists.
  Assumed the orchestrator runs it on the diff (`security-review.md`) because the diff adds a write endpoint and
  cross-user id handling. Points for it: the `remapped` count as an id-existence oracle (ids are random v4, judged
  negligible by both consults), squatting of derived ids, memory/DoS bounds.
- **Hotspots:** `server/api.js` and `server/app.js` are shared by every API ticket. F-702 and F-202.1 are `DONE`
  (PRs open); from their tickets they touch `src/` (editor, `repo.http.ts`, `photos.ts`), not these server files, so
  no rebase is expected for F-602.1. F-602.2 will touch `src/data/repo.http.ts` (F-202.1) and `src/App.tsx`
  (hotspot) — expect a rebase there.
- Deprecated categories (`bag`, `sport`, `home`) no longer exist in data (`20261112140000_item_category_v2.sql:15-16`),
  so a fresh export always passes `parseItemInput`.
- `locations.parent_id` is never set by the app today (only `schema.db.test.ts` uses it); it is exported and restored
  for completeness with the simple rules above. A cycle formed together with pre-existing DB rows is not checked
  (nothing walks the tree).
- `parseItemInput` defaults are acceptable for restore (missing `category` → `other`, etc.); `colors` are not checked
  against `COLOR_IDS`, consistent with `PUT /api/items/:id`.
- Per-row unknown keys (including `user_id`, `wear_count`) are ignored; unknown top-level keys are rejected.
- The near-cap DB test may be slow on CI; if it exceeds 30 s the implementer may lower it to 3000 items / 20 000
  wear logs and record that in `impl-log.md`.
- Follow-up (not in this diff, R7): `debt` issue — `readJson` has no body timeouts on the other JSON routes.

### Needs Ming's decision (defaults adopted, reversible; not blocking)
1. **Cross-account remap ids:** deterministic uuidv5 of `(caller, old id, attempt)`. *Default adopted.* Why: makes AC2
   hold across accounts with no migration. Suggest recording it as a D-entry refining D1.
2. **Location name collision:** merge into the caller's existing location with the same name. *Default adopted.*
3. **Timestamps:** keep `created_at` / `updated_at` from the file on insert; never touch them on existing rows.
   *Default adopted.*
4. **Caps and limits:** 8 MiB, 200 locations, 3000 items, 50 000 wear logs; 1 restore in flight per user (1 total,
   owner exempt from the total); 10 restores/h per user, 60/h global. *Default adopted.*
5. **Client validation depth:** pre-checks only on the client, server authoritative. *Default adopted* (affects F-602.2).
6. **Body timeouts:** opt-in for restore now (60 s total, 10 s idle); `debt` issue for the other JSON routes.
   *Default adopted (variant of the architect's default, reason above).*
7. **Wear-log ids:** kept when free; a foreign wear-log id gets a fresh random id (not derived). *Default adopted.*
8. **Tier:** treat F-602.1 as High with plan approval (risk-tiers draft) rather than the ticket's "Medium". *Default
   adopted.*

## Blocking questions
None.

## Split proposal
Estimate for the whole ticket (non-test lines): server ≈ 560 (`backup.js` ≈ 330, `validate.js` ≈ 150, `http.js` ≈ 25,
`rateLimit.js` ≈ 15, `api.js` + `app.js` ≈ 20, README ≈ 20); client ≈ 350 (`backup.ts` ≈ 80, repo + HTTP repo +
memoryRepo + `useWardrobe` ≈ 70, `ImportJsonTab` ≈ 130, `ImportModal` / `App.tsx` / `download.ts` / copy / `apiErrors`
≈ 70). Total ≈ 900 > ~600, so split per the architect (R-F):

- **F-602.1 — server (this plan).** `GET /api/backup`, `POST /api/restore`, `parseBackup`, limits, DB tests.
  ACs 1-3 fully, AC4 server half (nothing written, codes/reasons). Tier High (`server/**`), `Gate: plan-approval`.
- **F-602.2 — client (next ticket, depends on F-602.1 MERGED).** Planned separately; expected content:
  `src/data/backup.ts` (types matching the wire format above, `precheckBackup`: file size ≤ 8 MiB, JSON parses,
  `version === 1`, arrays present, count caps); `WardrobeRepo.exportAll()` / `restore(backup)` in `repo.ts`,
  `repo.http.ts` (thin `call()`), `src/test/memoryRepo.ts` (minimal); `useWardrobe.exportBackup` /
  `restoreBackup` (→ `refresh()`); `apiErrors.ts` (Vietnamese for `restore_busy`, `restore_conflict`,
  `request_timeout` for restore, new reasons); `ImportJsonTab.tsx` real flow (pick file or paste, pre-check, confirm
  "restoring overwrites items with the same id and never deletes; photos are not in the file", run, summary incl.
  `photosMissing`) and `ImportModal.tsx` wiring; `App.tsx` JSON export via `exportBackup()` and `download.ts`
  (CSV unchanged); `copy.ts` / `ExportModal` text. ACs: AC4 Vietnamese message, AC5 390px + dark mode, and the
  manual AC1 diff on the real app. Tier Medium.

The orchestrator should create the `F-602.2` ticket and backlog row (on `main`, D16) and rename this run to
F-602.1, as for earlier splits.
