Status: READY

# Plan — T-009: Store per-user AI provider settings and an encrypted API key

> **Gate: plan-approval (High tier: migration, RLS, Edge Function, secrets).** Ming approves this plan by writing
> "Plan approved" under *Notes / answers from Ming* in `ticket.md`. Approving also confirms the defaults in
> **Assumptions A1–A14** and the **Changes vs ticket C1–C9**. To change a default, write e.g. "A3: verify_jwt = true".
> When the plan is approved, the orchestrator records **D22** in `work/decisions.md`, covering A1 (KEK storage) and
> A2 (D17 amendment for the CLI function deploy).

## Feature summary
`work/decisions.md` D21 (2026-11-10):
> AI supports **Claude and Gemini**. Each user picks provider, model and enters their own API key in Settings; the key is
> stored **encrypted server-side** (e.g. Supabase Vault), never returned to the browser (masked hint only), and used
> only by Edge Functions. AI is available in **Supabase mode only**; local mode / Figma Make preview unchanged. Replaces
> F-701's "key only in Supabase secrets". Work is split into T-009 → T-010 → F-701 → F-702, pulled ahead of M3.

`docs/feature-list.md` E7, F-701 (the parts that D21 changes are in **bold**):
> Calls a vision LLM server-side; **the API key lives only in Supabase secrets**; strict JSON validation (zod).
> Per-user rate limit (e.g. 100 calls/day) and a size limit on the image.

Ticket scope (T-009):
> - New migration (R2): a `tudo_` settings table (provider, model, key reference / last-4 hint, updated_at) with RLS
>   (owner only) and the key stored encrypted (e.g. Supabase Vault) — never selectable by the client.
> - An Edge Function (e.g. `tudo-ai-settings`) that, for the signed-in user: saves provider + model + key, deletes
>   the key, returns settings with only a masked key (`••••1234`), and can run a cheap "test key" call.
> - Allowed provider/model ids validated server-side (an allowlist in one place); model lists verified against the
>   providers' current docs at implementation time, not guessed.
> - `WardrobeRepo`-style client wrapper (R1) for the UI to call; local mode returns "not available".

Out of scope (ticket): the Settings UI (T-010), photo tagging (F-701), the editor button (F-702).

