# Consult — database-optimizer — T-019 (2026-11-13)

## Findings (database-optimizer consult, T-019; read-only, no files changed)

I read: ticket T-019, `db/migrations/*.sql` (init, item_photos_drive, item_category_v2, ai_settings), `db/migrations/README.md`, `server/items.js`, `server/photos.js`, `server/photo-sweep.js`, `server/api.js`, `server/ai/{store,routes,crypto,rateLimit}.js`, `server/migrator.js`, `server/migrate.js`, and the Drive `appProperties` use. I could not open the D25 text in `work/decisions.md` (the matching line was too long to display), so D25 is quoted from the ticket.

Current state that matters for multi-user:
1. No table has an owner. `locations` has `unique (name)`, and `saveItem` does `on conflict (name)`. Two users naming a drawer "Tủ 1" would collide and share one row.
2. `saveItem` is `insert ... on conflict (id) do update`, and the item id is chosen by the client. Once there are two users, user B can overwrite user A's item by PUTting A's uuid.
3. Every query selects, updates or deletes by id only: `getItem`, `removeItem`, `wearItem`, `withLockedItem`, `putPhoto` (`select 1 from items`), `servePhoto` (`where id = $1`), and the photo DELETE path.
4. `items_with_stats` has no `user_id`. It joins `locations l on l.id = i.location_id`.
5. `ai_settings` is a singleton: `id boolean primary key check (id)`, with `where id`, `on conflict (id)` and `for update`. The key is sealed with AES-GCM whose AAD is the literal `tudocuatui-ai-key|v1|single|<provider>`. The rate limiter in `server/ai/rateLimit.js` is one global in-memory window.
6. `photo-sweep.js` is a cross-user maintenance job. It lists every `item_photos` row to decide what is an orphan.
7. `migrator.js` runs each file in a transaction with `set local tudo.migrating`. It has no way to pass a value into SQL, and the README says migrations must be expand-only.

## Recommendations

### A. Migration shape: one new file, e.g. `db/migrations/2026111xxxxxxx_user_ownership.sql`
Never edit the four applied files.

**Column**
- `user_id uuid` on `locations`, `items`, `item_photos`, `wear_logs` and `ai_settings`.
- Add it nullable, backfill, then `set not null`. All in the same file, in this order.
- No default, so a forgotten `user_id` in an INSERT fails loudly.
- No users table and no FK to one, because the owner lives in mmlabs Identity. The cost is that account deletion does not cascade (see Risks).

**Backfill owner supplied at migrate time**
- Add a small change to `server/migrate.js` and `runMigrations`: read env `TUDO_OWNER_SUB`.
- Validate it with a uuid regex before use. If it is set but malformed, exit 2.
- Hand it to SQL with `select set_config('tudo.owner_sub', $1, true)` next to the existing `set local tudo.migrating`. `SET LOCAL` cannot take a parameter. The value is not secret, but do not print it.
- In the migration, a `DO $$` block reads `nullif(current_setting('tudo.owner_sub', true), '')::uuid`.
  - Rows exist and the owner is unset: `raise exception` with a clear message. The migrator wraps this as exit 1, but it could map the case to exit 2.
  - No rows exist (a fresh database): proceed. Nothing to backfill, so no owner is needed.
  - Otherwise: `update <table> set user_id = owner where user_id is null` for all five tables.
- Do not "claim on first sign-in". With join policy `open`, any stranger could sign up first and take Ming's wardrobe. The owner must be explicit.

**Cross-owner integrity via composite keys**
- Add `unique (user_id, id)` on `items` and on `locations`. It is redundant with the primary key but needed as an FK target.
- Replace the single-column FKs with composite ones:
  - `items (user_id, location_id) -> locations (user_id, id)`
  - `locations (user_id, parent_id) -> locations (user_id, id)`
  - `item_photos (user_id, item_id) -> items (user_id, id) on delete cascade`
  - `wear_logs (user_id, item_id) -> items (user_id, id) on delete cascade`
- The existing `ON DELETE SET NULL` on `location_id` and `parent_id` must become `on delete set null (location_id)` and `on delete set null (parent_id)`. A plain composite SET NULL would null `user_id` and violate NOT NULL.
- The column-list form needs PostgreSQL 15 or later.
- If the self-hosted PG is older than 15, fall back to single-column FKs and enforce same-owner in the query layer plus a trigger or test. I did not check the PG version in the compose file.
- Drop the old FK constraints by name. Confirm the auto-generated names (`items_location_id_fkey` etc.) in `schema.db.test`.

**Uniques and indexes that become per-user**
- `locations`: drop `locations_name_key` and add `unique (user_id, name)`. Change the upsert target in `saveItem` to `on conflict (user_id, name)`.
- `locations`: add an index on `(user_id, sort_order, name)` for `listLocations`. The unique index already gives the `user_id` prefix.
- `items`: add `items_user_created_idx` on `(user_id, created_at desc, id)`. It serves `listItems` (`order by created_at desc, id`).
- `item_photos`: keep `storage_path unique`, `item_photos_drive_file_uq` and `item_photos_one_primary`. All are keyed by item or file, so they are safe globally. Optionally add an index on `(user_id)`.
- `wear_logs`: keep `unique (item_id, worn_on)`. It is implicitly per-user because the item is. Add no extra index.
- Plain `create index`, not `concurrently`, because migrations run in a transaction. This is fine at this size.

