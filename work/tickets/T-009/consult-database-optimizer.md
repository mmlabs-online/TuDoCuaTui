# Consult — database-optimizer — T-009 (2026-11-10)

Files read: T-009 ticket, `supabase/migrations/20261106000000_init.sql` (grants, RLS and updated_at style), `20261107120000_rls_hardening.sql` (`tudo_private` pattern), `supabase/tests/grants.sql`. I did not read the D17 text in full (the grep output was truncated) or `rls_tables.sql`. I did not read any `.env` file. Nothing here was run against a database.

## Findings
1. Existing conventions to follow:
   - Every object is `tudo_`-prefixed.
   - RLS is enabled in the same migration.
   - Grants are explicit, because stoktok revokes default privileges in `public` for anon and authenticated.
   - `tudo_private` exists and is not exposed by PostgREST.
   - `grants.sql` N1 and N3 fail on any non-`tudo_` relation or function in `public` or `tudo_private`.
   - Note that N3 and N6 are local-DB only.
2. Vault is a shared, unnamespaced store.
   - `vault.secrets` has one global `name` unique index, and `vault.decrypted_secrets` is a view that returns plaintext.
   - On Supabase these are readable only by `postgres` / `service_role`-level roles, and not by anon or authenticated by default.
   - Anyone with SQL Editor access, any stoktok migration or function running as a privileged role, and any `security definer` function that touches `vault` can read every app's secrets.
   - Isolation between apps is therefore by convention only.
   - The encryption key is managed by Supabase (pgsodium root key), not by us. A DB dump alone cannot decrypt the secrets, but a privileged SQL session can.
3. Vault availability on the shared project is unverified. Check first with `select extname from pg_extension where extname in ('supabase_vault','pgsodium');` and `select has_schema_privilege('service_role','vault','usage')`.
   - Newer Supabase has moved Vault away from pgsodium (the key handling is no longer exposed to users). The `vault.create_secret` / `vault.update_secret` API stays the same.
   - Do not call pgsodium directly. It is deprecated and has no stable user-facing API.
4. Vault does not fit the "who can call what" model well.
   - Edge Functions reach Vault only through PostgREST RPC, which exposes only the exposed schemas (`public`, `graphql_public`).
   - So you would need a `security definer` wrapper in `public` or another exposed schema. That wrapper is the risk surface.
   - A `tudo_private` wrapper cannot be called from supabase-js, because `tudo_private` is not exposed.
   - Alternative: the Edge Function connects with a direct Postgres connection (`SUPABASE_DB_URL`) and uses `postgres.js`. This avoids exposing any function. The cost is a pool and a direct-connection dependency.

## Recommendations
**A. Pick one storage option.**
1. **Recommended: app-level encryption (AES-256-GCM).**
   - The master key lives only in an Edge Function secret (`TUDO_AI_KEK`), which satisfies R3.
   - The ciphertext lives in a `tudo_private` table (see C).
   - Use a random 12-byte IV per write. Use AAD = `user_id || provider || key_version` so a ciphertext cannot be moved between rows or users.
   - Store `key_version` so the KEK can be rotated (re-encrypt on next save, or via a one-off script).
   - This keeps TuDo self-contained, with no dependence on Vault or on another app's operators. Even a SQL Editor user (stoktok operators) sees only ciphertext. The migration needs no Vault at all.
   - Cost: KEK management and loss. If the KEK is lost, users re-enter their keys. State this explicitly in the plan. Ming sets the secret (a Ming step, per D17).
2. **Fallback: Vault.**
   - Use only if Ming prefers it.
   - Name each secret `tudo_ai_key:<user_id>` and store the returned secret id in the row.
   - Access only via a direct DB connection from the function, or a narrowly scoped security definer RPC.
   - Document in the plan that Vault is shared and that any privileged stoktok session can read the decrypted key.
3. Do not use raw pgsodium.

**B. Table design (one row per user).**
```
public.tudo_ai_settings          -- client-readable, NO key material
  user_id     uuid primary key references auth.users(id) on delete cascade
  provider    text not null check (provider in ('claude','gemini'))
  model       text not null check (length(model) between 1 and 100)
  key_hint    text check (key_hint ~ '^[A-Za-z0-9_-]{4}$')   -- last 4 only; null = no key
  updated_at  timestamptz not null default now()               -- reuse tudo_set_updated_at trigger
```
- The primary key doubles as the owner index, so there is no extra FK index to add.
- Do not put a provider/model CHECK against a closed list in SQL. The allowlist lives in one place (the Edge Function constants, per the ticket), and models change often. Keep the loose length and charset CHECKs only.
- Rule R5 does not apply, because nothing stored is derived.