## Changes vs ticket (Ming confirms at approval)
| # | Ticket says | Plan does | Why |
|---|---|---|---|
| C1 | "e.g. Supabase Vault" | **AES-256-GCM inside the Edge Function** (WebCrypto). The key-encryption key (KEK) is the Edge Function secret `TUDO_AI_KEK`. Vault is not used. | Both consults recommend this. On the shared project, Vault is one unnamespaced store whose `decrypted_secrets` view any privileged stoktok session can read. Vault would also need `SECURITY DEFINER` wrappers or a direct DB connection, and `on delete cascade` does not reach `vault.secrets`. With AES-GCM, a DB dump or SQL Editor access shows only ciphertext. |
| C2 | "RLS (owner only)" | RLS is **enabled with no policies** (deny-all), and `anon` / `authenticated` get **zero privileges**. Only `service_role`, which the Edge Function uses, can access the table. | This is stricter than owner-only. The browser reads and writes only through the function, so "never selectable" is a structural fact. If a grant is ever added by mistake, the missing policy still hides every row. AC2 still holds: no user can read or change anyone's row, including another user's, and anon has nothing. |
| C3 | "key reference / last-4 hint" | The row holds the ciphertext itself (`key_ciphertext`, format `v1:` + base64) and `key_hint` (last 4 characters). | There is no Vault, so there is no reference to store (C1). |
| C4 | — | Adds a second table, **`public.tudo_ai_calls`**, for per-user rate limiting: `test` 20/hour, `save` 30/hour. | The ticket lists rate limiting as a risk, and the `test` action calls the provider. F-701 reuses the same table (kind `tag`, 100/day) without another High-tier migration. |
| C5 | "RLS tests, as F-006" | AC2 is verified by a new pgTAP file. Because authenticated has no privileges, the checks are privilege errors (42501) and `table_privs_are`, not 0-row RLS results. | Follows from C2. |
| C6 | — | Adds an error code, `key_unreadable` (409), which is returned when the stored ciphertext cannot be decrypted (KEK lost or changed). | Without it, a lost KEK would show as a generic `internal` error. T-010 needs to be able to say "enter your key again". |
| C7 | — | `supabase/config.toml` gets `[functions.tudo-ai-settings] verify_jwt = false`. The function always verifies the caller in code. | See A3. |
| C8 | — | The allowlist lives in `src/shared/ai/`, with a byte-identical mirror in `supabase/functions/_shared/ai/`. A Vitest test asserts the two are equal. | The ticket asks for "one place". See *Approach → Allowlist sharing*. |
| C9 | — | `tsconfig.json` and `vitest.config.ts` (coverage) are extended to cover the pure server modules. | R8: new pure logic must be unit-tested and typechecked. |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A user can save, replace and delete their key; the browser can never read it back (only a masked hint). | `settingsHandler.test.ts` › "save stores ciphertext + hint, returns ••••last4", "save with new key replaces ciphertext", "deleteKey nulls ciphertext and hint, keeps provider/model", "no response body ever contains the apiKey or the ciphertext". `aiSettings.test.ts` › "save returns the view; apiKey not echoed". pgTAP `rls_ai_settings.sql`: authenticated gets 42501 on `select` from `tudo_ai_settings`. |
| 2 | RLS: a user cannot read or change another user's settings; anon has no access (RLS tests, as F-006). | `supabase/tests/rls_ai_settings.sql`: user A and anon get 42501 on select/insert/update/delete of their own and B's rows on both tables; `table_privs_are(... 'anon'/'authenticated', '{}')`; RLS is enabled; there are no policies; `service_role` has DML. `store.test.ts` › "every query is filtered by the verified user id". `settingsHandler.test.ts` › "user id comes only from auth; body user_id → bad_request". Run with `npx supabase test db` and `bash scripts/test-db-shared.sh` (needs Docker; if the implementer has no Docker, Ming runs it, see below). |
| 3 | Only allowlisted provider/model ids are accepted. | `validate.test.ts` › unknown provider, unknown model, a model of the other provider, case and whitespace variants, and a valid pair. `settingsHandler.test.ts` › "save rejects invalid_provider / invalid_model before any store write". pgTAP: `provider = 'openai'` is rejected by the CHECK. |
| 4 | No key or secret in client code, `VITE_*`, logs or error messages (R3). | `boundary.test.ts` (no `TUDO_AI_KEK`, `service_role`, `tudo_ai_settings`, `tudo_ai_calls` in non-test `src/**`, apart from the generated `src/types/database.ts`; no new `VITE_*` names). `settingsHandler.test.ts` › "logger never receives the apiKey, the ciphertext or provider error text" (spy) and "error bodies are `{error:{code}}` only". `providerErrors.test.ts` › the mapping uses status codes and structured reasons only. The reviewer greps the diff for `console.` (allowed only in `tudo-ai-settings/index.ts` logger wiring). The security auditor runs at REVIEW. |
| 5 | Unit tests for validation; checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test:coverage` (thresholds include the new files), `pnpm build`. |

## Ming verification after merge
These need Docker, the hosted project or provider keys. Ming's runbook is **M-10**; the implementer adds it to `work/ming-todo.md`.
1. If the implementer had no Docker, run the DB tests locally: `npx supabase db reset && npx supabase test db`, then `bash scripts/test-db-shared.sh`. All files must pass.
2. Deploy runbook: see *Approach → Deploy runbook (M-10)*.
3. Post-apply read-only checks (in M-10): `tudo_ai_settings` and `tudo_ai_calls` have no `anon` or `authenticated` grants, and `relrowsecurity` is true on both.
4. Smoke test with real keys. The full UI smoke test happens in T-010; until then, use the `curl` steps in M-10: get → save (Claude key) → test → get (masked) → deleteKey, and the same for Gemini. A call with no or a wrong `Authorization` header must return 401. An `Origin` that is not on the list must get no CORS headers.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/migrations/20261110000000_tudo_ai_settings.sql` | **Create.** Tables `tudo_ai_settings` and `tudo_ai_calls`, RLS on with no policies, revoke/grant, trigger, index, rollback comment. | Scope: migration (R2) |
| `supabase/tests/rls_ai_settings.sql` | **Create.** pgTAP for privileges, RLS, constraints, cascade and `updated_at`. | AC2 |
| `supabase/config.toml` | **Modify.** Add the `[functions.tudo-ai-settings]` block with `verify_jwt = false`. | C7 / A3 |
| `supabase/functions/tudo-ai-settings/index.ts` | **Create.** Thin Deno shell: reads env, builds the real deps (service-role client, Claude adapter, fetch, logger) and calls `handleSettingsRequest`. | Scope: Edge Function |
| `supabase/functions/tudo-ai-settings/deno.json` | **Create.** Import map with exact pins: `npm:@supabase/supabase-js@<exact>`, `npm:@anthropic-ai/sdk@<exact>`. | Deno deps |
| `supabase/functions/_shared/ai/{catalog,errors,validate,mask}.ts` | **Create.** Byte-identical mirror of `src/shared/ai/*.ts`. | C8 |
| `supabase/functions/_shared/core/http.ts` | **Create.** CORS from the allowed-origins list, `json()`, error envelope, body-size cap. Pure. | Scope |
| `supabase/functions/_shared/core/crypto.ts` | **Create.** `importKek`, `sealKey`, `openKey` (AES-256-GCM, WebCrypto). Pure. | C1 |
| `supabase/functions/_shared/core/store.ts` | **Create.** `createAiStore(client)` takes a structural client type and has `getView`, `getSecret`, `upsert`, `clearKey`; every query uses `.eq("user_id", uid)`. Pure. | Single accessor (DB consult D2) |
| `supabase/functions/_shared/core/rateLimit.ts` | **Create.** `checkAndRecord(store, uid, kind, now)` with the limits table. Pure. | C4 |
| `supabase/functions/_shared/core/providerErrors.ts` | **Create.** HTTP status / structured reason → `AiErrorCode`. Pure. | AC4 |
| `supabase/functions/_shared/core/gemini.ts` | **Create.** `testGeminiKey(fetch, key, model)`, a GET on the model resource with the key in a header. Pure: `fetch` is injected. | Scope: test key |
| `supabase/functions/_shared/core/settingsHandler.ts` | **Create.** `handleSettingsRequest(req, deps)`, holding all the action logic. Pure. | Scope |
| `supabase/functions/_shared/core/*.test.ts` | **Create.** `crypto`, `store`, `rateLimit`, `providerErrors`, `gemini`, `settingsHandler`, `http`. | AC1–AC5, R8 |
| `supabase/functions/_shared/deno/claude.ts` | **Create.** `testClaudeKey(key, model)` using the official Anthropic SDK (`models.retrieve`). Deno-only. | Scope: test key |
| `supabase/functions/.env.example` | **Create.** Names only: `TUDO_AI_KEK=`, `TUDO_ALLOWED_ORIGINS=`. | Conventions (secrets list names only) |
| `supabase/.gitignore` | **Modify.** Add `functions/.env` (local `functions serve` secrets). | R3 |
| `src/shared/ai/catalog.ts` | **Create.** `AI_PROVIDERS`, `AI_MODELS` (id, label, default flag), types. | AC3, single allowlist |
| `src/shared/ai/errors.ts` | **Create.** `AI_ERROR_CODES` union and the code → HTTP status map. | AC4, R-6 |
| `src/shared/ai/validate.ts` | **Create.** `isAllowedProvider`, `isAllowedModel`, `validateApiKeyFormat`, `parseRequest`. | AC3 |
| `src/shared/ai/mask.ts` | **Create.** `keyHintOf(key)`, `maskHint(hint)`. | AC1 |
| `src/shared/ai/{catalog,validate,mask,errors}.test.ts` | **Create.** Unit tests. | AC3, AC5 |
| `src/shared/ai/mirror.test.ts` | **Create.** Asserts that the mirror directory is byte-identical (same file set, same bytes). | C8 |
| `src/shared/ai/boundary.test.ts` | **Create.** Static scan of `src/**` for server-only names. | AC4 |
| `src/data/aiSettings.ts` | **Create.** `AiSettingsRepo`, `AiError`, `createSupabaseAiSettings`, `createLocalAiSettings`, `getAiSettingsRepo`. | Scope: client wrapper (R1) |
| `src/data/aiSettings.test.ts` | **Create.** Uses a fake `functions.invoke`. | R8 |
| `src/types/database.ts` | **Regenerate** with `pnpm db:types`. See A13 if there is no Docker. | R2 |
| `tsconfig.json` | **Modify.** Add `supabase/functions/_shared/ai` and `supabase/functions/_shared/core` to `include`. | C9 |
| `vitest.config.ts` | **Modify.** Add `src/shared/ai/**` and `supabase/functions/_shared/core/**` to coverage `include` and `thresholds`, with the same 80/80/80/75. | C9, R8 |
| `work/ming-todo.md` | **Modify.** Add **M-10** (deploy runbook below). Do not add it to `Needs Ming` (D12). | Ming steps (D17, D12) |
| `work/tickets/T-009/impl-log.md` | **Create.** Must cite the URLs for the Gemini model ids, the Gemini endpoint and error shape, the Anthropic SDK version, and the Edge Function env-var names. | Ticket: "verified against docs" |

