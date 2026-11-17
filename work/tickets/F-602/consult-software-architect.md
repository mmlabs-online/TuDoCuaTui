# Consult — software-architect — F-602 (2026-11-17)

Read-only consult. Files read: `server/api.js`, `server/items.js`, `server/validate.js`, `server/http.js`, `server/db.js`, `server/app.js`, `server/inflight.js`, `server/ai/rateLimit.js`, `server/ai/parity.test.ts` (imports), `src/shared/ai/validate.ts`, `src/data/repo.ts`, `src/data/repo.http.ts`, `src/features/import-export/{ExportModal,ImportJsonTab}.tsx`, `src/App.tsx` (export wiring), `Dockerfile`, and the `db/migrations` files init, category_v2, ownership_contract and row_level_security.

## Findings

1. **The AC2 idempotency check fails in the cross-account case if new ids are random.** On the first restore into account B, ids owned by A are given fresh ids. On the second restore of the same file those ids still belong to A, so they get *another* set of fresh ids and every item and wear log is duplicated. AC2 ("twice changes nothing") and AC3 cannot both hold with `gen_random_uuid()` remapping. The ticket text does not cover this.
2. **Locations have a second unique key, `(user_id, name)`** (ownership_contract migration). A location in the file whose id is free but whose name the caller already uses under another id will conflict. The ticket's insert → remap rule only talks about id conflicts. `parent_id` is a composite self-FK `(user_id, parent_id)`, so a parent has to exist before its child, or be set in a second pass.
3. **Wear logs have a second unique key, `(item_id, worn_on)`.** A logical duplicate under a different id has to count as "already there", not as a foreign id.
4. **Catching 42501 does not work inside one transaction.** `saveItem` relies on throwing `NotOwned` and rolling back the whole transaction. In a single restore transaction, any SQL error, including an RLS 42501 from `ON CONFLICT DO UPDATE` on an invisible row, aborts everything. Restore must never trigger an error on purpose. It has to use `ON CONFLICT DO NOTHING` plus an RLS-scoped `UPDATE` instead of `DO UPDATE`.
5. **The `items_updated_at` trigger** bumps `updated_at` on every UPDATE, even when nothing changed. A naive "overwrite on second run" therefore changes rows, which matters for AC2.
6. **`items.created_at` sets the list order** (`order by created_at desc, id`). If restore leaves `created_at` at its default (`now()`), a wipe+restore puts the whole wardrobe in an arbitrary order and AC1's JSON differs in more than "timestamps".
7. **Validation cannot be imported across the client/server line.** The runtime image copies only `server/` (`Dockerfile:38`), so the server cannot import `src/`. The existing pattern is a source copy in `src/shared/<x>`, a mirror in `server/`, and a parity test (`server/ai/parity.test.ts`).
8. **`handleApi` is a generic if-chain.** Every PUT/POST body is parsed as an item or wear input (`api.js:132-147`). The new routes need a dedicated handler that branches off early, the way `/api/ai-settings` and `/api/ai/tag-photo` do. The cross-site `Sec-Fetch-Site` check already applies to every write, so the handler should sit after it.
9. **Existing limit tools:** `readJson` defaults to 256 KiB and has **no body timeouts** (unlike `readBody` for photos). `createLimiter` (`server/ai/rateLimit.js`) has hard-coded AI kinds (`save | test | tag`). `createInFlight` is the concurrency guard. `tagPhoto.js` acquires its slot and checks the limiter before any await. `pg` has `max: 5` connections and `statement_timeout: 5000` per statement.
10. **Read-only transactions start with `begin read only` at READ COMMITTED.** `inTx` runs `set_config` first, so `SET TRANSACTION ISOLATION LEVEL` can't be issued inside `fn`. Three separate SELECTs for export could see different snapshots if a write lands mid-export (low risk for this app).
11. **Two test doubles implement `WardrobeRepo`:** `src/test/memoryRepo.ts` and the HTTP repo. Adding interface methods forces stubs in `memoryRepo`. The JSON export today is `download(items, type)` in `App.tsx:255`, which dumps UI items. `useWardrobe` already has `refresh()`.

