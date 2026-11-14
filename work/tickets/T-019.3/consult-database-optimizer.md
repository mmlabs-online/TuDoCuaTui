# Consult — database-optimizer — T-019.3 (2026-11-14, read-only, nothing run)

## Findings
1. **A write path is already stale.** `store.js` still addresses the single row (`where id`, `insert (id, …) values (true, …)`, `on conflict (id)`); T-019.2 left `ai_settings.user_id` nullable and unused, so a PUT between the expand migration and T-019.3 creates a row with `user_id IS NULL`. The contract migration (`20261114120000`, 45-49) treats an `ai_settings` row as "rows exist" and requires `tudo.owner_sub`, checks the owner but does not backfill `ai_settings` (75-78). `migrator.db.test.ts:378-387` pins "null-owner `ai_settings` row ignored when no owner" — T-019.3 replaces it with a stricter rule.
2. **The v1 AAD is the hole D33 closes.** `crypto.js:13` binds `…|v1|single|<provider>` only; a v1 ciphertext copied from A's row into B's would open for B. v1 must be rejected, not read as legacy. `openKey` accepts only `v1:` today (no version dispatch).
3. **Limiter:** one global array per kind (`rateLimit.js`); `check(kind)` has no user; callers `routes.js:66,116`, `tagPhoto.js:37`.
4. **Tag in-flight:** module-level `let inFlight` (`tagPhoto.js:12-13`), shared by every app instance incl. tests; `server/inflight.js` `createInFlight({perUser,total})` already fits.
5. **`loadSettingsKey(ai)`** calls `getSecret()` with no user; callers `routes.js:80`, `tagPhoto.js:48`.
6. **Scoping guard:** `TABLE_RE` omits `ai_settings`; header says T-019.3 scopes it.
7. **Isolation test** builds the app without `ai`; `beforeEach` truncate omits `ai_settings`.
8. **Parity test** covers catalog/validate/mask only — unaffected by crypto. Plan should say it stays green and the Edge-function `crypto.ts` is not ported to v2.

## Recommendations
### 1. Migration `db/migrations/2026111xxxxxxx_ai_settings_per_user.sql`
- Fix-forward header (contract style): not image-rollback-safe (old `where id` → 42703); rollback = restore pre-release pg_dump; manual rollback SQL (cannot restore the cleared key): add `id`, re-add PK, drop `user_id` PK, drop NOT NULL. AI routes return 500 during the swap (same class as T-019.2 A19).
- Guard (PG ≥ 15 or none), then `lock table ai_settings in access exclusive mode`.
- Owner/straggler assertion identical to T-019.2, only `if exists (select 1 from ai_settings)`: raise if `tudo.owner_sub` empty; format + non-nil check before any cast, constant messages; raise if distinct non-null `user_id` > 1 or ≠ owner; backfill `set user_id = raw::uuid where user_id is null`. Don't delete stragglers (provider/model not secret). Update `migrator.db.test.ts:378-387`: null row + no owner raises/rolls back; null row + owner backfilled; mismatch raises; two owners raise; empty table passes with/without owner.
- Clear legacy ciphertext unconditionally (all stored is v1): `update ai_settings set key_ciphertext = null, key_hint = null, key_updated_at = null` (keeps `ai_settings_key_pair_chk`). Disable `ai_settings_updated_at` around it or accept the bump (lean: allow the bump); state and test.
- Then `alter table ai_settings drop constraint ai_settings_pkey; alter table ai_settings drop column id;` (drops `check (id)`; confirm the name), `alter column user_id set not null; add primary key (user_id);`. No FK. Keep the `^v[0-9]+:` check (future v3); v1 guarantee = the update + crypto rejection.
- `schema.db.test.ts` / `store.db.test.ts`: replace "second row → 23505 via `id`" with null `user_id` → 23502, duplicate `user_id` → 23505, different `user_id` → allowed; PK is `(user_id)`.

### 2. `server/ai/store.js` — `userId` first
- `get(userId)`, `save(userId, input)`, `clearKey(userId)`, `getSecret(userId)`; `need(userId)` throws a plain `Error` unless a canonical uuid (null would silently read nothing / 23502 on writes).
- SQL with literal `user_id`: get `… where user_id = $1`; save `select provider, key_hint … where user_id = $1 for update` then `insert … (user_id, provider, model[, key_ciphertext, key_hint, key_updated_at]) … on conflict (user_id) do update …` (no-key branch keeps the key; `key_required` on provider change, per user); getSecret `where user_id = $1 and key_ciphertext is not null`; clearKey `update … where user_id = $1 returning …`. First-save race benign (`on conflict (user_id)`).

### 3. `server/ai/crypto.js` — AAD v2
- `VERSION = "v2"`, AAD `tudocuatui-ai-key|v2|<sub>|<provider>`, prefix `v2:`. `sealKey(kek, userId, provider, plaintext)`, `openKey(kek, userId, provider, sealed)`; `aad()` re-validates `userId` (uuid regex / `toUserId`) and throws. `openKey` accepts only `v2:`; `v1:` → unreadable → `key_unreadable`; no v1 fallback. `openStoredKey(kek, userId, secret)`; single failure code. Update header comments ("no user id: D25", "T-019.3 changes the AAD here").
- `crypto.test.ts`: round trip with user; different sub → throws; different provider → throws; `v1:` (even from the old AAD) → `key_unreadable`; tampered/short body fails; malformed sub throws at seal.