Files that must **not** be touched: `.dockerignore`, `Dockerfile`, `.github/workflows/*`, `package.json` (no new dependencies: the Deno deps are in `deno.json`, and Vitest needs no new packages), `src/lib/supabase.ts`, `docs/feature-list.md`, `work/decisions.md`, `work/backlog.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/shared/ai/catalog.test.ts` › providers are exactly `claude`,`gemini`; each provider has ≥1 model and exactly one default; ids are unique and match `^[a-z0-9][a-z0-9._-]{0,99}$`; Claude ids are exactly `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, with Haiku as the default | AC3, keeps the DB CHECK compatible |
| `src/shared/ai/validate.test.ts` › unknown provider; unknown model; model of the other provider; `"Claude"` / `" claude"` rejected; valid pair accepted; key: trimmed, under 20 / over 256 characters rejected, inner whitespace or non-ASCII rejected, valid key accepted; `parseRequest`: each action's exact field set, unknown field (incl. `user_id`) → `bad_request`, non-object / array / missing action → `bad_request`, `apiKey` optional on save | AC3 |
| `src/shared/ai/mask.test.ts` › `keyHintOf` = last 4 of the trimmed key; `maskHint("abcd")` = `"••••abcd"`; `maskHint(null)` = `null` | AC1 |
| `src/shared/ai/errors.test.ts` › every server code has an HTTP status; the client-only codes (`not_available`, `network`) have none | AC4 |
| `src/shared/ai/mirror.test.ts` › the mirror has the same non-test `.ts` file set and identical bytes; the failure message gives the `cp` command | C8 |
| `src/shared/ai/boundary.test.ts` › no non-test file in `src/` (except `src/types/database.ts`) contains `TUDO_AI_KEK`, `service_role`, `SERVICE_ROLE`, `tudo_ai_settings`, `tudo_ai_calls`; `.env.example` gains no AI variable | AC4 |
| `_shared/core/crypto.test.ts` (`// @vitest-environment node`) › round trip; same plaintext twice → different output (fresh IV); output starts with `v1:`; wrong user id fails; wrong provider fails; a flipped byte fails; a different KEK fails; an unknown version prefix fails; a KEK that is not 32 bytes → throws `server_misconfigured` | C1 |
| `_shared/core/store.test.ts` › every method calls `.eq("user_id", uid)` with the given uid; `getView` never selects `key_ciphertext`; `upsert` uses `onConflict: "user_id"`; `clearKey` sets ciphertext, hint and `key_updated_at` to null | AC1, AC2 |
| `_shared/core/rateLimit.test.ts` › under the limit → allowed and recorded; at the limit → `rate_limited`, not recorded; the window boundary; per-kind independence; prune deletes only this user's rows older than 2 days; a store error → throws (fail closed) | C4 |
| `_shared/core/providerErrors.test.ts` › Claude 401→`invalid_key`, 403→`key_forbidden`, 404→`model_unavailable`, 429→`provider_rate_limited`, 5xx/timeout/network→`provider_unavailable`; Gemini: invalid-key reason→`invalid_key` (shape verified from the docs), 403, 404, 429, 5xx as above; unknown→`provider_unavailable` | AC4 |
| `_shared/core/gemini.test.ts` › the key is sent in the `x-goog-api-key` header and never appears in the URL; 200 → ok; error statuses are mapped; fetch throws → `provider_unavailable`; aborts after the timeout | Scope: test key, AC4 |
| `_shared/core/http.test.ts` › allowed origin is echoed in `Access-Control-Allow-Origin`; a foreign origin gets no CORS headers; OPTIONS preflight; body over 4 KB → `payload_too_large`; error body is exactly `{error:{code}}` | Scope |
| `_shared/core/settingsHandler.test.ts` › non-POST → 405; missing KEK/origins → 503 `server_misconfigured`; missing or invalid token → 401 (the auth dep is called with the bearer token only); body `user_id` → 400; **get**: no row → `{settings:null}`, row → masked view with `modelSupported`; **save**: invalid provider/model/key format → 400 with no store write; first save with key → ciphertext sealed with AAD (uid, provider), hint = last 4; save without key keeps the existing ciphertext; provider change without key → `key_required`; save without key and no row → allowed (`hasKey:false`); **deleteKey**: clears the key, keeps provider/model, idempotent; **test**: no row/key → `not_configured`; undecryptable → `key_unreadable`; model no longer in the catalog → `invalid_model`; provider ok → `{ok:true}`; provider error → the mapped code; rate limit hit → 429 before any provider call; **leak checks**: across all paths, no response body and no logger call contains the apiKey, the ciphertext or a provider error message (spy) | AC1–AC4 |
| `src/data/aiSettings.test.ts` › local repo: `available === false` and every method rejects with `AiError("not_available")`; Supabase repo: invokes `"tudo-ai-settings"` with the right body per action; `FunctionsHttpError` with `{error:{code}}` → `AiError(code)`; an unknown code → `internal`; fetch/relay error → `network`; `apiKey` never appears in the resolved value; `getAiSettingsRepo` picks local when `supabase` is null | R1, AC1 |
| `supabase/tests/rls_ai_settings.sql` (pgTAP) › `table_privs_are` empty for anon and authenticated on both tables; `service_role` has SELECT/INSERT/UPDATE/DELETE on both; `relrowsecurity` true on both; `policies_are(..., '{}')` on both; as authenticated A: select/insert/update/delete on own row and B's row → `throws_ok 42501` (both tables); same as anon; as `service_role`: can read both seeded rows; CHECKs: provider `'openai'` → 23514, hint of 5 characters → 23514, ciphertext without hint → 23514, ciphertext not starting with `v<n>:` → 23514, model `'Bad Model'` → 23514; deleting the `auth.users` row cascades on both tables; `updated_at` bumps on update (seed `2000-01-01`) | AC2 |