**C. Split the key from the readable row. This is the key design point.**
1. Table-level GRANT only gives table or column-level access, not "row without one column" unless you use column grants. Prefer a separate table over relying on column grants:
```
tudo_private.tudo_ai_keys
  user_id     uuid primary key references auth.users(id) on delete cascade
  ciphertext  bytea not null
  iv          bytea not null
  key_version smallint not null default 1
  updated_at  timestamptz not null default now()
```
2. For this table:
   - `enable row level security` with NO policies. Default-deny covers authenticated even if a grant is added later by mistake.
   - `revoke all ... from public, anon, authenticated`.
   - `grant select, insert, update, delete ... to service_role` only.
   - Keep `tudo_private` unexposed.
   - This table lives in `tudo_private`, so it passes N3 (it only checks functions). N1 checks `public` relations only.
3. For `public.tudo_ai_settings`:
   - `revoke all ... from public, anon, authenticated`.
   - `grant select on ... to authenticated`.
   - Also `grant select, insert, update, delete on ... to service_role`. The explicit grant is needed because of the default-privilege revoke on this project.
   - Policy: `create policy "tudo_ai_settings: owner read" ... for select to authenticated using (user_id = (select auth.uid()))`.
   - Give the browser SELECT only. No INSERT, UPDATE or DELETE for authenticated, because writes go through the Edge Function. This prevents a client from forging `key_hint` or setting a model the allowlist would reject. If you ever grant client writes, they would bypass the server-side allowlist. Server-only writes are the point of the design.
   - Alternative: grant authenticated INSERT or UPDATE on `(provider, model)` columns only. This is weaker, and I do not recommend it.
4. Do not store the hint in the keys table. The client must read it, and it is not secret.
5. Add the `tudo_set_updated_at` trigger to both tables. It is already revoked from callers, so it stays safe.

**D. Edge Function behaviour (`tudo-ai-settings`).**
1. Authenticate: take the user JWT from the `Authorization` header. Verify it with `supabase.auth.getClaims()` or `getUser()`. Derive `user_id` from the token only. Never accept a `user_id` in the body.
2. Use a service-role client only for the two tables, with filters of `user_id = <verified id>`. The service role bypasses RLS, so a missing filter becomes a cross-user bug. Wrap the access in a small module with `getKey(userId)` and `putKey(userId,...)` so no call site writes its own query.
3. Save: validate provider and model against the allowlist and the key against a length and charset check. Encrypt. Upsert the keys row and the settings row. Do the pair of writes in one transaction if using a direct DB connection. Otherwise write the key first and the hint last, and make "settings row with null hint" the harmless failure state.
4. Responses: return only provider, model, and `key_hint`, formatted as `••••` + last 4. Never echo input, never put the key in logs or error bodies. Do not log request bodies. Errors map to fixed codes (`invalid_provider`, `invalid_model`, `invalid_key`, `provider_rejected`). Never forward the provider's raw error text, because it can include a key fragment.
5. Decrypt only inside the AI Edge Function (T-010 / F-701), in memory, and for the duration of the call. Never return it.
6. Test-key call: pick the cheapest model call. Rate-limit per user (a small counter table in `tudo_private`, or a `last_tested_at` column). This stops the function from becoming a proxy for key brute-forcing or for burning the user's quota.
7. CORS: restrict to the TuDo origin, not `*`. The shared project's functions are on a shared host.

**E. Deletion.**
- "Delete key": remove the `tudo_private.tudo_ai_keys` row and set `key_hint = null` on the settings row. Keep provider and model. For Vault, also call `vault.delete_secret`.
- Account deletion is covered by `on delete cascade` on both tables. For Vault, cascade does NOT reach `vault.secrets`, which would leave orphaned secrets. This is another reason to prefer app-level encryption.
- Hard-delete only. No soft-delete column or backups of the ciphertext in app code.

