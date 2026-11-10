# Consult — software-architect — T-009 (2026-11-10)

## Findings
1. **No Edge Function setup exists yet.** There is no `supabase/functions/`. `config.toml` already has `[edge_runtime]` with `deno_version = 2` and no `[functions.*]` blocks. `.github/risk-tiers.yml` already lists `supabase/functions/**` as High.
2. **The Docker build cannot see `supabase/`.** `.dockerignore` excludes the whole `supabase` directory. If anything in `src/` imports from `supabase/functions/_shared/…`, `pnpm build` inside the Docker image (T-007, `ci.yml` job `image`) fails. Code shared by the UI and the server therefore cannot live only under `supabase/`.
3. **The Supabase CLI may not bundle files outside `supabase/functions/`.** I could not verify this. Treat a Deno import of `../../../src/...` as unreliable.
4. **Type-checking boundaries.** `tsconfig.json` includes only `src` and the configs, and has `allowImportingTsExtensions: true`. Relative `.ts` imports therefore work in both Vite and Deno, provided a shared file has no `npm:` imports, no `jsr:` imports and no `Deno.*` calls. Vitest picks up `**/*.test.ts` anywhere, and the jsdom environment is the default.
5. **Grants on the shared project.** stoktok revokes default privileges from `anon` and `authenticated`, and D17 says every grant must be explicit. A table that only the Edge Function touches also needs an explicit `grant … to service_role`. `service_role` bypasses RLS but not missing privileges. `supabase/tests/grants.sql` only checks `anon` and `authenticated` today.
6. **`tudo_private` is not a safe home for the secret.** It has `USAGE` granted to `authenticated` and is not exposed through PostgREST. So a secret table there would be unreachable for the function's service-role client over REST, and any `SECURITY DEFINER` helper placed there could be called by `authenticated`.
7. **`WardrobeRepo` pattern.** One interface with a local and a Supabase factory, chosen in `useWardrobe.ts` by whether `supabase` is null. Errors are thrown. Tests use a small hand-written fake client (`repo.supabase.test.ts`).
8. **Naming conflict.** F-701 names the function `tag-item-photo`. On the shared project, Edge Function names are one namespace with stoktok's, and `functions deploy` silently overwrites a function with the same name.
9. **The CI anon key looks like the new key format.** CI uses `sb_publishable_…` as its dummy. If stoktok uses the new publishable/secret keys and asymmetric JWT signing, the gateway's legacy `verify_jwt` check may not behave as expected. This is unverified.

## Recommendations
**R-1. Function layout.** Ties to the ticket scope and AC1.
- One function, `tudo-ai-settings`. It accepts POST only, with a JSON body `{ action: "get" | "save" | "deleteKey" | "test", ... }`, plus OPTIONS for CORS.
  - Why one function: one deploy step and one place for CORS and auth.
  - What you give up: per-action metrics.
- F-701 should be a separate function, `tudo-tag-item-photo`. It has a different payload, latency and rate limit.
- Use the `tudo-` prefix on every function (D17 naming). Record F-701's rename in its plan.
- Folder layout:
```
supabase/functions/
  deno.json                     # import map; pinned npm:@supabase/supabase-js@2, npm:@anthropic-ai/sdk@<pin>
  _shared/                      # underscore → not deployed as a function
    ai/                         # mirror of src/shared/ai (see R-3), DO NOT EDIT header
    http.ts                     # cors, json(), error envelope        (pure)
    crypto.ts                   # AES-GCM seal/open via WebCrypto     (pure)
    settingsHandler.ts          # handle(req, deps) — all logic, deps injected (pure)
    rateLimit.ts                # count-in-window over an injected store (pure)
    providers/claude.ts         # Anthropic SDK adapter (Deno-only)
    providers/gemini.ts         # fetch adapter (Deno-only)
    providers/index.ts          # ProviderClient interface: testKey(key, model), later tagImage(...)
    store.ts                    # service-role DB access + loadUserAiConfig(uid) for F-701 (Deno-only)
    auth.ts                     # requireUser(req) (Deno-only)
  tudo-ai-settings/index.ts     # thin wiring: Deno.env, real deps → settingsHandler
```
- Write the code as a testable core with a thin shell. The pure modules contain no `Deno.*` and no `npm:` imports, so Vitest can test them. `index.ts`, the adapters, `store.ts` and `auth.ts` are thin.
- F-701 reuses `auth`, `http`, `crypto`, `store.loadUserAiConfig`, `rateLimit`, and the `providers` interface, to which it adds `tagImage`.