## Approach

### Storage location: resolving the consult disagreement
**Decision: both tables go in `public`. `anon` and `authenticated` get zero privileges, RLS is on with no policies, and only `service_role` (the Edge Function) can access them.** This follows the architect's option, with deny-all RLS instead of an owner policy (C2). The DB consult's split (`tudo_private.tudo_ai_keys` plus a client-readable `public.tudo_ai_settings`) is rejected. The reasons come from the repo:
1. **Reachability.** `supabase/config.toml` has `[api] schemas = ["public", "graphql_public"]`. M-5 requires that `tudo_private` is *not* an exposed schema on the hosted project. F-002 keeps it out of the generated types on purpose. PostgREST rejects any schema that is not exposed, for every role including `service_role`, so supabase-js in the function could not reach `tudo_private.tudo_ai_keys`. Making it reachable would need one of three things, each worse than the problem it solves:
   - exposing `tudo_private`, which reverses T-004 and M-5;
   - a `SECURITY DEFINER` RPC in `public`, which is new High-risk SQL;
   - a direct Postgres connection (`SUPABASE_DB_URL` with postgres.js), which holds far more privilege than two tables need.
2. **Safety argument.** The architect wrote that `tudo_private` is unsafe because `authenticated` has `USAGE` on it (`grants.sql` G13). That is overstated: schema `USAGE` grants no table access, and the DB consult's design had RLS on with no grants anyway. The decisive reason is (1), not safety.
3. **Atomicity.** With one table, save is one `upsert` over REST: ciphertext, hint, provider and model change together. A CHECK ties `key_ciphertext` and `key_hint` to null together. The split design needs two writes without a transaction (the DB consult admits this).
4. **The client does not need SELECT.** Writes were already agreed to be server-only. `get` through the function also computes `modelSupported` against the allowlist, which a raw SELECT could not. Zero privileges makes "never selectable by the client" testable with `table_privs_are`, with no column-grant subtleties.
5. **Cost and mitigation.** The tables appear in the PostgREST schema cache and in the generated `src/types/database.ts`. Mitigations:
   - zero grants, so any request returns 42501;
   - a header comment in the migration;
   - `boundary.test.ts`, which fails if client code names the tables.