**View `items_with_stats`**
- Use `create or replace view` and append `i.user_id` as the LAST column, the same trick as the item_photos_drive migration.
- Add `and l.user_id = i.user_id` to the location join as a belt-and-braces check.
- Do not use `security_invoker`. There is no RLS, so it does nothing.
- Every query on the view carries `where user_id = $n`. `toItemRow` whitelists fields, so `user_id` is not leaked in the response.

**ai_settings per user: yes, make it per-user**
- A shared row would make every user spend Ming's key or overwrite his settings.
- `alter table ai_settings drop constraint ai_settings_pkey`, drop the `id` column, `add primary key (user_id)`, and `user_id uuid not null`. The backfill assigns the existing row to the owner.
- Store changes:
  - `get`: `where user_id = $1`.
  - `save`: `for update where user_id = $1`; insert with `on conflict (user_id)`.
  - `clearKey`: `where user_id = $1`.
- The `createAiStore` methods take `userId` as a required first argument.
- Crypto AAD: bump to `v2`, with AAD `tudocuatui-ai-key|v2|<sub>|<provider>`, so a ciphertext copied between rows will not open.
  - Keep reading `v1` with the `single` AAD. The existing ciphertext is v1 and the migration cannot re-seal it.
  - The next save writes v2. The `^v[0-9]+:` check constraint already allows both.
  - Update `crypto.test` and `parity.test`. The header comment says it ports a Supabase edge-function file, so check the parity contract.
- `rateLimit`: key the windows by `userId` (a `Map`), otherwise one user exhausts everyone's quota. Evict empty or expired entries so open signups cannot grow the map without bound.

**Rollback and the expand-only rule**
- Adding NOT NULL `user_id` with no default breaks INSERTs from the previous image, and dropping `ai_settings.id` breaks its queries. So this migration is not expand-only.
- Recommendation: accept it, as item_category_v2 already did ("restore the backup"). Record it in the migration header, in `db/migrations/README.md`, and in `work/decisions.md` as an amendment to the expand-only and D25 wording.
- Add a manual rollback comment: drop the composite FKs, restore single-column FKs, drop the columns, re-create `locations_name_key`, restore the `ai_settings.id` PK, re-create the view.
- Strict alternative: migration 1 adds nullable `user_id` and backfills. After the new image is live, migration 2 adds NOT NULL, the uniques and the `ai_settings` PK. This leaves an older image working only during the gap and is more work. I lean to the single file, with a pre-migrate backup as the Ming step.
- Do the migration only after a backup. Also update the "No RLS" comments and the README line about when `user_id` arrives.

### B. Drive photo ownership
- Keep ONE shared Drive folder (server-held credentials). Per-user folders add nothing, because ownership is the DB row.
- Authoritative ownership is `item_photos.user_id`. Do not rely on Drive metadata for authorization.
- Add `userId` to `appProperties` on new uploads, for audit and manual cleanup only. Keep `app=tudo`, so the sweep query is unchanged. Old files simply lack `userId`.
- `servePhoto` becomes `select drive_file_id from item_photos where id = $1 and user_id = $2`. A photo id belonging to another user returns 404, not 403, to avoid confirming existence.
- `putPhoto` and `handlePhoto`:
  - `withLockedItem` locks with `where id = $1 and user_id = $2 for update`.
  - Delete: `where item_id = $1 and id = $2 and user_id = $3`.
  - Replace delete: `where item_id = $1 and user_id = $2`.
  - Insert: add `user_id`.
- `photo-sweep.js` stays UNSCOPED (all users). It must keep reading all `item_photos` rows. Add a test that two users' referenced files are both kept.
- Browser caveat for the architect: `<img src="/api/photos/:id">` cannot send `Authorization: Bearer`, and the token is memory-only (ticket scope). The SPA must fetch the photo with the header and render an object URL, or the server needs a short-lived signed URL.
  - The current `Cache-Control: private, max-age=31536000, immutable` is fine for a blob fetch, but think about a shared device after logout.

### C. Enforcing scoping in the Node query layer (no RLS per D25)
1. The verified `sub` (validated as a uuid, lower-cased, in the verifier) is the only source of `userId`. `app.js` passes it into `handleApi` via ctx. No route may read it from the body, query or header.
2. Make `userId` a required first parameter of every function in `items.js`, `photos.js` and `ai/store.js`. Add a `// @ts-check` JSDoc typedef so omissions fail `pnpm typecheck`.
3. Specific SQL rules:
   - `saveItem` upsert: `on conflict (id) do update set ... where items.user_id = excluded.user_id`. Never put `user_id` in the SET list. If the conflicting row is another user's, 0 rows are returned and the route answers 404 (the id can never be created by this user, which is acceptable for random uuids). The location upsert uses `(user_id, name)`.
   - `wearItem`: use `insert into wear_logs (user_id, item_id, worn_on) select $1, id, $3 from items where id = $2 and user_id = $1 on conflict (item_id, worn_on) do nothing`. The "already" detection needs a separate existence check, because 0 rows now means either "already worn" or "not your item". The undo path: `delete ... where item_id = $1 and user_id = $2 ...`, with `user_id` repeated inside the subselect.
   - `listItems`, `getItem`, `listLocations`, `removeItem` and the final stats select: all carry `and user_id = $n`.
