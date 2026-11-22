# Database Optimizer Consult — F-706.3: Owner-only shared AI key storage, replacement and test

## Findings
1. **Existing Tables**:
   - `ai_settings` (T-019.3) stores BYOK keys scoped per user (`user_id` primary key) with standard `owner_only` RLS (`app.user_id = user_id`).
   - `ai_spend_ops` (F-706.2) introduced app-wide operations without user data using maintenance session variable `current_setting('tudo.maintenance', true) = 'ai-spend'`.
2. **Requirements for Shared AI Keys**:
   - One key per provider (D52, OQ-10): Claude, Gemini, OpenAI.
   - App-wide row (not per-user): `owner_only` policy based on `app.user_id` cannot be used directly because the database NOSUPERUSER owner role executes under FORCE RLS and `app.user_id` is per-caller.
   - Must follow D32 RLS: `ENABLE` + `FORCE` in the same migration file.
   - Non-owners must NEVER be able to query or modify this table.
3. **Guardrails**:
   - `server/migrator.js` guards `RLS_TABLES` to ensure RLS is never dropped or unforced.
   - `server/rls.db.test.ts`, `server/schema.db.test.ts`, and `server/migrator.db.test.ts` verify catalog constraints.

## Recommendations
1. **Table Schema (`ai_app_keys`)**:
   ```sql
   create table ai_app_keys (
     provider text primary key check (provider in ('claude', 'gemini', 'openai')),
     key_ciphertext text not null,
     key_hint text not null check (length(key_hint) between 1 and 32),
     updated_at timestamptz not null default now()
   );
   ```
   - Primary key on `provider` enforces at most one row per provider.
   - Check constraint restricts providers to allowlisted providers.
   - No user identifiers or foreign keys.
2. **Row Level Security (D32)**:
   ```sql
   alter table ai_app_keys enable row level security;
   alter table ai_app_keys force row level security;

   create policy ai_app_keys_select on ai_app_keys for select
     using (current_setting('tudo.maintenance', true) = 'app-keys');

   create policy ai_app_keys_insert on ai_app_keys for insert
     with check (current_setting('tudo.maintenance', true) = 'app-keys');

   create policy ai_app_keys_update on ai_app_keys for update
     using (current_setting('tudo.maintenance', true) = 'app-keys')
     with check (current_setting('tudo.maintenance', true) = 'app-keys');

   create policy ai_app_keys_delete on ai_app_keys for delete
     using (current_setting('tudo.maintenance', true) = 'app-keys');
   ```
3. **Database Client Helper**:
   - In `server/db.js`, add `withAppKeys(pool, fn, { readOnly = false })`:
     Executes inside a transaction with:
     `select set_config('tudo.maintenance', 'app-keys', true), set_config('app.user_id', '', true)`
   - This provides complete isolation:
     - Inside `withUser`, `tudo.maintenance` is set to `''`, so `ai_app_keys` yields 0 rows on SELECT and 42501 on INSERT/UPDATE/DELETE.
     - Inside `withAppKeys`, `app.user_id` is set to `''`, so user tables cannot be accessed.
4. **Migration Versioning**:
   - Migration file: `db/migrations/20261122160000_ai_app_keys.sql`.
   - Update `server/migrator.js`: add `ai_app_keys: APP_KEYS_VERSION` in `RLS_TABLES`.

## Risks
- If a query to `ai_app_keys` is executed outside `withAppKeys`, RLS will reject or return 0 rows. All app-key store methods must run through `withAppKeys`.
- Migration unlinking in `server/migrator.db.test.ts`: test cases that copy `realDir` and test unlinking earlier migrations must also account for `ai_app_keys.sql`.

## Open Questions
- None.