### Migration `20261110000000_tudo_ai_settings.sql`
Use the same style as `20261106000000_init.sql`: a header naming D17/D21/T-009, prefixed names, and a rollback block in comments. Use the timestamp shown; it must sort after `20261107120000`.
```sql
-- Header: service-role only. The generated database.ts row type does NOT mean the browser can read these tables.
create table public.tudo_ai_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('claude','gemini')),
  model          text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  key_ciphertext text check (key_ciphertext is null or key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9+/=]+$'),
  key_hint       text check (key_hint is null or key_hint ~ '^[!-~]{4}$'),
  key_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tudo_ai_settings_key_pair check ((key_ciphertext is null) = (key_hint is null))
);
create trigger tudo_ai_settings_updated_at before update on public.tudo_ai_settings
  for each row execute function public.tudo_set_updated_at();

create table public.tudo_ai_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind ~ '^[a-z_]{1,32}$'),
  created_at timestamptz not null default now()
);
create index tudo_ai_calls_user_kind_time_idx on public.tudo_ai_calls(user_id, kind, created_at desc);

alter table public.tudo_ai_settings enable row level security;   -- no policies: deny-all (C2)
alter table public.tudo_ai_calls    enable row level security;   -- no policies: deny-all
revoke all on public.tudo_ai_settings, public.tudo_ai_calls from public, anon, authenticated;
grant select, insert, update, delete on public.tudo_ai_settings, public.tudo_ai_calls to service_role;
```
- The `model` CHECK covers format only. The allowlist is not repeated in SQL, because model lists change. The `provider` list is in SQL, because adding a provider is a code change anyway.
- No new functions and no Vault or pgsodium. Every name is `tudo_`-prefixed, so `grants.sql` N1–N5 still pass unchanged.
- The `uuid` id avoids a sequence, so no sequence grant is needed.

### Encryption (C1)
- `TUDO_AI_KEK` is base64 of 32 random bytes. It is imported once per request as a non-extractable AES-GCM `CryptoKey`. If it is missing or not 32 bytes, the function returns `server_misconfigured` (503).
- Seal: a fresh 12-byte IV. The AAD is UTF-8 `tudo-ai-key|v1|<user_id>|<provider>`. The output is `v1:` + base64(IV ‖ ciphertext+tag).
- Open: anything other than `v1` fails, and any failure throws. The handler maps that to `key_unreadable`.
- The plaintext key exists only in memory during `save` (for sealing) and `test` (for the provider call). It is never returned, logged or stored elsewhere.
- Rotation is out of scope. The `v1` prefix leaves room for a later `TUDO_AI_KEK_PREV`.

### Edge Function `tudo-ai-settings`
1. **Contract.** POST with a JSON body. OPTIONS is the CORS preflight. Requests:
   - `{action:"get"}`
   - `{action:"save", provider, model, apiKey?}`
   - `{action:"deleteKey"}`
   - `{action:"test"}`

   Responses:
   - `get`, `save` and `deleteKey` return `{settings: {provider, model, keyHint: "••••abcd"|null, hasKey, modelSupported, updatedAt} | null}`.
   - `test` returns `{ok:true}`.
   - Every error is `{error:{code}}`, with the status from `errors.ts`.
2. **Order in `handleSettingsRequest`:**
   1. CORS/OPTIONS.
   2. Method check (405).
   3. Config check: KEK and origins present (503).
   4. Auth: bearer token → `deps.getUserId(token)`. In `index.ts` this is `admin.auth.getUser(token)`, which rejects anon-key tokens and deleted users. Failure → 401.
   5. Body: cap of 4 KB → 413; `parseRequest` → 400.
   6. Action.
3. **Save.**
   1. Rate limit `save` (30/h).
   2. Validate provider and model, and the key format if a key is present.
   3. Load the existing secret row.
   4. If the provider differs from the stored provider and there is no `apiKey` while a key is stored → `key_required`.
   5. With a key: seal it, set the hint, set `key_updated_at = now`.
   6. Without a key: keep the stored ciphertext and hint (the provider is unchanged, so the AAD still matches).
   7. One upsert.