4. Bind the user once, e.g. `forUser(pool, userId)` returns closures, so call sites cannot forget it. The route code then only ever holds a bound store.
5. Defense in depth, not a fix: the composite FKs above stop cross-owner references even if one query forgets the filter.
6. RLS: I recommend NOT adding it in this ticket.
   - D25 and `db/migrations/README.md` currently say to add RLS with FORCE in the same migration that adds `user_id`, so Ming should amend D25 explicitly.
   - Working RLS needs per-request `set_config('app.user_id', $1, true)` inside a transaction, so every `pool.query` becomes a transaction.
   - It needs the app DB role to be a non-owner, non-BYPASSRLS role. The migration rules forbid `grant` and `create role`.
   - It breaks the cross-user sweep and the migrator unless they use a bypass role.
   - It is a good follow-up hardening ticket (security auditor's call), or do it now if Ming wants it.
   - Without RLS, the safety net is the tests in section D.

### D. Tests
Use the existing `server/test/pg.ts` and `*.db.test.ts` pattern.
- `schema.db.test`:
  - `user_id` is NOT NULL on all five tables.
  - The same location name is allowed for two users and rejected twice for one user.
  - An item pointing at another user's location is rejected, and so are a photo or wear log pointing at another user's item.
  - Deleting a location nulls only `location_id`.
  - The view has `user_id` as its last column.
- `migrator.db.test` (upgrade path): apply migrations 1 to 4 with seeded single-user rows, then the new one with `TUDO_OWNER_SUB`.
  - All rows including the `ai_settings` row get the owner.
  - It fails when rows exist and the owner is unset.
  - It passes on an empty database.
  - A malformed owner exits 2.
  - Add a case in `migrate.cli.test`.
- `api.db.test` / `app.db.test`: two-user isolation across every route:
  - list items and locations;
  - PUT on another user's id gives 404 and leaves the original unchanged;
  - DELETE and wear +1/-1;
  - photo PUT, DELETE and GET with the other user's ids give 404;
  - a body containing `user_id` is ignored;
  - `ai-settings` get, put and delete are independent per user.
- A crude guard test that scans the SQL strings in `server/*.js` and `server/ai/*.js` and fails when a statement touching a TuDo table or the view lacks `user_id`.
- `ai/store.db.test`: independent rows per user, and the "key sealed for another provider" rule per user.
- `crypto.test`: v2 round trip, a wrong sub fails to open, v1 is still readable. `rateLimit.test`: per-user windows.
- `photo-sweep.db.test`: files from two users are all treated as referenced. `fake-drive` / `drive.test`: `appProperties.userId` is set on upload.

## Risks
- Rollback to the pre-T-019 image is not safe after the migration (NOT NULL user_id and the dropped `ai_settings.id`). The pre-migrate backup is the rollback.
- The owner sub chicken-and-egg: Ming's sub exists only after he has an Identity account. He must obtain it (e.g. from Identity or ricotdin) before migrating, or the migration is blocked on a non-empty database. Until the backfill, the data is invisible to everyone.
- A wrong `TUDO_OWNER_SUB` hands Ming's wardrobe to another account silently, since there is no users table to validate against. Print only a row count after backfill, and double-check the value.
- `saveItem` without the `where items.user_id = excluded.user_id` clause is an account-takeover primitive. This is the highest-risk code change, so test it first.
- With join policy `open` there are no per-user quotas: unbounded items, photos and Drive storage, and AI-settings writes. Out of scope for this ticket, but record it as a follow-up.
- No cascade on account deletion: with no users table, Identity deleting an account leaves rows and Drive files. A `purge-user` script (DB rows plus Drive deletes) is a follow-up.
- PG older than 15 cannot use `on delete set null (col)`. See open question 1.

## Open questions for Ming / planner
1. What PostgreSQL version does the self-hosted DB run (the composite-FK `set null (col)` form needs 15 or later)?
2. Ming's `sub` and how he will obtain it before migrate day. I recommend the env var `TUDO_OWNER_SUB` and the sequence: backup, set the var, run migrate, deploy.
3. Accept a one-way migration (single file, restore from backup) or the stricter two-step expand/contract?
4. RLS: confirm "explicit scoping in Node only for now, RLS as a follow-up". This needs D25 and the migrations README amended.
5. Should the photo GET move to a fetch-with-bearer plus blob URL, or short-lived signed URLs (the browser `<img>` cannot send the token)?
6. Any per-user caps (items, photo bytes) needed before open signup goes live?