**R-2. Auth.** Ties to AC2 and R3.
- Always verify the caller in code, whatever the gateway does. Take the bearer token from `Authorization`, then call `admin.auth.getUser(token)` (this checks revoked or deleted users), or use `getClaims` as stoktok does. Require `sub`, and require role `authenticated`.
- `user_id` comes only from the JWT. Reject any body that contains `user_id` or other unknown fields.
- Use the service-role client only inside the function, read from the env vars the runtime injects automatically. Check the exact variable name for this project's key type at implementation time. Every query filters with `.eq("user_id", uid)`.
- Set `verify_jwt` explicitly in `config.toml` under `[functions.tudo-ai-settings]`. Its value depends on Open question 3.
- CORS: allow only origins listed in a function secret, `TUDO_ALLOWED_ORIGINS` (production plus `http://localhost:8443`). Allow the headers `authorization`, `apikey`, `content-type` and `x-client-info`.

**R-3. One allowlist with no drift.** Ties to AC3 and to T-010's filtered model list.
- The source of truth is `src/shared/ai/`. It contains pure TypeScript with no imports:
  - `catalog.ts`: `AI_PROVIDERS = ["claude","gemini"] as const`, and `AI_MODELS: Record<AiProvider, {id, label, vision: true, default?: true}[]>`.
  - `errors.ts`: the error-code union.
  - `validate.ts`: `validateSaveInput` and `isAllowedModel`.
  - `mask.ts`: `maskHint`.
- `supabase/functions/_shared/ai/` is a byte-identical copy (header: "generated, do not edit"), produced by a small `pnpm ai:sync` script.
- A Vitest test reads both directories and asserts they are equal. Drift then fails CI, and the Docker image never needs `supabase/`.
- Rejected alternatives:
  - Un-ignoring the file in `.dockerignore`: a High-tier file, and it couples the image to server code.
  - Having the UI fetch the catalog from the server: it adds a round trip and the UI still needs typed ids.
- Claude ids: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. Make Haiku the default; it is cheap and good enough for tagging.
- Gemini ids: take them from Google's current model docs at implementation time, cite the URL in `impl-log.md`, and list only vision-capable models (F-701 needs that).
- Model display names are product names. Any Vietnamese descriptions belong in T-010's copy file, keyed by model id (R6).
- Do not add a DB `CHECK` on `model`, because the model list changes over time. Check `provider` in the DB, and only length and charset for `model`.

**R-4. Storage and encryption.** Ties to AC1, AC2 and R2. Ming should choose between two options; I recommend B.

Shared by both options, the table is `public.tudo_ai_settings`:
- `user_id uuid pk references auth.users on delete cascade`
- `provider text check (provider in ('claude','gemini'))`
- `model text check (length(model) between 1 and 100)`
- `key_hint text null`, holding the last 4 characters only
- the key reference or ciphertext (option-specific)
- `key_updated_at`, `created_at`, `updated_at`
- RLS enabled, with an owner-only policy kept as defence in depth.
- Grants: nothing for `anon`; nothing for `authenticated`; all DML for `service_role`.
- The browser reaches this table only through the function. That makes "never selectable" a structural fact rather than a column grant someone could widen later. It also keeps the ciphertext column out of any client-facing contract. Since `authenticated` has no grant, add a header comment saying the generated `database.ts` row type does not mean the client can read the table.

**Option A: Supabase Vault.** The table holds `key_secret_id uuid`.
- Requires `SECURITY DEFINER` wrappers in `public`, executable by `service_role` only, for create, update, read-decrypted and delete. Those wrappers are more High-tier SQL and must stay out of `tudo_private` (Finding 6).
- Vault secrets on the shared project mix with stoktok's; namespace them as `tudo_ai_key:<uid>`.
- Anyone with SQL Editor access can read `vault.decrypted_secrets`.

