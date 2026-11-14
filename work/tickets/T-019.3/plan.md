Status: READY

# Plan — T-019.3: Per-user AI settings

High tier (migration, key encryption). `Gate: plan-approval`: the loop stops here until Ming writes "Plan approved".
The assumptions to look at are A1 (the saved key is cleared, Ming enters it again), A4 (global ceilings), A8
(per-user tag cap of 1) and A12 (rollback cannot bring the key back).

## Feature summary
Not in `docs/feature-list.md` (T- ticket, slice of T-019). Ticket goal: "Each user has their own AI provider settings
and encrypted key (D33)."

Sources (quoted):
- D33 (`work/decisions.md`): "`ai_settings` is one row per user, bring-your-own-key; AAD
  `tudocuatui-ai-key|v2|<sub>|<provider>`; legacy `v1` ciphertext cleared; AI rate limits per user."
- Umbrella plan `work/tickets/T-019/plan.md`, *Files* (T-019.3 rows): migration "backfill, `user_id not null`, drop `id`,
  `primary key (user_id)`, clear legacy `v1:` ciphertext"; `store.js`, `routes.js`, `crypto.js`, `rateLimit.js`:
  "`userId` everywhere; AAD `tudocuatui-ai-key|v2|<sub>|<provider>`; per-user limiter `Map` with eviction"; tests
  "independent rows; wrong sub fails to open; per-user windows + eviction". *Split proposal* → T-019.3: "`ai_settings` PK
  `user_id`; legacy ciphertext cleared; v2 AAD with `sub` (ciphertext copied to another row does not open); each user's
  get/put/delete independent; per-user limiter windows with eviction; parity test updated."
- Umbrella A6: "Legacy `v1` ciphertext is cleared …, AAD v2 bound to `sub`, per-user limiter with eviction." The
  rationale in brackets ("the KEK is not yet deployed") no longer holds (ticket note 2026-11-13, T-018.2); clearing is
  still required (see A1).
- Ticket note (T-018.2, 2026-11-13): "make `store.getSecret(userId)` take the user; move `openStoredKey` … to the v2 AAD;
  make the `test` limiter per user and keep a global ceiling on `test`/`save` (open join); add a two-user `/test`
  isolation test (B never sends A's key and gets `not_configured`); test that a leftover v1 ciphertext gives
  `key_unreadable` or is cleared by the migration."
- Ticket note (F-701, 2026-11-14): "make `loadSettingsKey(ai, userId)` … take the user, include `tag` in the per-user
  limiter and the global ceiling, keep the `tag` in-flight cap global, and add a two-user isolation test (B gets
  `not_configured`, no fetch)."
- Ticket *Handoff* (F-701 security review F2): "`loadSettingsKey` must take a **required** `userId` (throw when missing,
  never default to the single row); the two-user isolation test covers both `/api/ai-settings/test` and
  `/api/ai/tag-photo` …; consider a per-user in-flight cap of 1 inside the global cap of 2 for tagging."