### 4. `loadSettingsKey(ai, userId)` required
- Throw `Error("userId required")` if not a non-empty string (callers map to `internal`); never fall back to a single row. Pass to `getSecret(userId)` and `openStoredKey(ai.kek, userId, secret)`. Thread `userId` through `handleAiSettings(…, {route, ai, userId, id, log})` and `handleTagPhoto(…, {ai, userId, id, log})` (`api.js:47/57` has it; pass at 76/78). Test: `loadSettingsKey(ai)` and `(ai, "")` reject.

### 5. Limiter (`rateLimit.js`)
- `check(userId, kind)`, test-only `size()`, injectable `now`. `Map<userId, {save, test, tag}>`; prune the caller's arrays; delete when all empty; opportunistic sweep (size > 1024 or every N checks).
- Global ceiling per kind (`GLOBAL_LIMITS`) on top of per-user (save 30/h, test 20/h, tag 100/24h); suggested test 300/h, save 600/h, tag 2000/24h (guesses; pin in the plan). Global counter = bounded array. Check both, record only when both pass (neither rejection consumes the other's slot). Either → 429 `rate_limited`.
- No hard Map-size cap needed (live entries bounded by the longest-window global ceiling); never evict by insertion order (resets live users under account churn); if a defensive cap is wanted, fail closed.
- Global ceiling protects server resources/outbound fan-out and bounds `test` as a key-validity oracle.
- Tests (fake clock): independent per-user windows; global trips with many users below their limits; rejected calls record nothing (both directions); eviction brings `size()` back; `tag` in both; adapt old `check(kind)` tests.

### 6. Tag in-flight
- Replace the module-level counter with `createInFlight({perUser: 1, total: 2})` held in `aiContext` (created in `createApp`). Acquire before reading the body, release in `finally` (idempotent). Busy → 503 `ai_busy` + `Retry-After: 5`. Consider acquiring before `limiter.check("tag")` so busy doesn't burn quota (plan must state it). Update `tagPhoto.test.ts`: two users in flight + third → busy; same user's second → busy while another user is accepted up to 2.

### 7. Scoping guard
- Add `ai_settings` to `TABLE_RE`; negative fixtures (`from ai_settings where id` reported; `… where user_id = $1` not); delete the "not listed" sentence; scan `routes.js` too.

### 8. Isolation tests
- `isolation.db.test.ts`: pass `ai: { kek, fetch: fakeFetch }`; truncate `ai_settings`; fixed `now` → keep per-test calls below limits or a fresh app for the AI block.
- Cases: A PUTs a key → B's GET unconfigured, no hint; B's DELETE key doesn't affect A; B's own settings don't change A's view; `/test` as B → 409 `not_configured`, no fetch, A's key never sent; `/api/ai/tag-photo` as B → `not_configured`, no fetch, no body read; row-copy attack (A's ciphertext copied to B's row) → B's `/test` and tag-photo `key_unreadable`, no fetch; independent in-flight caps and limiter windows; AI routes in the "every statement mentions user_id" recorder.
- `routes.test.ts` / `tagPhoto.test.ts` fakes: new signatures; `loadSettingsKey` without user throws. `store.db.test.ts`: per-user independence; `key_required` per user; v2 round trip with sub; ciphertext never the key. `migrator.db.test.ts`: legacy v1 row with owner → cleared (three columns null; provider/model kept; `user_id` = owner); PK `user_id`; no `id` column.

### 9. Process
- Keep `Gate: plan-approval`. Ming item: re-enter the key after release (A6 "KEK not deployed" rationale is stale; clearing still correct). Update `docs/data-model.md` and two `server/README.md` mentions. No new D-entry needed (D33 covers it); record global-ceiling numbers in the plan.

## Risks
1. A readable v1 fallback reintroduces the cross-user hole → clear and reject v1.
2. Deploy window: AI routes fail between new schema and new image (old `where id` → 42703); accepted, documented; release together.
3. Straggler row with unset owner raises and stops the deploy (intended); re-check the runbook for this migration.
4. Eviction by insertion order is abusable via account churn — not recommended.
5. Limiter/ceiling in memory per process (restart resets; a second replica doubles); acceptable for one container (D30); state it.
6. Test pollution from module-level `inFlight` and fixed `now`; fix per 6 and 8.
7. Test churn large vs size S (S–M per the umbrella table).
8. Edge-function `supabase/functions/_shared/core/crypto.ts` origin — confirm out of scope.

## Open questions
1. Global ceilings (suggest test 300/h, save 600/h, tag 2000/24h).
2. Should the clear bump `updated_at`? (suggest yes)
3. Dedicated code for the global ceiling, or keep 429 `rate_limited`? (suggest keep)
4. Is the Edge-function crypto still used anywhere?
5. Acquire the tag in-flight slot before or after the rate-limit check? (suggest before)