4. **deleteKey.** `update … set key_ciphertext = null, key_hint = null, key_updated_at = null where user_id = uid`. Return the view, or `null` if there is no row. It is idempotent.
5. **Test.**
   1. Rate limit `test` (20/h).
   2. Load the secret row. No row or no key → `not_configured`.
   3. The stored model must still be allowlisted, otherwise `invalid_model`.
   4. Open the ciphertext (failure → `key_unreadable`).
   5. Call the provider adapter, which costs no tokens:
      - Claude: the official Anthropic SDK, `new Anthropic({apiKey, maxRetries: 0, timeout: 10_000}).models.retrieve(model)`.
      - Gemini: `GET` on the model resource of the Generative Language API, with the key in the `x-goog-api-key` header and never in the URL, and a 10 s abort. The implementer verifies the exact endpoint and error body shape in Google's docs and cites the URL.
   6. Map errors through `providerErrors.ts`, using the status and structured reason only.
   7. Test is **not** run automatically on save (A5). Its result is not stored.
6. **Logging.** Inject a `log({action, code, providerStatus?})`; the type allows no other fields. `index.ts` implements it as `console.log(JSON.stringify(e))`. Never log the request body, the headers, SDK error objects or `err.message`. Unexpected throws map to `internal`, and only the code is logged.
7. **CORS.** `TUDO_ALLOWED_ORIGINS` is a comma-separated list (A9). A request whose origin matches gets that origin echoed back, plus `Vary: Origin`. Allowed headers: `authorization, apikey, content-type, x-client-info`. Allowed methods: `POST, OPTIONS`. A foreign origin gets no CORS headers. CORS is not the security control; auth is.
8. **Service-role client.** `index.ts` builds it from the env vars the Edge runtime injects (`SUPABASE_URL` plus the service-role or secret key). The implementer checks the current names in the Supabase Edge Functions docs, including whether this project uses the new `sb_secret_` keys, and cites the URL. The client is used only through `createAiStore` and `rateLimit`.
9. **Layout boundary.**
   - `_shared/ai` and `_shared/core` are pure TypeScript: no `Deno.*`, no `npm:`/`jsr:` imports, relative imports with `.ts` extensions. They are typechecked by `pnpm typecheck` (via `tsconfig.json`) and tested by Vitest.
   - `_shared/deno/claude.ts` and `tudo-ai-settings/index.ts` are Deno-only.
   - If `deno` is available (`npx --yes deno@2 check supabase/functions/tudo-ai-settings/index.ts`), the implementer runs it and records the output. Otherwise this is listed as not run. A CI `deno check` step is a follow-up; no workflow changes in T-009.

### Allowlist sharing (C8): decision
**Source of truth: `src/shared/ai/`. A byte-identical mirror lives in `supabase/functions/_shared/ai/`, and `mirror.test.ts` asserts equality.** This is the architect's R-3, without the sync script. The test's failure message prints `cp src/shared/ai/{catalog,errors,validate,mask}.ts supabase/functions/_shared/ai/`. Both copies carry the same header comment ("Source of truth: src/shared/ai; mirrored to supabase/functions/_shared/ai; mirror.test.ts enforces equality"), so they stay byte-identical. Run `pnpm format` before copying so oxfmt formats both the same way.

Alternatives rejected:
- **Deno importing `../../../src/shared/ai`** (directly or via an import map): bundling of files outside `supabase/functions/` by the CLI or by `--use-api` is unverified, and a broken deploy would only show up on Ming's machine.
- **Un-ignoring `supabase/` in `.dockerignore`:** a High-tier file, and it couples the client image to server code.
- **The UI fetching the catalog from the function:** an extra round trip, and T-010 still needs typed ids.
- **A pnpm workspace package:** a stack change.
- **Symlinks:** unreliable on Windows checkouts.

**Model ids.**
- Claude: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, with Haiku as the default.
- Gemini: the implementer **must not guess**. Take the ids from Google's current Gemini API models page, list only stable (non-preview), image-input-capable models (F-701 needs vision), mark the cheapest stable "flash"-class model as the default, and cite the URL and access date in `impl-log.md`. If the page cannot be fetched, stop and record it in the impl-log rather than inventing ids.
- Labels are product names. Vietnamese descriptions belong to T-010's copy file (R6).

### Client wrapper `src/data/aiSettings.ts` (R1)
```ts
export interface AiSettingsRepo {
  available: boolean;                      // false in local mode
  get(): Promise<AiSettingsView | null>;
  save(input: { provider: AiProvider; model: string; apiKey?: string }): Promise<AiSettingsView>;
  deleteKey(): Promise<AiSettingsView | null>;
  test(): Promise<void>;
}
export class AiError extends Error { constructor(public code: AiErrorCode) { super(code); } }
```
- `createSupabaseAiSettings(sb)` calls `sb.functions.invoke("tudo-ai-settings", { body })`. Error mapping:
  - `FunctionsHttpError` → read `error.context.json()`. If the code is a known code, use `AiError(code)`; otherwise use `internal`.
  - Relay or fetch errors → `network`.
- `createLocalAiSettings()` has `available: false`, and every method rejects with `AiError("not_available")`.
- `getAiSettingsRepo()` chooses `supabase ? createSupabaseAiSettings(supabase) : createLocalAiSettings()`, the same rule as `useWardrobe`.
- `WardrobeRepo` is unchanged. No UI.

### Rate limiting (C4): decision
- Include the limit in T-009 as a `tudo_ai_calls` event table:
  - `test`: 20 per rolling hour.
  - `save`: 30 per rolling hour.