## Recommendations

**R-A. Endpoint shape (Scope bullets 2–3, AC1–AC4)**
- `GET /api/backup` → `200 { version: 1, exportedAt, locations[], items[], wearLogs[] }`.
  - Rows use snake_case DB column names, so the server passes them through and the client never maps them to UI `Item`. Top-level keys stay camelCase as the ticket says. Note the mix in the plan.
  - `locations`: `id, name, parent_id, sort_order, created_at`.
  - `items`: every column in `toItemRow` except the derived/view fields (`wear_count`, `last_worn`, `location_name`, `primary_photo_path`; R5), plus `photo_id` (= `primary_photo_id`, informational only).
  - `wearLogs`: `id, item_id, worn_on`.
  - No `user_id` anywhere. Sort deterministically (`created_at, id` / `item_id, worn_on, id`) so AC1's diff is stable.
  - Run it in one `withUser(..., { readOnly: true })`. Accept the READ COMMITTED skew from Finding 10 and note it, or build the export as one SQL statement (one snapshot). Do not change `db.js` for this ticket.
- `POST /api/restore` (`application/json`) → `200 { summary }`. A suggested summary: per kind `{ inserted, updated, unchanged, remapped }`, plus `wearLogs.skipped` and `photosMissing`.
  - Errors use the existing shape. `400 invalid_input { field: "items[12].name", reason }` reuses the existing reason codes plus a few new ones (`versionUnsupported`, `tooMany`, `duplicateId`, `danglingRef`). Also `413 payload_too_large`, `415`, `429 rate_limited`, `503 db_unavailable`. The client maps them to Vietnamese through `apiErrors` / copy (R6).
- Put both routes in a new `server/backup.js` (`handleBackup`, `exportBackup(pool,userId)`, `restoreBackup(pool,userId,backup,now)`). In `api.js` add two lines to `match()` and one early branch next to the AI branches. Leave `items.js` alone (R7).

**R-B. Restore algorithm (D1, AC2, AC3). Never trigger a SQL error.**
- **Deterministic remap.** When an id belongs to someone else, use `newId = uuidv5(NS, callerUserId + ":" + oldId)`, computed in JS with `node:crypto` sha1. Do not use the `uuid-ossp` extension: that needs a migration, which makes the ticket High tier. A second run lands on the caller's own row, so AC2 holds across accounts too. If even the derived id is foreign (practically impossible), abort with `409 restore_conflict` and roll back.
- **Locations, two passes, in this order:**
  1. The caller owns this id → update `name/sort_order` only if the values differ (`IS DISTINCT FROM`) and the new name doesn't clash with another of the caller's own locations.
  2. Else the caller has a location with this name → map `fileId` to the existing id (merge by name).
  3. Else `INSERT … ON CONFLICT DO NOTHING` (no arbiter) with the file id. If 0 rows, insert with the derived id.

  Insert everything with `parent_id = null`, then set the parents through the id map in a second pass.
- **Items:**
  1. `INSERT … (incl. created_at, updated_at from the file) ON CONFLICT (id) DO NOTHING RETURNING id`.
  2. If 0 rows: `UPDATE items SET … WHERE id=$1 AND user_id=$caller AND (cols) IS DISTINCT FROM (new) RETURNING id`. That gives updated or unchanged. Under RLS a foreign row is simply invisible, so there is no error.
  3. If neither step hit a row and the caller does not own it: insert with the derived id.

  `location_id` goes through the location map. Never touch `item_photos`. That covers "never clears the photo of an existing item".