**Option B (recommended): AES-256-GCM in the Edge Function.** The table holds `key_ciphertext text`.
- The key-encryption key is the function secret `TUDO_AI_KEK`, 32 random bytes in base64.
- Format: `v1:` + base64(12-byte IV ‖ ciphertext+tag).
- Use `user_id:provider` as additional authenticated data, so a ciphertext copied into another row fails to decrypt.
- Uses WebCrypto only, so it is unit-testable in Vitest under `// @vitest-environment node`.
- A database dump or SQL Editor access alone does not reveal any key.
- Costs: Ming must back up the KEK, and losing it means users re-enter their keys. Function secrets are visible to stoktok's functions too, which is the shared blast radius accepted in D17.
- No `SECURITY DEFINER` SQL is needed.
- The `v1` prefix leaves room for rotation later, for example a `TUDO_AI_KEK_PREV` secret; that is not in scope now.

**R-5. Action contract.** Ties to AC1, T-010 and F-702.
- `get` → `{ settings: { provider, model, keyHint: "••••1234" | null, hasKey, modelSupported, updatedAt } | null }`
  - `modelSupported: false` covers a stored model that has since been dropped from the catalog.
- `save { provider, model, apiKey? }` → same response shape.
  - Changing the provider without a new key gives `key_required`.
  - Key check: trim, 20–256 characters, printable ASCII, no whitespace. Do not hard-code key prefixes; the test call is what proves a key works.
  - Cap the request body at about 4 KB.
- `deleteKey` → nulls the ciphertext and hint, keeps provider and model, and returns the settings.
- `test` → tests the stored key, returns `{ ok: true }` or an error. It must cost no tokens:
  - Claude: official SDK, `client.models.retrieve(model)` with `maxRetries: 0` and a timeout of about 10 s. This checks both the key (401) and the model (404).
  - Gemini: GET on the `models/{model}` endpoint, with the key in the `x-goog-api-key` header, never in the URL. Verify the exact endpoint and error shapes at implementation.
  - Optional: store `key_status` (`untested | ok | invalid`) and `key_checked_at`, so F-702 can say "key invalid" without making a call.

**R-6. Error codes.** These live in `src/shared/ai/errors.ts` and are used by the server, T-010 and F-702.
- Response body: `{ error: { code } }`, with no message text and never provider error text.

| Status | Codes |
|---|---|
| 400 | `bad_request`, `invalid_provider`, `invalid_model`, `invalid_key_format`, `key_required` |
| 401 | `unauthenticated` |
| 404 | `not_configured` (no settings or no key) |
| 405 | `method_not_allowed` |
| 413 | `payload_too_large` |
| 422 | `invalid_key`, `key_forbidden`, `model_unavailable` |
| 429 | `rate_limited` (ours), `provider_rate_limited` |
| 502 | `provider_unavailable` |
| 500 | `internal` |
| 503 | `server_misconfigured` (KEK or secret missing) |

- Client-only codes: `not_available` (local mode) and `network`.
- Logging: log the code, the action and the provider's HTTP status only. Never log request bodies, SDK error objects, or headers (R3, AC4).

**R-7. Client wrapper.** Ties to R1. Put it in `src/data/aiSettings.ts`, kept separate from `WardrobeRepo` so that interface does not change.
```ts
export interface AiSettingsRepo {
  available: boolean;                      // false in local mode
  get(): Promise<AiSettingsView | null>;
  save(input: { provider: AiProvider; model: string; apiKey?: string }): Promise<AiSettingsView>;
  deleteKey(): Promise<AiSettingsView>;
  test(): Promise<void>;
}
export class AiError extends Error { constructor(public code: AiErrorCode) { super(code); } }
```
- `createSupabaseAiSettings(sb)` calls `sb.functions.invoke("tudo-ai-settings", { body })`.
  - On `FunctionsHttpError`, read `await error.context.json()` to get the code.
  - On fetch or relay errors, use `network`.
  - On an unknown code, use `internal`.
- `createLocalAiSettings()` sets `available: false` and every method throws `AiError("not_available")`.
- Choose the implementation the same way `useWardrobe` does. Throwing matches the existing repo's style.
- Test with a fake `functions.invoke`, following the pattern in `repo.supabase.test.ts`.
- The wrapper never stores or echoes `apiKey`.