- An attempt is counted after auth and body parsing, and before validation of the values, so invalid saves count too.
- The check is count-then-insert. The race is acceptable, because the projects have a single user and sign-ups are disabled.
- On each recorded call, delete this user's rows older than 2 days.
- If the store fails, the request fails (fail closed).
- Rejected alternatives:
  - A `last_tested_at` column: it gives no per-window cap, and F-701 would need another migration.
  - Deferring the limit to F-701: `test` is already a server-side proxy call to a paid API, and the ticket names the risk now.

### Rules
- **R1.** Only the wrapper calls `functions.invoke`; local mode returns `not_available` and the demo flow is unchanged.
- **R2.** A new migration with RLS in the same file. Types are regenerated. Ming applies the migration.
- **R3.** Only `TUDO_*` function secrets; no `VITE_*` additions; the boundary test and the log spies enforce it.
- **R4/R5.** Not affected.
- **R6.** No UI copy; English codes only.
- **R7.** No Settings UI, no tagging.
- **R8.** Unit tests plus pgTAP.
- **R9.** No UI.
- **R10.** `vite.config.ts`, `AGENTS.md` and `.figma/` are not touched.

### Deploy runbook (M-10, added by the implementer to `work/ming-todo.md`)
Run after M-1 and after T-009 is merged. It needs `tudo_set_updated_at` from the init migration.
1. **Pre-checks (read-only).**
   - SQL Editor: `select to_regclass('public.tudo_ai_settings'), to_regclass('public.tudo_ai_calls');` → two nulls.
   - Dashboard → Edge Functions: no function named `tudo-ai-settings`.
   - Edge Functions → Secrets: no `TUDO_AI_KEK` or `TUDO_ALLOWED_ORIGINS` yet.
2. **Migration.** Paste `supabase/migrations/20261110000000_tudo_ai_settings.sql` into the SQL Editor and run it once. If it fails, stop and report; do not re-run part of it.
3. **Verify (read-only).**
   - `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in ('tudo_ai_settings','tudo_ai_calls') order by 1,2,3;` → only `service_role` (and owner) rows; no `anon` or `authenticated`.
   - `select relname, relrowsecurity from pg_class where relname in ('tudo_ai_settings','tudo_ai_calls');` → both true.
   - `select count(*) from pg_policies where tablename in ('tudo_ai_settings','tudo_ai_calls');` → 0.
4. **Secrets** (Dashboard → Edge Functions → Secrets; never `secrets set --env-file`):
   - `TUDO_AI_KEK`: generate it locally with `openssl rand -base64 32`. Store a copy in the password manager **before** saving it; if it is lost, every user must re-enter their key.
   - `TUDO_ALLOWED_ORIGINS` = `https://tudocuatui.mmlabs.online,http://localhost:8443`.
5. **Deploy** (D17 amendment, A2):
   1. `npx --yes supabase@3.0.0 login`
   2. `npx --yes supabase@3.0.0 functions deploy tudo-ai-settings --project-ref <stoktok ref>`
      - Add `--use-api` if `functions deploy --help` lists it; that avoids Docker. Otherwise Docker Desktop must be running.
      - Always name the function.
      - Never run `link`, `db …`, or a deploy without a name.
   3. Dashboard → Edge Functions → `tudo-ai-settings` → "Verify JWT" shows off (A3).
6. **Smoke test (optional before T-010).**
   1. Log in to TuDo in Supabase mode.
   2. DevTools → Application → Local Storage → `sb-<ref>-auth-token` → copy `access_token` (it expires in 1 h).
   3. Run `curl -s -X POST https://<ref>.supabase.co/functions/v1/tudo-ai-settings -H "Authorization: Bearer $T" -H "apikey: <anon key>" -H "Content-Type: application/json" -d '{"action":"get"}'`, then repeat with these bodies:
      - `save` with your Claude key
      - `test`
      - `get` → `keyHint` shows `••••` + the last 4 characters
      - `deleteKey`
   4. Repeat with a Gemini key.
   5. Without the `Authorization` header → 401.
   6. Clear the shell history afterwards.
7. Rollback, if needed: the commented block at the end of the migration, plus Dashboard → delete function `tudo-ai-settings`.

## Specialist input used
**database-optimizer**
- **Adopted:** A1 (app-level AES-256-GCM, KEK in `TUDO_AI_KEK`, no Vault, no pgsodium); AAD binding to user and provider; version prefix; B (PK as owner index, no closed model CHECK, provider CHECK, `key_hint` CHECK); D1–D4 (JWT-only user id, single accessor module, fixed codes, no provider text); D6 (rate limit); D7 (restricted CORS); E (hard delete, cascade); F (new timestamped file, rollback comment, KEK backup); G (pgTAP list, adapted to zero-privilege); unit-test list.
- **Rejected:**
  - C, the `tudo_private.tudo_ai_keys` split and authenticated SELECT on settings: not reachable via PostgREST (see the storage decision).
  - Separate `iv` and `key_version` columns: folded into the self-describing `v1:` string; same capability, one column.
  - `[A-Za-z0-9_-]` key-hint charset: keys are validated as printable ASCII, so the hint CHECK uses `[!-~]`.