- Ticket note (T-019.2 plan A17): "add `ai_settings` to the T-019.2 SQL guard's table list."
- D30 (amended by D33): "Rate limits are in memory (save 30/h, test 20/h)". F-701: tag 100 per 24 h.

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "`ai_settings` primary key is `user_id`; the legacy ciphertext is cleared." | `git diff --stat main -- db/migrations`: one new file `20261114180000_ai_settings_per_user.sql` + `README.md`; the six applied files unchanged. `server/schema.db.test.ts` › "ai_settings: primary key is (user_id), no id column, user_id NOT NULL" and the updated "no table has RLS; user_id is NOT NULL on all five tables". `server/migrator.db.test.ts` › "ai_settings per user: …" tests (legacy v1 row → key columns null, provider/model kept, `user_id` = owner; owner assertions; empty table). `server/ai/store.db.test.ts` › "null user_id → 23502; duplicate user_id → 23505; two users → two rows". |
| 2 | "AAD v2 binds the ciphertext to the `sub`: a ciphertext copied to another row does not open." | `server/ai/crypto.test.ts` › "v2 round trip with the user", "another sub → throws", "v1 (old AAD, real ciphertext) → key_unreadable", "malformed sub → seal throws". `server/isolation.db.test.ts` › "row-copy attack: A's ciphertext copied into B's row → B's `/test` and tag-photo answer 409 `key_unreadable`, no fetch". |
| 3 | "Each user's get/put/delete is independent; per-user limiter windows with eviction." | `server/isolation.db.test.ts` › AI block (GET/PUT/DELETE independence; B's `/test` and tag-photo → 409 `not_configured`, no fetch, no body read); `server/ai/store.db.test.ts` › "two users: independent rows, key_required per user, clearKey per user"; `server/ai/rateLimit.test.ts` › per-user windows, global ceiling, "a rejected call records nothing", "eviction: `size()` returns to 0"; `server/ai/tagPhoto.test.ts` › per-user in-flight cap; `server/scoping.test.ts` with `ai_settings` in `TABLE_RE`. |
| 4 | "Parity test with `src/shared/ai` updated; all checks pass." | `server/ai/parity.test.ts` green; `git diff main -- src/shared/ai` empty (no new error code: A5, so the shared mirror needs no change; see A10). `pnpm typecheck`, `pnpm format:check`, `pnpm test` (DB tests in CI with Postgres 17), `pnpm build`; CI image check green. |

## Ming verification after merge
Merging needs nothing from Ming. This ticket ships in the **same first release as T-019.1 and T-019.2** (none of them is
released yet: M-17, M-18 and M-24 are open). No new M-item; the orchestrator adds the lines below to M-18 (A13).

**Before the release:** unchanged: M-17 (sub), M-24 (PG ≥ 15), M-18 (owner in compose + manual `pg_dump`).

**After the deploy (read-only on the Mac):**
- Deploy log: `applied 20261113120000_user_ownership_expand`, `applied 20261114120000_user_ownership_contract`,
  `applied 20261114180000_ai_settings_per_user`; app container healthy.
- `select user_id, provider, model, key_ciphertext is null as cleared from ai_settings;` → no row, or one row with Ming's
  `sub` and `cleared = t`. `\d ai_settings` shows `"ai_settings_pkey" PRIMARY KEY, btree (user_id)` and no `id` column.
- **Re-enter the AI key** in Settings (T-010) if AI is configured (M-16 done). `/api/ai-settings` then shows the hint;
  "Kiểm tra" (`/test`) answers ok. Optional M-23 smoke test after that.

### Release and rollback (not image-rollback-safe)
- **Order inside one deploy run:** `backup` → `migrate` applies expand, contract, ai_settings_per_user, each in its own
  transaction → app replaced. Failure points:
  - This file fails (owner unset with an `ai_settings` row present, owner mismatch, `lock_timeout`): expand and
    contract stay applied, this file rolls back, the deploy stops before the swap; the old app keeps running on the
    contract schema (T-019.2 A8 applies: old image reads work, item writes fail). Fix and re-release.
  - All applied, new app fails to start: the deploy's rollback starts the old image. On the new schema the old
    image's AI routes fail with 500 (`where id` → 42703); items/photos behave as described in T-019.2's rollback.
- **During the swap** (seconds): AI calls served by the old container answer 500; other routes are unaffected by
  this file (accepted, same class as T-019.2 A19).
- **Rolling back:** fix forward (preferred), or restore the M-18 `pg_dump`, or the manual down SQL in the migration
  header. **None of these brings back a usable key:** the v1 ciphertext is gone (cleared), and even the M-18 dump's v1
  ciphertext only opens under the old image. After any rollback Ming re-enters the key once more.
- The PR description must say "not image-rollback-safe; AI routes of an older image fail on the new schema; the saved
  AI key is cleared and must be re-entered".

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261114180000_ai_settings_per_user.sql` | New. Header (contract style: not image-rollback-safe, owner GUC contract, manual rollback SQL, key cannot be restored). Body: `lock table ai_settings in access exclusive mode`; owner DO block (only `if exists (select 1 from ai_settings)`); clear key columns; drop `ai_settings_pkey`, drop `id`, `user_id set not null`, `add constraint ai_settings_pkey primary key (user_id)`. See *Approach* 1. | AC1, A1, A2, A3 |
| `db/migrations/README.md` | Extend the "Exception" bullet: `20261114180000_ai_settings_per_user` (T-019.3) is not image-rollback-safe either (old AI code uses `where id`); it clears the stored AI key. "contract migrations (T-019.2/.3)" wording stays true. | A12, R2 |
| `server/ai/store.js` | `get(userId)`, `save(userId, input)`, `clearKey(userId)`, `getSecret(userId)`; `need(userId)` throws a plain `Error("userId required")` unless `toUserId(userId) === userId`; every statement uses `user_id = $1` / `on conflict (user_id)`; header comment "one row per user". | AC1, AC3 |
| `server/ai/crypto.js` | `VERSION = "v2"`; AAD `tudocuatui-ai-key|v2|<userId>|<provider>`; `sealKey(kek, userId, provider, plaintext)`, `openKey(kek, userId, provider, sealed)`, `openStoredKey(kek, userId, secret)`; `aad()` throws unless `toUserId(userId) === userId`; only `v2:` opens (no v1 fallback). Header comment: drop the "Port of supabase/…crypto.ts (no user id: D25)" line and the "T-019.3 changes the AAD here" note; say v1 is rejected on purpose (D33). | AC2, A6 |
| `server/ai/rateLimit.js` | `check(userId, kind)`; per-user `Map<userId, {save,test,tag}>` with eviction; `GLOBAL_LIMITS` ceiling per kind; record only when both pass; test-only `size()`. Header comment updated (per user + global, in memory, one process). | AC3, A4, A7 |
| `server/ai/routes.js` | `loadSettingsKey(ai, userId)` (required; throws `Error("userId required")` on a missing/empty value); `handleAiSettings` ctx gains `userId`; passes it to `limiter.check`, `sealKey`, `store.get/save/clearKey`, `loadSettingsKey`. `AiContext` typedef: `limiter.check(userId, kind)`, `tagSlots`. | AC2, AC3 |
| `server/ai/tagPhoto.js` | ctx gains `userId`; module-level `inFlight`/`MAX_IN_FLIGHT` removed; uses `ai.tagSlots.tryAcquire(userId)`; new check order (A9); `limiter.check(userId, "tag")`; `loadSettingsKey(ai, userId)`; `release()` in `finally`. | AC3, A8, A9 |
| `server/app.js` | `aiContext` gains `tagSlots: createInFlight({ perUser: 1, total: 2 })` (per app instance). | A8 |
| `server/api.js` | Pass `userId` to `handleAiSettings` and `handleTagPhoto` (lines 76, 78). | AC3 |
| `server/scoping.test.ts` | `ai_settings` added to `TABLE_RE`; header sentence "ai_settings is not listed: T-019.3 scopes it" removed; negative fixtures for `ai_settings`. | AC3, ticket note |
| `server/test/auth.ts` | `OWNER_C` and `x-test-user: c` in `headerAuth()` (test-only, not in the image). | tag in-flight total test |
| `server/ai/crypto.test.ts`, `server/ai/rateLimit.test.ts`, `server/ai/store.db.test.ts`, `server/ai/routes.test.ts`, `server/ai/tagPhoto.test.ts`, `server/isolation.db.test.ts`, `server/migrator.db.test.ts`, `server/schema.db.test.ts` | See *Tests to write*. | R8 |
| `docs/data-model.md` | Line 3: `ai_settings` is one row per user (`user_id` primary key, T-019.3, D33). | docs |
| `server/README.md` | AI section: "stored in the single `ai_settings` row" → "in the caller's `ai_settings` row (one per user, D33)"; `rate_limited`: per user 30 saves/h, 20 tests/h, 100 tags/24 h, plus global ceilings 600/300/2000; tagging "global until T-019.3" → "1 in flight per user, 2 in total". | docs |

Not changed: the six applied migrations; `src/` (including `src/shared/ai`, A10); `server/ai/config.js`, `index.js`
(`requestAuth` stays "Access verifier is on" until T-019.5); `server/inflight.js` (reused as is);
`scripts/check-image.sh`, `compose.yml`, `.env.example` (no new env); `server/ai/parity.test.ts` (A10).

## Tests to write
Fixed users: `OWNER_A`, `OWNER_B`, `OWNER_C` from `server/test/auth.ts`.

| Test (file › name) | Covers |
|---|---|
| `server/ai/crypto.test.ts` › round trip with `OWNER_A`; prefix `v2:`; two seals differ; ciphertext never contains the key | AC2 |
| `server/ai/crypto.test.ts` › open fails for: other KEK, other provider, **other sub (`OWNER_B`)**, tampered tag, truncated body (≤ 12 bytes), bad base64, `v1:` prefix on a v2 body, `v3:` | AC2 |
| `server/ai/crypto.test.ts` › a real v1 ciphertext (sealed in the test with WebCrypto and the old AAD `tudocuatui-ai-key|v1|single|claude`) → `openKey` throws and `openStoredKey(kek, OWNER_A, …)` → `key_unreadable` | AC2, ticket note |
| `server/ai/crypto.test.ts` › `sealKey` throws for `""`, `"xyz"`, uppercase uuid, nil uuid as user; `openStoredKey` with such a user → `key_unreadable` (never throws, never logs) | AC2, A6 |
| `server/ai/crypto.test.ts` › `openStoredKey`: null → `not_configured`; every failure → `key_unreadable`; no `console.*` calls (existing tests adapted) | AC2 |
| `server/ai/rateLimit.test.ts` › per user: A's 30 saves pass, 31st fails, B's first save passes; window rolls after 1 h (adapted old tests: `check(OWNER_A, kind)`) | AC3 |
| `server/ai/rateLimit.test.ts` › kinds independent per user; `tag` 100 per 24 h per user | AC3 |
| `server/ai/rateLimit.test.ts` › global ceiling: 300 `test` calls from 30 users (10 each) pass, the 301st from a fresh user fails; same for `save` (600, many users) and `tag` (2000); after the window it passes | AC3, A4 |
| `server/ai/rateLimit.test.ts` › a rejected call records nothing: (a) per-user rejection does not consume a global slot (global count unchanged); (b) global rejection does not consume the user's slot (that user, after the global window frees, still has its full per-user budget) | AC3, A4 |
| `server/ai/rateLimit.test.ts` › eviction: after calls by 50 users and `now` moved past 24 h, one more `check` (sweep trigger) or the users' own next check brings `size()` back to the number of users with live calls; a user whose arrays are all empty is deleted on their own check; sweep threshold reached with 1025 users → stale entries removed | AC3, A7 |
| `server/ai/rateLimit.test.ts` › defaults to the real clock | regression |
| `server/ai/store.db.test.ts` › schema: insert without `user_id` → 23502; same `user_id` twice → 23505; two users → two rows; bad column values → 23514 (adapted, `id` cases removed) | AC1 |
| `server/ai/store.db.test.ts` › two users: A `save` with key, B `get` → null; B `save` without key → B row has no key, A's key kept; `key_required` on provider change only for the user who has a key; `clearKey(B)` leaves A's key; `getSecret(B)` null while `getSecret(A)` returns A's | AC3 |
| `server/ai/store.db.test.ts` › every method throws `userId required` for `undefined`, `""`, a non-canonical uuid, without sending SQL | AC3 |
| `server/ai/store.db.test.ts` › v2 round trip: ciphertext sealed for A stored via `save(A)` opens with `openKey(kek, A, …)` and not with B; stored row never contains the key | AC2 |
| `server/ai/store.db.test.ts` › `updated_at` trigger fires (kept) | regression |
| `server/ai/routes.test.ts` › fakes take `userId` and record it; every store call receives the authenticated user | AC3 |
| `server/ai/routes.test.ts` › `loadSettingsKey(ai)` and `loadSettingsKey(ai, "")` reject with `userId required`, no `getSecret` call; existing three cases pass the user | ticket Handoff |
| `server/ai/routes.test.ts` › with `headerAuth()`: A's 21st `/test` → 429 `rate_limited`; B's first `/test` is not 429 | AC3 |
| `server/ai/tagPhoto.test.ts` › in-flight (replaces "a third concurrent call gets 503 ai_busy"): A holds one call → A's second → 503 `ai_busy` + `Retry-After: 5`; B is accepted (total 2); C → 503 `ai_busy`; after release C passes | A8 |
| `server/ai/tagPhoto.test.ts` › a busy rejection does not consume `tag` quota (A's count unchanged); a 415 / declared-413 does not consume quota | A9 |
| `server/ai/tagPhoto.test.ts` › two app instances do not share the in-flight counter (module-level counter gone) | A8 |
| `server/ai/tagPhoto.test.ts` › existing tests adapted to `fixedAuth(OWNER_A)` sealing (`sealKey(kek, OWNER_A, …)`); "100 pass, the 101st is 429 before getSecret" kept | regression |
| `server/scoping.test.ts` › negative fixtures: `"select provider from ai_settings where id"` and `` `update ai_settings set key_hint = null` `` reported; `"… from ai_settings where user_id = $1"` not; scan stays green over `server/ai/*.js` | AC3 |
| `server/isolation.db.test.ts` › AI block (own app with `ai: { kek, fetch: fakeFetch }` so its limiter starts fresh; `beforeEach` truncates `ai_settings`): A PUTs a key → B GET `{settings:null}`; B PUTs provider/model without key → B `hasKey:false`, A's view unchanged; B DELETE key → A's `hasKey` still true; A DELETE → B unaffected | AC3 |
| `server/isolation.db.test.ts` › B `/api/ai-settings/test` → 409 `not_configured`, fake fetch not called (A's key never sent); A's `/test` → fetch called once with A's key | AC3, ticket note |
| `server/isolation.db.test.ts` › B `/api/ai/tag-photo` → 409 `not_configured`, no fetch | AC3, ticket note |
| `server/isolation.db.test.ts` › row-copy attack: after B saved provider/model, SQL copies A's `key_ciphertext`/`key_hint` into B's row → B `/test` and tag-photo → 409 `key_unreadable`, no fetch | AC2 |
| `server/isolation.db.test.ts` › runtime recorder also covers the AI routes (every statement other than `begin`/`commit`/`rollback` contains `user_id`) | AC3 |
| `server/migrator.db.test.ts` › new `contractDir()` (first seven files: four applied + expand + contract). From that state with an `ai_settings` row (`user_id` null, provider `claude`, a `v1:` ciphertext + hint + `key_updated_at`) and owned rows, run `realDir` with `OWNER` → row has `user_id = OWNER`, `key_ciphertext`, `key_hint`, `key_updated_at` null, provider/model kept, `updated_at` bumped; PK is `(user_id)`; no `id` column | AC1, A1, A3 |
| `server/migrator.db.test.ts` › from `contractDir()`: null-owner `ai_settings` row + no owner → fails "rows exist but TUDO_OWNER_SUB is not set", version absent, `id` column still there; row owned by `OWNER_B` + GUC `OWNER` → "existing owner differs from TUDO_OWNER_SUB"; messages contain no uuid | A2 |
| `server/migrator.db.test.ts` › empty `ai_settings` passes with and without owner (replaces "an ai_settings row with null user_id is ignored", which is pinned to `contractDir()` to keep proving T-019.2 behaviour) | A2 |
| `server/migrator.db.test.ts` › "empty DB passes with and without owner": version count 6 → 7 | regression |
| `server/schema.db.test.ts` › "no table has RLS; user_id is NOT NULL on all five tables" (replaces the nullable-`ai_settings` version); "ai_settings: primary key is (user_id), no id column" (`pg_index` / `information_schema`) | AC1 |

## Approach
1. **Migration `db/migrations/20261114180000_ai_settings_per_user.sql`** (DB consult rec. 1):
   1. Header as in *Files*, with manual rollback (never run automatically):
      `alter table ai_settings drop constraint ai_settings_pkey; alter table ai_settings add column id boolean not null
      default true check (id);` (only with ≤ 1 row) `alter table ai_settings add constraint ai_settings_pkey primary key
      (id); alter table ai_settings alter column user_id drop not null;` — the cleared key cannot be restored.
   2. No PG version guard (nothing here needs PG 15; the contract already guards).
   3. `lock table ai_settings in access exclusive mode;`
   4. One DO block, same shape and same constant messages as the contract: `raw := nullif(btrim(current_setting(
      'tudo.owner_sub', true)), '')`; only `if exists (select 1 from ai_settings)`: `raw is null` → `'rows exist but
      TUDO_OWNER_SUB is not set'`; format/nil check before any cast → `'TUDO_OWNER_SUB is not a valid uuid'`;
      `count(distinct user_id)` of non-null values > 1 → `'rows belong to more than one owner'`; = 1 and ≠ `raw::uuid` →
      `'existing owner differs from TUDO_OWNER_SUB'`; then `update ai_settings set user_id = raw::uuid where user_id is
      null`. Stragglers are not deleted (provider/model are not secret). No `raise notice`. Close with `end $$;`.
   5. `update ai_settings set key_ciphertext = null, key_hint = null, key_updated_at = null where key_ciphertext is not
      null;` — unconditional on version (every stored value is v1), keeps `ai_settings_key_pair_chk`; the
      `ai_settings_updated_at` trigger stays enabled, so `updated_at` is bumped (A3).
   6. `alter table ai_settings drop constraint ai_settings_pkey; alter table ai_settings drop column id;` (drops the
      `check (id)` too) `alter table ai_settings alter column user_id set not null; alter table ai_settings add
      constraint ai_settings_pkey primary key (user_id);` No FK (no users table). The `^v[0-9]+:` check stays.
2. **Crypto v2** (`crypto.js`, consult rec. 3): `aad(userId, provider)` re-validates with `toUserId(userId) === userId`
   (import from `../user.js`), throws `Error("bad_user")`; `openKey` accepts only `v2:`; `openStoredKey(kek, userId,
   secret)` keeps the single failure code. A v1 value (if any survived) gives `key_unreadable`, never a fallback.
3. **Store** (`store.js`, consult rec. 2), `userId` as `$1` everywhere:
   - `get`: `select provider, model, key_hint, updated_at from ai_settings where user_id = $1`.
   - `save`: in a transaction `select provider, key_hint from ai_settings where user_id = $1 for update`; `key_required`
     rule unchanged (per user); with key `insert into ai_settings (user_id, provider, model, key_ciphertext, key_hint,
     key_updated_at) values ($1, $2, $3, $4, $5, now()) on conflict (user_id) do update set …`; without key `insert …
     (user_id, provider, model) values ($1, $2, $3) on conflict (user_id) do update set provider = excluded.provider,
     model = excluded.model`. `user_id` is never in a `set`. A first-save race is benign (`on conflict`).
   - `getSecret`: `… where user_id = $1 and key_ciphertext is not null`; `clearKey`: `update … where user_id = $1
     returning …`.
   - `need(userId)` at the top of each method (throws before any SQL).
4. **Routes** (consult rec. 4): `loadSettingsKey(ai, userId)` throws `Error("userId required")` when `typeof userId !==
   "string" || userId === ""` (callers' `try/catch` map it to 500 `internal`); then `getSecret(userId)` and
   `openStoredKey(ai.kek, userId, secret)`. `api.js` passes `userId` (already in its ctx) into both AI handlers.
5. **Limiter** (`rateLimit.js`, consult rec. 5): `LIMITS` unchanged (save 30/h, test 20/h, tag 100/24 h per user);
   `GLOBAL_LIMITS = { test: 300/h, save: 600/h, tag: 2000/24 h }` (A4). `check(userId, kind)`: prune the caller's array
   and the global array for `kind`; if either is at its max return `false` and record nothing; else push `t` to both.
   Eviction: when all three arrays of the caller are empty after pruning, delete the entry; every 256 checks, or when
   `size() > 1024`, sweep all entries (prune each, delete empties). No hard size cap and no insertion-order eviction
   (A7). Global arrays are bounded by their max. All rejections → 429 `rate_limited` (A5).
6. **Tag in-flight** (consult rec. 6): `app.js` creates `tagSlots = createInFlight({ perUser: 1, total: 2 })` in
   `aiContext`; `tagPhoto.js` order (A9): `ai` null → 503; content-type → 415; declared length → 413;
   `const release = ai.tagSlots.tryAcquire(userId)` (no `await` before it) → `null` → 503 `ai_busy` + `Retry-After: 5`;
   `limiter.check(userId, "tag")` → 429 (release first); then store, `loadSettingsKey`, body, provider; `release()` in
   `finally`.
7. **Guard and docs:** `scoping.test.ts`, `server/README.md`, `docs/data-model.md`, `db/migrations/README.md`.
8. **Tests** as listed, then all checks.

Rules: R1 — server only; `src/`, local mode and the Figma Make preview untouched. R2 — new migration file only; RLS stays
in T-019.4 (D32); there is no `src/types/database.ts` in this Node/Postgres setup (umbrella A18). R3 — no new secret, no
`VITE_*`; the key stays sealed under `AI_KEK`; logs keep fixed fields (no `userId`, key, hint or ciphertext). R4 — not
affected. R5 — nothing derived is stored. R6/R9/R10 — no UI, no Figma Make files. R7 — Gemini (F-701.1), quotas (A7 of
the umbrella) and RLS stay out. R8 — tests above.

## Specialist input used
- database-optimizer (`consult-database-optimizer.md`):
  - Findings 1–8: all confirmed against the code and used.
  - Rec. 1 (migration): adopted, except the PG guard (omitted: nothing in this file needs PG 15, and the contract already guards) and with `where key_ciphertext is not null`
    on the clear (same result, no bump for rows without a key).
  - Rec. 2 (store), 3 (crypto v2, no v1 fallback), 4 (`loadSettingsKey` required user), 7 (guard), 8 (isolation, fakes,
    migrator tests): adopted.
  - Rec. 5 (limiter): adopted with the suggested ceilings (A4), opportunistic sweep, no hard cap (A7).
  - Rec. 6 (tag in-flight): adopted `createInFlight({ perUser: 1, total: 2 })` and "acquire before the limiter" (A8, A9).
  - Rec. 9 (process): adopted (no new D-entry, Ming re-enters the key, docs updated).
  - Risk 8 / open question 4: resolved: `supabase/` was deleted in T-016 (no `supabase/` directory in the repo; the
    only reference is the stale comment in `server/ai/crypto.js:3`, which this ticket rewrites). Nothing to keep in sync
    (A11).
  - Open questions 1, 2, 3, 5 → A4, A3, A5, A9.

## Assumptions
- **A1 — The saved key is cleared, not migrated.** Every stored value is v1 (`…|v1|single|<provider>`), which does not
  bind the user (D33). Re-sealing would need the KEK inside the migration (not possible in SQL, and a v1 fallback in code
  would reopen the cross-user hole). Ming enters his key once after the release. The umbrella's "KEK not yet deployed"
  reason is stale (T-018.2 merged); clearing is still the right call.
- **A2 — Owner contract repeated for `ai_settings`.** If a row exists, `TUDO_OWNER_SUB` must be set and any non-null
  `user_id` must equal it; a null `user_id` is backfilled. Empty table: no owner needed (CI, db smoke). Same constant
  messages as the contract. This replaces the T-019.2 rule "a null-owner `ai_settings` row is ignored" (that test stays,
  pinned to the contract-only state).
- **A3 — The clear bumps `updated_at`** (trigger left enabled). The row did change: its key is gone; the Settings screen
  shows the new date.
- **A4 — Global ceilings: `test` 300/h, `save` 600/h, `tag` 2000/24 h** (consult's numbers; T-018.2 note "keep a global
  ceiling … (open join)", extended to `tag` by the F-701 note). They bound outbound fan-out and `/test` as a key-validity
  oracle across many accounts. Each is ≥ 10× a single user's limit, so one user never hits them.
- **A5 — No new error code.** A global-ceiling rejection answers the same 429 `rate_limited` as a per-user one (no
  oracle about other users' traffic; the SPA already handles it). Therefore `src/shared/ai` is unchanged.
- **A6 — `userId` validation in three layers:** `loadSettingsKey` (required, non-empty), the store (`need`: canonical
  uuid), crypto (`aad`: canonical uuid). A bad value throws → 500 `internal`; never a fallback to "the" row.
- **A7 — Limiter memory:** entries exist only for users with a call in the last 24 h (each recorded call also takes a
  global slot, so at most 2,900 live timestamps); empty entries are deleted on the user's next check and by the periodic
  sweep. No hard cap and no insertion-order eviction (abusable through account churn). State is in memory per process:
  a restart resets it, a second replica would double the limits (one container, D30).
- **A8 — Tag in-flight: 1 per user, 2 in total** (F-701 Handoff "consider a per-user in-flight cap of 1 inside the global
  cap of 2"), held per app instance. Behaviour change: one user can no longer run two tag calls at once (the SPA sends
  one per photo, F-702 not yet built). The ticket note "keep the `tag` in-flight cap global" is met: the total cap of 2
  stays.
- **A9 — Check order for tag-photo:** cheap header checks (415, declared 413) → in-flight acquire (503 `ai_busy`) →
  per-user/global limiter (429) → key. A busy, 415 or 413 answer never consumes quota. Today the limiter runs first;
  the only visible change is that these rejections no longer count.
- **A10 — "Parity test updated" means "kept green and still meaningful".** The parity test covers catalog, validate,
  mask and error statuses; nothing in them changes (A5), and crypto has no mirror in `src/shared/ai`. If the reviewer
  wants a literal diff, the only candidate would be redundant; none is planned.
- **A11 — No Edge-function crypto.** `supabase/functions/_shared/core/crypto.ts` no longer exists (T-016 removed
  `supabase/`; confirmed: no `supabase/` directory, only the stale comment in `crypto.js`). v2 lives only in
  `server/ai/crypto.js`.
- **A12 — Not image-rollback-safe**, and the key cannot be restored by any rollback (see *Release and rollback*). Stated
  in the migration header, `db/migrations/README.md` and the PR description.
- **A13 — Release with T-019.1/T-019.2** in the first release (M-17, M-18, M-24 still open). No new M-item: the
  orchestrator adds to M-18 the post-deploy check (`ai_settings` PK `user_id`, key cleared) and "re-enter the AI key in
  Settings"; the M-16 and M-23 texts already say the key is cleared by T-019.3.
- **A14 — Migration version `20261114180000`**, after `20261114120000_user_ownership_contract`; no other open ticket adds
  a migration (T-019.4 comes later).
- **A15 — No new decision entry.** D33 covers the design; the ceilings (A4) and the tag cap (A8) are recorded here and in
  `server/README.md`.
- **A16 — Hotspots:** `server/app.js`, `server/api.js`, `server/ai/*`, `server/scoping.test.ts`,
  `server/isolation.db.test.ts` are also edited by T-019.4/T-019.5 (BACKLOG) and F-701.1 (BACKLOG); no other ticket is
  `IN_PROGRESS`, `REVIEW` or `DONE` except the T-019 umbrella row. `src/App.tsx` is not touched.
- **A17 — Size above the guide, kept as one ticket.** Estimate ≈ 650 changed lines: ≈ 250 production (migration ≈ 60
  with header, store ≈ 40, crypto ≈ 25, limiter ≈ 60, routes/tagPhoto/app/api ≈ 35, docs ≈ 20) and ≈ 400 tests (≈ 120
  mechanical: new signatures in fakes and fixtures). Migration, store, crypto and tests are coupled and ship in one
  release. Fallback seam in *Split proposal*.
- **A18 — `index.js` `requestAuth` unchanged** (Access-on only); T-019.5 changes it to "auth mode is access or identity"
  (T-018.2 A1 note).

## Blocking questions
None. Every open point has a default above (A1–A18); Ming can overturn any of them at plan approval.

## Split proposal
None by default (A17). Fallback if the first implement/review cycle runs over: **T-019.3a** = migration, store, crypto
v2, `loadSettingsKey(ai, userId)`, `api.js` plumbing, guard, isolation/migrator/schema/store/crypto tests (AC1, AC2 and
the get/put/delete half of AC3), with `limiter.check(userId, kind)` as a thin wrapper over today's global arrays.
**T-019.3b** = per-user limiter windows with eviction, global ceilings, per-user tag in-flight cap and their tests.
Both must ship in the same release (identity mode needs both).