**R-8. Rate limiting.** Ties to the ticket's risks and F-701.
- Add `public.tudo_ai_calls (id, user_id, kind text, created_at)` in the same migration: service-role only, RLS on, index on `(user_id, kind, created_at)`.
- `rateLimit.ts` counts rows in the window, then inserts. The race between count and insert is acceptable for a single user.
- T-009 limits: `test` 20/hour and `save` 30/hour.
- F-701 then adds `tag` 100/day with no new migration.
- Prune rows older than 2 days opportunistically.
- If keeping T-009 small matters more, this can move to F-701 (R7). Decide in the plan.

**R-9. Testing.** Ties to AC2, AC5 and R8.
- **Vitest** covers:
  - `src/shared/ai/*`: validation, catalog, mask.
  - The mirror-equality test.
  - `_shared/crypto.ts`: round trip; wrong additional data fails; tampering fails; the `v1` prefix.
  - `_shared/settingsHandler.ts` with fake deps:
    - user id taken from the JWT only;
    - `apiKey` never present in any response or log call (spy on the logger);
    - every error code;
    - provider change requires a key.
  - Provider error mapping: the adapters' status→code functions, kept pure.
  - `src/data/aiSettings.ts`.
  - Add these files to the coverage `include` and `thresholds` in `vitest.config.ts`. `src/shared/**` can only be tested from inside `src`, which is fine.
- **pgTAP**: add to `supabase/tests/` that `anon` and `authenticated` get permission denied on select, insert, update and delete for both new tables, that `service_role` has DML, and that RLS is enabled. Run it under `scripts/test-db-shared.sh` as well.
- **Deno**: optionally add a CI step `deno check supabase/functions/*/index.ts` (via `denoland/setup-deno`) to catch import or type errors in the shell. No `deno test` suite, so there is one test runner.
- **Manual smoke**: `npx supabase functions serve` locally, plus a short script in `impl-log`.

**R-10. Deploy runbook for Ming.** Add this as a new M-item; T-009 should not list it in `Needs Ming`, per D12.
1. Pre-check in Dashboard → Edge Functions that no function named `tudo-ai-settings` exists.
2. Apply the migration in SQL Editor (D17).
3. In Dashboard → Edge Functions → Secrets:
   - add `TUDO_AI_KEK`, generated with `openssl rand -base64 32` and backed up offline;
   - add `TUDO_ALLOWED_ORIGINS`;
   - never use `secrets set --env-file`.
4. Deploy: `npx supabase login`, then `npx supabase functions deploy tudo-ai-settings --project-ref <stoktok ref>`.
   - Always give the function name, so an accidental "deploy all" cannot happen.
   - Do not run `link`. Deploying a function does not touch migration history.
   - Check whether `--use-api` avoids needing Docker.
   - This needs a dated amendment to D17, because D17 currently lists only SQL Editor steps.
5. Smoke test from the app in Supabase mode.

## Risks
- **KEK loss or leak.** Loss forces every user to re-enter keys. A leak lets anyone with a DB read decrypt the keys. The project secret is also readable by stoktok's functions (shared project).
- **A gateway JWT mismatch** with the new signing keys would make every call return 401, or would let calls through to the in-code check only.
- **Model drift.** Catalog ids get retired. `modelSupported` and `model_unavailable` handle this, but it needs a periodic `/solo` to update the catalog.
- **Accidental logging** of the key through SDK error objects or a `console.log(body)`. The tests must spy on the logger.
- **The mirror copy** can go stale if someone edits the server copy. The equality test catches that, but only in CI.
- **Scope creep** into F-701: the `tagImage` adapter and storage reads belong in F-701, not T-009 (R7).
- **CORS misconfiguration** would block the production origin. Verify it in the smoke test.

## Open questions (for Ming or the plan)
1. Vault (Option A) or in-function AES-GCM with `TUDO_AI_KEK` (Option B, recommended)?
2. Can D17 be amended to allow `supabase functions deploy <name> --project-ref` from the CLI (no `link`, no `db` commands)?
3. Does the stoktok project use the new publishable/secret keys and asymmetric JWT signing? This decides `verify_jwt` in `config.toml`.
4. Should T-009 include the rate-limit table (R-8), or should it wait for F-701?
5. Should `save` run the key test automatically before storing, or should Test stay a separate button?
6. Confirm that F-701 is renamed `tudo-tag-item-photo`.