**software-architect**
- **Adopted:** R-1 (one function, action field; `_shared` layout, refined into `core/` (pure) and `deno/`); R-2 (in-code auth via `getUser`, reject body `user_id`, `.eq` on every query, explicit `verify_jwt`, CORS via `TUDO_ALLOWED_ORIGINS`); R-3 (mirror plus equality test); R-4 Option B with a public table and no client grants; R-5 contract (`modelSupported`, `key_required`, 20–256 printable key, 4 KB cap, Claude `models.retrieve`, Gemini header key); R-6 codes (+ `key_unreadable`, C6); R-7 wrapper; R-8 rate-limit table and limits; R-9 tests; R-10 runbook (as M-10).
- **Rejected or changed:**
  - An owner-only RLS policy: replaced by no policies (C2).
  - The `pnpm ai:sync` script: replaced by the `cp` hint in the test, to avoid `package.json` and `scripts/` changes.
  - A CI `deno check` step: deferred to a follow-up, to keep workflows out of this High-tier diff.
  - `key_status` / `key_checked_at` columns: not required by the ticket; left as a follow-up.

## Assumptions
Defaults that Ming confirms by approving:
- **A1 — KEK storage.** AES-256-GCM in the Edge Function with `TUDO_AI_KEK` as a function secret (not Vault). Function secrets are project-wide, so stoktok's functions and anyone with Dashboard access could read the KEK. This is the shared blast radius accepted in D17. If the KEK is lost, every user re-enters their key (`key_unreadable`).
- **A2 — D17 amendment.** Ming may run `npx --yes supabase@3.0.0 functions deploy <name> --project-ref <ref>` from the CLI. Always name the function; never use `link`, `db` commands or `secrets set --env-file`. Agents never deploy. Recorded as D22.
- **A3 — `verify_jwt = false`, with mandatory in-code verification** (`auth.getUser(token)` before anything else). This works whether stoktok uses legacy JWT secrets or the new asymmetric signing keys and `sb_publishable_`/`sb_secret_` keys. With the gateway check on, the new keys could cause a 401 on every call. Unauthenticated calls still reach the function but are rejected in code before any DB or provider access.
- **A4 — Function names.** `tudo-ai-settings` now. F-701's function is renamed **`tudo-tag-item-photo`** (the feature list says `tag-item-photo`), because function names share stoktok's namespace and `deploy` overwrites silently. F-701's plan records the rename; this ticket does not edit the feature list.
- **A5 — Test-key behaviour.** `test` is a separate action, run on demand (T-010's Test button), and costs no tokens: Claude `models.retrieve`, Gemini GET of the model resource. It is not run automatically on save, and the result is not stored.
- **A6 — Rate limits.** `test` 20/hour and `save` 30/hour per user, rolling window, attempts counted, fail closed. F-701 adds `tag` (100/day, as in the feature list) using the same table.
- **A7 — One key per user.** One active provider at a time. Switching provider requires entering that provider's key (`key_required`).
- **A8 — Key format.** Trimmed, 20–256 printable ASCII characters, no whitespace. There is no prefix check; the test call proves validity. The hint is the last 4 characters, displayed as `••••abcd`.
- **A9 — CORS origins.** `https://tudocuatui.mmlabs.online,http://localhost:8443` (D20 production host plus the dev port).
- **A10 — Gemini via REST `fetch`, not Google's SDK.** It is a single GET, so no extra dependency. Claude uses the official Anthropic SDK, as required. SDK versions are pinned exactly in `deno.json`.
- **A11 — Gemini model list.** Stable, image-capable models only, taken from Google's docs at implementation time with the URL cited. They are not known at plan time.
- **A12 — Migration order.** Applied after M-1 (it needs `public.tudo_set_updated_at`). The T-009 code can merge before M-1; Supabase mode then has no tables anyway (D18).

Non-blocking working assumptions:
- **A13 — No Docker in the agent environment** (as in F-002 and T-007). If `pnpm db:types` cannot run, the implementer adds the two tables to `src/types/database.ts` by hand in the generator's exact shape (alphabetical, Row/Insert/Update/Relationships) and flags it for regeneration (M-8 style). The pgTAP files are then reviewed by reading, and Ming runs them (Ming verification, step 1).
- **A14 — Hotspots.** `vitest.config.ts`, `tsconfig.json` and `supabase/config.toml` may conflict with other open tickets. The changes are additive lines, so rebase if needed. `work/ming-todo.md` is edited only to add M-10 (allowed on ticket branches per precedent; D16 restricts only `backlog.md`).
- Line count: about 450–600 lines of code plus about 600 lines of tests. This is above the ~400-line guide, but it is one feature and the ticket is already a split of an L request; see *Split proposal*.

Follow-ups (not in this diff): a CI `deno check` step; `key_status` / `key_checked_at`; KEK rotation (`TUDO_AI_KEK_PREV`); README section for local `functions serve`; feature-list update for D21 and the F-701 rename.

## Blocking questions
None. Every open point has a default above (A1–A12) for Ming to confirm at plan approval.

## Split proposal
None. Splitting further would leave a half that cannot be verified or deployed on its own: a migration without the function is useless, and the function without the migration fails. It would also double the High-tier approval and deploy steps. Most of the size is tests. If the reviewer finds the diff too large, the fallback split is: **T-009.1** = migration, function and pgTAP; **T-009.2** = `src/data/aiSettings.ts` and its tests.