- **Wear logs:** set-based, using `INSERT … SELECT FROM unnest($ids,$items,$dates) ON CONFLICT DO NOTHING RETURNING id`. Any row not inserted that already has an own row at `(mapped item_id, worn_on)` counts as skipped. The rest get the derived id and a second insert. This keeps it to a handful of statements, not 50k round trips.
- `photosMissing` = items in the file with `photo_id != null` and no `primary_photo_id` after restore (one query at the end).
- Owned-by-caller detection uses only `user_id = $caller` queries under `withUser`. Never trust `user_id` from the file (validation drops unknown keys). This follows the D1 / ticket rule: "enforced by RLS, never by ids from the file".
- Merge semantics: restore adds and overwrites, it never deletes. Say this in the UI copy (Scope bullet 6).

**R-C. Validation placement (Scope bullet 3, AC4)**
- Option 1 (recommended for an M ticket): **the server is authoritative and does full validation; the client does cheap pre-checks only.**
  - Client pre-checks: file size ≤ cap, JSON parses, `version === 1`, the three arrays exist and are within count caps. That gives an instant Vietnamese error before upload. Put them in `src/data/backup.ts` (types + `precheckBackup`).
  - Server: `parseBackup` in `server/validate.js` covers the per-row fields, unique ids per array, unique `(item_id, worn_on)`, reference integrity (`item.location_id` ∈ file locations or null, `wearLog.item_id` ∈ file items), and ISO timestamps.
  - Reuse the item rules by extracting the field checks from `parseItemInput` into one shared helper that both callers use. Do not copy the rules.
- Option 2: full mirrored validator in `src/shared/backup/` plus a server copy plus a parity test, following the AI pattern. That's about twice the code and a parity test for little user value, since the server answers with the field and reason anyway. Consider it only if offline preview of errors matters.
- Either way: a top-level failure writes nothing, because validation runs before `withUser`, and any later error rolls back the whole transaction.

**R-D. Limits, consistent with existing patterns (Scope bullet 7)**
- Body: `readJson(req, { limit: RESTORE_MAX_BYTES })`, around 8 MiB, with the same 413 + `Connection: close` + socket-destroy handling as `api.js:134-139`.
- Count caps (proposed): locations ≤ 200, items ≤ 3000, wear logs ≤ 50 000. Check them before any DB work.
- Concurrency: `restoreSlots = createInFlight({ perUser: 1, total: 1, exempt: ownerSub })`, acquired before the body is read (the `tagPhoto.js` order). This protects the 5-connection pool and removes same-user races between two tabs.
- Rate limit: make `createLimiter` accept `{ limits, globalLimits }`, defaulting to the current AI values so AI behaviour stays the same, and create a second instance in `app.js` with `restore: 10/h per user, 60/h global`. Check it after taking the slot and before reading the body. A rejected call records nothing (existing semantics). Avoid adding a "restore" kind to the AI limiter, because that couples restore to the AI module.
- Export (GET) needs no limiter beyond auth.
- Never log body content. Log only counts and a duration.

**R-E. `WardrobeRepo` contract (Scope bullet 5)**
```ts
// src/data/backup.ts
export type Backup = { version: 1; exportedAt: string; locations: BackupLocation[]; items: BackupItem[]; wearLogs: BackupWearLog[] };
export type RestoreSummary = { ... };
// src/data/repo.ts
exportAll(): Promise<Backup>;
restore(backup: Backup): Promise<RestoreSummary>;
```
- In the HTTP repo, both are thin calls through the existing `call()`.
- Expose them through `useWardrobe` (`exportBackup`, `restoreBackup` → `refresh()` afterwards), so components never touch the repo or `fetch` (R1).
- In `App.tsx`, the JSON export branch calls `exportBackup()` and downloads through `download.ts`. CSV stays as it is.
- Implement `memoryRepo` minimally (export from its arrays, restore = replace by id). Do not reimplement the server's remap semantics in the fake.

