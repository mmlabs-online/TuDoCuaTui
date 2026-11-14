# Security review — T-019.1

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, read-only)

**Verdict: no blocking findings.** Nothing leaks the owner value, opens an injection path, leaves rows half-owned or breaks the old image. Two 🟡 (a Ming step; the T-019.2 plan), no code change needed in this diff. Files read; no tests run.

### Findings
**1. Owner value never printed or logged: 🟢** — `server/migrator.js:99-106` `parseOwnerSub` fixed message, exit 2, runs first in `runMigrations` (`:127`) before file read/connection. `server/migrate.js:10-18` prints only `err.message`/`err.code`; `:20-27` fixed strings. `migrator.js:204-207` wraps only `err.message` (drops `detail`/`where`/`hint`; `detail` would echo row values). Migration `:35-42` constant `raise exception` texts; format/nil check before the only `raw::uuid` cast (`:47-51`); PL/pgSQL CONTEXT has no variable values. Default PG logging doesn't log bound parameters; `pg_stat_activity` shows `$1`. Tests: `migrate.cli.test.ts:37-47, 61`, `migrator.db.test.ts:236-253`.

**2. GUC bound + transaction-local: 🟢** — `migrator.js:191` `select set_config('tudo.owner_sub', $1, true)`; reverts at commit/rollback; not in checksum or `schema_migrations`; set after `begin` and `set local tudo.migrating`; transaction-end guard (`:195-198`) still applies. Nit: set for every pending file in the run (T-019.2 relies on it).

**3. Injection: 🟢** — never interpolated; `LOCK_KEY` constant; JS regex (`:91`) and PG regex (`.sql:39`) anchored; SQL side doesn't lowercase (fails closed in manual psql; JS lowercases).

**4. Trigger disable/enable confined: 🟢** — transactional DDL (`.sql:45-53`), rolls back on failure; `add column` (`:20-24`) holds ACCESS EXCLUSIVE until commit so old-app writes queue; tests `migrator.db.test.ts:174-196` (updated_at unchanged, `tgenabled='O'`, later update bumps), `:265-279` (NOSUPERUSER owner).

**5. Wrong owner / half-owned rows**
- 🟢 Half-owned impossible: one transaction, existence check + five updates under the same locks, idempotent `where user_id is null`; rows + no owner leaves four versions and no column (`:198-213`). Empty DB + owner is a no-op (`:215-234`); rows in any one table (incl. only `ai_settings`) require the owner.
- 🟡 **A valid but wrong UUID is accepted silently** (`compose.yml:76`, `migrator.js:99-106`); the M-18 `user_id is null = 0` audit would still pass. Recommendation (M-18): copy the `sub` from the Identity login/userinfo response for Ming's account; after deploy check `select distinct user_id from <t>` returns exactly that value on all five tables.
- 🟡 **For T-019.2 (A8):** the contract straggler backfill uses that release's `TUDO_OWNER_SUB`; a different value splits ownership. Recommendation: before NOT NULL, raise (constant message) when `count(distinct user_id) where user_id is not null` > 1 or ≠ the GUC. Keep printing only `err.message` (after NOT NULL/checks, `detail` contains full rows incl. the owner).

**6. `TUDO_OWNER_SUB` reaches only migrate: 🟢** — `compose.yml:75-76` on `migrate` only; app `environment:` (`:43-46`) doesn't include it; `x-app` anchor (`:35-37`) only `image`/`env_file`; `environment:` overrides `env_file` (a stray value in `tudocuatui.env` would reach the app — header `:26-28` says compose, not env file). `migrate` on `db` network only, `cap_drop: [ALL]`, `no-new-privileges`. Empty default fails closed; deploy stops before app replacement (A4).

**7. Old image during rollout: 🟢** — nullable, no default/FK/check (old inserts work, `migrator.db.test.ts:255-263`); view appends `user_id` last (`.sql:70`); old image `select *` (`server/items.js:35,101`) but `toItemRow` (`:7-31`) maps explicitly; `ai/store.js` explicit `COLUMNS`; `user_id` never in API responses. Writes block for the transaction; `lock_timeout 10s`. Rollback to the old image stays safe.

**8. R2: 🟢** — new file only; `end $$;` rule kept; no RLS per D32 (same as current baseline behind Access); README `:11-18` correct. Umbrella risk: multi-user sign-up (T-019.7) must not reach production before T-019.4 RLS.

### Recommendations
1. (🟡, AC2/D37) M-18: take the `sub` from the Identity response; after deploy, `distinct user_id` equals it on all five tables.
2. (🟡, T-019.2, A8) Straggler backfill asserts a single owner equal to the GUC, constant message; never print PG `detail`.
3. (🟢) Optional comment near `migrator.js:206`: only `message` is printed on purpose.

### Risks
- Wrong but well-formed owner undetected without recommendation 1.
- No-RLS window until T-019.4, acceptable only while Access keeps the app single-user.

### Open questions
- Is the deployment repo private? The `sub` (non-secret account id) will be committed in `compose.yml`.

### Resolution (orchestrator, 2026-11-14)
- Rec 1 applied to M-18 in `work/ming-todo.md`; rec 2 appended to `work/tickets/T-019.2/ticket.md`; rec 3 and the release-order risk listed as PR follow-ups.
