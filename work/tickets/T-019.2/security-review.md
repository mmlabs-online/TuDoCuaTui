# Security review — T-019.2

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, read-only)

**Verdict:** no 🔴. Ownership scoping and owner config are sound on the paths read. Three 🟡 change what T-019.4 and T-019.5 must do; a few 🟢 hardening points. Could not run git or checks; read the branch files (migration; `server/{items,photos,inflight,user,access,app,api,index,migrator,migrate,errors,photo-sweep}.js`; `scoping.test.ts`, `isolation.db.test.ts`, `server/test/auth.ts`; `check-image.sh`; `compose.yml`; `.env.example`; test names in `migrator.db.test.ts`, `access.test.ts`, `index.cli.test.ts`, `migrate.cli.test.ts`).

### Findings
**`userId` source (AC2)** — 🟢 one source: `app.js:79-86` passes `result.userId` from `auth.authenticate`; `api.js:57` forwards. Access: `access.js:85-91` returns `ownerSub`; no header/query/body read. Client cannot set ownership: insert binds `user_id` from `$15` (`items.js:73,97`); body `user_id` ignored (`isolation.db.test.ts:133`); `toItemRow` (`items.js:8-31`) never returns it. Test-only auth unreachable: no production import of `test/auth` / `x-test-user`; `check-image.sh:71-72` fails if `server/test` or `*.test.*` present.

**Item queries (AC2/AC3)** — 🟢 every statement scoped: list `:37`, locations `:46`, location upsert `on conflict (user_id, name)` `:65`, get `:117`, remove `:136-146`, wear ±1/stats `:165-179`. Guarded upsert: `user_id` never in `set`; `where items.user_id = excluded.user_id` (`:80`) → `rowCount 0` → rollback incl. created location (`:100-104`) → 404; `isolation.db.test.ts:122-131` checks rows (`updated_at` incl.) and locations unchanged. Foreign = missing: DELETE → 204, nothing deleted, no Drive call; wear → 404. Accepted oracle: PUT unknown id creates, foreign id → 404 (needs the other UUID).

**Photos (AC3/AC4)** — 🟢 `withLockedItem` `where id and user_id` (`photos.js:99-107`); PUT ownership check before Drive (`:197-201`), re-check under lock, new Drive file deleted on failure (`:242-245`); replace-delete/insert carry `user_id` (`:229,234`); DELETE scoped, 404 for foreign item (`:160-168`); `servePhoto` scoped lookup before 304/Drive (`:279-298`), B never gets a 304. Drive deletes only use owned `drive_file_id`s (`items.js:142`, `photos.js:163,229`). In-flight cap race-free (`tryAcquire` before any `await`, `photos.js:151`; idempotent release `inflight.js:19-26`; `finally` `photos.js:181`).

**Sweep and guard (AC4/AC5)** — 🟢 sweep global (`photo-sweep.js:86,131`), allow-listed with stale check (`scoping.test.ts:43-54`). Runtime recorder (`isolation.db.test.ts:249-266`) covers every item/photo route.

**Owner config** — 🟢 required in both modes (`access.js:14-19,33,46`), constant messages, exit 2 (`index.js:34-39`); migrate uses the same `toUserId` (`migrator.js:98-103`); compose anchor `&owner_sub` feeds `migrate` and the app (`compose.yml:36,48,80`); `check-image.sh:103-105` exit 2 for missing/malformed/nil; CLI tests check a `SECRETISH` value is never echoed.

**Migration** — 🟢 version guard (`contract.sql:30-35`); four tables locked before the owner check (`:37`); format check before any `::uuid` cast (`:53-57`); single-owner + GUC equality across five tables (`:59-71`) — resolves T-019.1 rec 2; migrator prints only `err.message` (`migrator.js:203-205`) — resolves rec 3; PG messages for 23502/23503/23505/lock-timeout have no row values; API logs only code/constraint/routine (`errors.js:35-44`). Composite FKs make cross-owner references impossible; view joins locations on `l.user_id = i.user_id` (`:124`); photo/wear laterals safe via FKs.

**Forward risks**
- 🟡 **T-019.4, view:** `items_with_stats` (`contract.sql:107`) is a normal view (owner's rights) → bypasses RLS on `items`/`wear_logs`. Recreate `with (security_invoker = true)` (PG ≥ 15) or it stays unprotected.
- 🟡 **T-019.4, sweep:** under `FORCE` RLS the unscoped sweep (`photo-sweep.js:86`) sees only rows its role/GUC allows. Zero rows is safe (guard `:112-116`); one user's rows is not — other users' files become delete candidates, and the re-check (`:131`) sees the same filtered view. Needs a `BYPASSRLS` sweep role or a dedicated policy, plus a two-user sweep test under RLS.
- 🟡 **T-019.5, cross-user slowloris:** cap 2/user, 3 total (`photos.js:17`), body up to 30 s (`:15`) → two stalled users block all uploads (503). Fine under Access; before identity mode add per-IP/per-user rate limit or shorter deadline for slow senders.

**Hardening (🟢)**
- Static guard scans only `server/*.js` and `server/ai/*.js` (`scoping.test.ts:56-63`); a new subfolder (e.g. `server/auth/`) would be skipped; scanner (`:15-36`) can lose track on a regex with a quote; `TABLE_RE` misses `public.items`. Scan recursively.
- T-019.5: map the Identity `sub` through `toUserId` (`user.js:14-18`), never the raw claim (uppercase would silently see nothing).
- `contract.sql:45-49` counts a null-owner `ai_settings` row as "rows exist" — stricter than plan wording, safe, tested (`migrator.db.test.ts:378-387`).
- Wrong owner caught in SQL exits 1; malformed env exits 2; both stop the deploy.

### Recommendations
1. (🟡, T-019.4) `items_with_stats` `with (security_invoker = true)` + test: no rows of another user under RLS.
2. (🟡, T-019.4) Sweep as `BYPASSRLS` role (or dedicated policy) + two-user sweep test under `FORCE` RLS.
3. (🟡, T-019.5) Before identity mode: rate-limit photo PUTs per IP/user or tighten the body deadline.
4. (🟢) Optional: recursive scan in `scoping.test.ts`.
5. (🟢, T-019.5) `sub` through `toUserId`.

### Risks
- No RLS until T-019.4 (acceptable only while Access keeps the app single-user).
- T-019.3 open: AI settings/key shared.
- T-019.6 open: `private, max-age=31536000, immutable` (`photos.js:253`).
- Not image-rollback-safe (A8); rollback = M-18 backup.

### Open questions
- Is the deployment repo private? The owner `sub` will be committed in `compose.yml:36`.