**R-F. Keeping it M-size (R7)**
- Touch list: `server/backup.js` (new), `server/validate.js` (extract helper + `parseBackup`), `server/api.js` (+~6 lines), `server/app.js` (slot + limiter), `server/ai/rateLimit.js` (parameterise only), `src/data/{backup.ts,repo.ts,repo.http.ts,useWardrobe.ts,apiErrors.ts}`, `src/test/memoryRepo.ts`, `src/features/import-export/{ImportJsonTab.tsx,copy.ts}`, `src/App.tsx`, plus tests.
- That's at the top of M. If the plan goes past about 600 changed lines without tests, split it: **F-602.1** (server endpoints + validation + DB tests) and **F-602.2** (repo methods + UI + copy), with F-602.2 depending on F-602.1. The split is clean because the wire contract above is fixed.
- No migration is needed with the deterministic remap. That keeps the ticket Medium.

**R-G. Tests (Test plan, R8)**
- Unit: `parseBackup` (each reason, caps, dangling refs, duplicates), `uuidv5` determinism, client `precheckBackup`.
- DB: AC1 round-trip (wipe → restore → export deep-equal minus `exportedAt` and `photo_id`), AC2 with a same-account second run (0 inserted/updated, `updated_at` unchanged), AC2 with a cross-account second run (no duplicates), AC3 (other user's rows byte-identical, refs remapped), AC4 (a mid-transaction failure leaves 0 rows written), location name merge, and a near-cap timing run.
- The test plan item "restore idempotency against a fake repo" adds little, because the semantics live in SQL. Replace it with the DB tests.

## Risks
- **Restore time vs `statement_timeout` and the pool.** A row-by-row restore near the caps can hold one of 5 connections for many seconds. Mitigations: set-based wear logs, caps, `total: 1` in-flight, and a timing DB test.
- **Memory.** An 8 MiB body plus `JSON.parse` comes to tens of MB per request. That's acceptable only with `total: 1`.
- **No body timeouts in `readJson` (slowloris).** This already applies to the existing JSON routes. A larger cap makes it worse. Either pass `bodyTimeouts` into a capped reader, or file a `debt` issue. Do not widen scope silently.
- **The id oracle.** `remapped` counts reveal that a given UUID exists for another user. The ids are random v4, so the practical risk is nil, but the security consult should confirm.
- **Abuse growth.** With multi-user Identity, 3000 items × 10/h per user can bloat the DB. The rate limit and caps bound it. The owner exemption applies only to the global ceiling.
- **Timestamp precision.** Postgres keeps microseconds and `toISOString()` keeps milliseconds. That's fine as long as export always goes through `toISOString()` and restore writes those values. Don't mix a JSON-from-Postgres export with this.
- **Restore never deletes.** Users may expect "restore = replace". The copy must say so (Scope bullet 6).

## Open questions (batched, each with a proposed default)
1. **Cross-account remap ids.** Deterministic uuidv5(caller, oldId), or random ids with AC2 documented as same-account only? Why it matters: AC2 vs AC3. *Default: deterministic.* This is reversible and needs no migration. Record it as a D-entry that refines D1.
2. **Location name collision.** If the file id is free but the name already exists for the caller, merge into the existing location, or rename? *Default: merge by name.*
3. **Restore `created_at`/`updated_at` from the file?** *Default: yes on insert*, so order is preserved and AC1 is near-exact. Never touch them on unchanged rows.
4. **Caps.** 8 MiB / 200 locations / 3000 items / 50k wear logs, 1 in flight, 10/h per user? *Default: yes.* Easy to change later.
5. **Client validation depth.** Pre-checks only, with the server authoritative (Option 1), or a mirrored full validator plus a parity test? *Default: Option 1.*
6. **`readJson` body timeouts.** Fix in this ticket, or file a `debt` issue? *Default: debt issue*, because it affects all JSON routes and is outside this ticket's scope (R7).
7. **Split.** Pre-agree to split into F-602.1 (server) and F-602.2 (client) if the plan exceeds M? *Default: the planner decides, using the ~600-line threshold.*