**F. Migration shape.**
- One new file with a timestamp after `20261107120000`. Never edit applied ones (R2).
- Create both tables, RLS, policies, the explicit grants above, and the trigger. Include a manual rollback block in the comments, like the previous migration. Drop order: policies and tables, then nothing else (no new helper functions needed).
- Regenerate `src/types/database.ts`. The `tudo_private` table is not in the generated types for the client (correct).
- Applied by Ming in the SQL Editor, as before. Edge Function deploy and the `TUDO_AI_KEK` secret are Ming steps (add them to `work/ming-todo.md`).
- Generate the KEK as `openssl rand -base64 32`. Back it up in Ming's password manager.

**G. Tests to add.**
SQL (pgTAP, in the style of `rls_tables.sql`, plus additions to `grants.sql`):
1. Owner can SELECT their own `tudo_ai_settings` row. Another user sees 0 rows.
2. Another user cannot UPDATE or DELETE it (0 rows affected).
3. Authenticated cannot INSERT, UPDATE or DELETE their own settings row (privilege error 42501). This is the server-only-writes check.
4. Anon: no privileges on either table (`table_privs_are(... 'anon', array[]::text[])`).
5. Authenticated: `table_privs_are('public','tudo_ai_settings','authenticated', array['SELECT'])`.
6. Authenticated cannot `select` from `tudo_private.tudo_ai_keys`. Check `has_table_privilege` is false, and the query raises 42501. Check the same for `anon`.
7. `has_table_privilege('authenticated', 'tudo_private.tudo_ai_keys', 'select,insert,update,delete')` is false for every privilege.
8. `service_role` has the needed privileges on both tables.
9. `key_hint` CHECK: rejects a 5-character value and a value containing `•`. `provider` CHECK rejects `'openai'`.
10. Deleting an `auth.users` row cascades to both tables.
11. `updated_at` bumps on update (seed an old timestamp, as in U1).
12. Update `grants.sql` plan counts. N1 and N3 still hold if the new objects are `tudo_`-prefixed.
13. Both scripts must run with and without stoktok's default-privilege revoke (`scripts/test-db-shared.sh`).

Unit (TypeScript, T-009 scope):
- Allowlist validation: unknown provider, unknown model, a model that belongs to the other provider.
- Key format checks, masking (`••••` + last 4, and short or empty input).
- AES-GCM round trip. Tamper test (modified ciphertext, wrong AAD, wrong user) must fail. Different IV per call.
- Error mapping returns no input text.
- A static check that the function module never imports `console.log` of the body is optional.

## Risks
1. KEK in Edge Function secrets: whoever can read project secrets or deploy a function on the shared project can read it. That is the same trust boundary as Vault, and it is limited to stoktok operators (Ming).
2. Service-role code paths bypass RLS, so a missing `user_id` filter becomes a data leak. Mitigate with the single-module accessor and a function-level test.
3. Shared project: a stoktok migration with a broad `grant ... on all tables in schema tudo_private` is unlikely, but possible. Add the test in G6 to the shared-project run, not only local.
4. Key loss or rotation: without `key_version` there is no migration path. Include it from the start.
5. Test-key and AI calls spend the user's own quota. Rate limiting is required (D4) to avoid accidental abuse. It is not strictly in the acceptance criteria, but "rate limiting" is named as a risk in the ticket.
6. Logging: Supabase function logs record request metadata. Never use `console.log` on bodies or provider errors.
7. Provider model lists change. Do not hard-code guessed ids. The ticket already requires verifying them at implementation time.
8. Because T-009 is High tier, the plan needs Ming's approval and the security auditor reviews the diff.

## Open questions
1. Does Ming accept app-level encryption with a KEK in an Edge Function secret (recommended), or does he want Vault? If Vault, confirm the extension is enabled on the shared project and who else has privileged access.
2. Who can use SQL Editor or privileged roles on the shared stoktok project besides Ming? This decides whether Vault's shared-plaintext risk matters.
3. Direct writes by the browser: confirm settings (provider and model) are written only through the Edge Function. This design assumes yes.
4. Should "test key" count toward a rate limit, and what should the limit be (for example 5 per minute per user)?
5. Is one key per user enough (one provider active at a time), or should a user store both a Claude key and a Gemini key and switch between them? The ticket's "one row per user" implies one. Switching provider would then require re-entering the key.
6. Where should the allowlist live so both the Edge Function and the client UI (T-010) can use it without drift? A shared TypeScript file imported by both is simplest, but Deno and Vite bundling need checking at plan time.
