Status: READY

# Plan — T-018: Store AI provider settings and an encrypted API key on the Node server

High tier (`Gate: plan-approval`). The loop stops here until Ming writes "Plan approved" in the ticket. Every
deviation from the ticket text is listed as **C1–C14** under *Changes vs ticket scope*. The consults' open questions
are adopted as defaults **A1–A12**. Nothing blocks planning.

**This plan covers slice T-018.1 only** (see *Split proposal*). Slice T-018.2 is outlined at the end so the full
endpoint contract can be approved in one go.

## Feature summary
- `docs/feature-list.md` E7, F-701: "Calls a vision LLM server-side; the API key lives only in Supabase secrets".
  D21 changed this.
- `work/decisions.md` D21 (2026-11-10): "Each user picks provider, model and enters their own API key in Settings;
  the key is stored **encrypted server-side** (e.g. Supabase Vault), never returned to the browser (masked hint
  only), and used only by Edge Functions. AI is available in **Supabase mode only**; local mode / Figma Make preview
  unchanged."
- D23: "TuDo moves its data from Supabase … to the shared Postgres … accessed only by a Node API … Supersedes …
  D21's Supabase storage design".
- D25: "While the app is single-user without login (D23), tables do not use RLS".
- D26: "root-owned files `/app/{package.json,node_modules,dist,server,db/migrations}`".
- D28: "The four Drive secrets … are repository secrets of `mmlabs-online/deployment`".
- Ticket notes (Ming, 2026-11-12, "ok" to T-010 Q1–Q3): "Q2: D21 'Supabase mode only' becomes 'API mode only'.
  Q3: the key is entered in Settings and stored encrypted in Postgres, with a new `TUDOCUATUI_AI_KEK` deployment
  secret."

### Changes vs ticket scope (for Ming's approval)
| # | Ticket says | Plan does | Why |
|---|---|---|---|
| C1 | "Reuse `src/shared/ai/{catalog,errors,validate,mask}.ts`" | Port them to plain JS in `server/ai/` (JSDoc, `// @ts-check`). A new `server/ai/parity.test.ts` checks that both trees agree: same constants, and the same results on a fixture table. The image, D26 and `check-image.sh` (`test ! -e /app/src`) are unchanged. | Architect F1: the image has no `src/`, the server has no build step, and running `.ts` at runtime would need Node type stripping (≥ 22.18, experimental warning) plus a D26 change. "Reuse" now means "the same rules, enforced by a test". |
| C2 | Server-only env `TUDOCUATUI_AI_KEK` | Repo secret `TUDOCUATUI_AI_KEK` → container env **`AI_KEK`** | Same as the Drive values (D28: prefixed repo secret, unprefixed env file line). Architect R-4, open question 1. |
| C3 | Only "KEK missing" is specified | Unset or empty: AI routes answer `503 server_misconfigured` and the app runs. Malformed (not base64 of exactly 32 bytes): the server **exits 2** at startup. | A typo should fail the deploy health check and roll back, not quietly disable AI. T-018.2 also validates the format in the envfile step. Architect R-4, Q3. |
| C4 | — | Add `invalid_json` (400), `unsupported_media_type` (415), `forbidden_origin` (403) and `db_unavailable` (503) to `AI_ERROR_STATUS` in all three trees: `src/shared/ai/errors.ts`, its byte-identical mirror `supabase/functions/_shared/ai/errors.ts` (`mirror.test.ts`), and `server/ai/catalog.js`. | AI routes share the `/api` guard and `readJson`, which return these codes. Without them, T-010's `isServerErrorCode` would collapse them to `internal`. Architect F4/R-3, Q4. The codes are used as they are, with no renaming. |
| C5 | Port T-009 (it had a `tudo_ai_calls` table) | No rate-limit table. An in-memory rolling window: `save` 30/hour (T-018.1), `test` 20/hour (T-018.2). A restart resets it. | One user behind Cloudflare Access. Both consults said "no table". See the disagreement note below. |
| C6 | "Port the Claude adapter (with the pinned baseURL)" | **T-018.2:** plain injected `fetch` to the hard-coded `https://api.anthropic.com/v1/models/<model>`, with no `@anthropic-ai/sdk` | The SDK is not a server dependency. A constant URL keeps the "pinned base URL" property. Architect R-7. |
| C7 | — | `GET` with no row returns `{settings:null}`. `DELETE /key` is idempotent and returns 200 with the view, or `null`. | T-009's contract, which T-010 was planned on. No fake provider/model defaults in app code. |
| C8 | "If the KEK is missing, the endpoints answer with a clear error code" | Without the KEK, **every** AI route answers `503 server_misconfigured`, including `GET` | One rule, and T-010 can show "AI chưa được cấu hình trên máy chủ". |
| C9 | One ticket | Split into T-018.1 (this plan) and T-018.2 | About 1,000 changed lines with tests (Rule 2). See *Split proposal*. |
| C10 | Files: migration, `server/api.js`, `server/ai/*`, deploy config, decisions, ming-todo | Also `server/app.js`, `server/index.js`, `tsconfig.server.json`, `vitest.config.ts`, `src/shared/ai/boundary.test.ts`, `scripts/check-image.sh`, `server/README.md`, plus a note on T-016 | Each is listed with its reason under *Files*. |
| C11 | Port `crypto` | AAD becomes `tudocuatui-ai-key\|v1\|single\|<provider>` (T-009 used the user id) | No user id exists (D25). T-009 ciphertexts were never deployed, so there is nothing to migrate. If users are added later, keys must be re-entered (recorded in D30). |
| C12 | "single-row table" | Table `ai_settings` (no `tudo_` prefix), singleton `id boolean primary key default true check (id)` | Matches the unprefixed tables on the new DB. See the disagreement note below. |
| C13 | "back it up in Bitwarden (personal collection)" | Kept as a **human** step in M-16 (T-018.2). No agent ever handles the value. | Workspace §3 keeps agents out of the personal collection. This is Ming's own step, so the ticket text stands. Only the name could go into `secrets.refs.yaml`, if Ming wants (A11). |
| C14 | "Update the notes of T-010, F-701 and F-702" | Append notes. Also set F-701's `Depends on` to `T-018.2` in its `ticket.md`, and add a coordination note to T-016. The board row (`work/backlog.md`) is changed on `main` by the orchestrator (D16). | Architect F9, R-11 |

### Where the consults disagree
- **Singleton id type.** Architect: `smallint default 1 check (id = 1)`. DB consult: `boolean default true check (id)`.
  **Plan uses `boolean`.** It is the database specialist's area, it is the standard idiom, and there is no magic
  number. Both give the same `on conflict (id)` upsert. A future multi-user change replaces the key with `user_id`
  in either case.
- **Rate limit.** Architect: `test` 20/h, `save` 30/h. DB consult: "1 call per few seconds" on `test`.
  **Plan uses 20/h and 30/h.** These are T-009's reviewed numbers (`rateLimit.ts` `LIMITS`), testable with an
  injected `now`. A per-few-seconds spacing adds a second rule with no clear threat behind Access.
- **Extra table checks.** The architect's table has no format checks on `key_ciphertext` or `key_hint`. **The plan
  adopts the DB consult's checks** (`^v[0-9]+:[A-Za-z0-9+/=]+$`, `^[!-~]{4}$`) and its `created_at`. `keyHintOf`
  always yields 4 printable ASCII characters, because the key is validated as 20–256 `[!-~]`.
- **GET without a row.** The DB consult suggests catalog defaults. **The plan returns `null`** (C7).

## Acceptance criteria → verification
Criteria for slice T-018.1. Ticket AC 3 (the `test` call) moves to T-018.2.

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The API key is stored only encrypted. No endpoint, log line or error body contains it (sentinel). | `server/ai/routes.test.ts › sentinel never leaves the server` runs PUT (ok, invalid model, bad JSON, over-size, DB error), GET and DELETE. For each, the sentinel must be absent from the body, the headers, every captured log entry (JSON-stringified) and thrown messages. `server/ai/store.db.test.ts › stores ciphertext, never the key` checks the `key_ciphertext` column. |
| 2 | `GET` returns provider, model and the masked hint only. `PUT` rejects invalid provider/model through the shared rule. | `routes.test.ts › GET view shape` (exact keys `provider, model, keyHint, hasKey, modelSupported, updatedAt`; `keyHint` = `••••` + last 4). `routes.test.ts › PUT validation` (`invalid_provider`, `invalid_model` incl. any Gemini model, `invalid_key_format`, `bad_request` for unknown or mistyped fields, `key_required`). `parity.test.ts` proves the server rule equals `src/shared/ai`. |
| 3 | (moved to T-018.2) `POST /api/ai-settings/test` maps provider failures | — |
| 4 | With the KEK unset, AI endpoints return a defined error, and items, photos and the rest of the API still work | `routes.test.ts › KEK off` (createApp with `ai: null`): GET, PUT and DELETE return `503 {error:{code:"server_misconfigured"}}`; `/api/items` and `/api/locations` still return 200 with the stub pool. `index.cli.test.ts › no AI_KEK: logs 'ai not configured'`. `index.cli.test.ts › malformed AI_KEK exits 2` (message names `AI_KEK`, not the value). |
| 5 | Local mode unchanged (R1). Checks green, including the migration runner test. | `git diff --stat main` shows no change under `src/` except `src/shared/ai/errors.ts` (4 codes) and `boundary.test.ts`. Run `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. `server/migrator.test.ts` scans the new file automatically. `migrator.db.test.ts`, `schema.db.test.ts` (no RLS, no `user_id`) and `store.db.test.ts` run with `TEST_DATABASE_URL`: mandatory in CI, and locally if a Postgres is available (the reviewer records which). |
| 6 | (C1) Server port and `src/shared/ai` agree | `server/ai/parity.test.ts` |
| 7 | (C2) R3 boundary covers the new names | `src/shared/ai/boundary.test.ts`: `AI_KEK` and `ai_settings` are in `FORBIDDEN`. `scripts/check-image.sh`: the image-env regex includes `AI_`, and `expect_exit 2 "server with malformed AI_KEK"` is added. Review the script diff. It runs in the CI `image` job. |

## Ming verification after merge
- Review the migration `db/migrations/<ts>_ai_settings.sql` (High tier). The next release's deploy applies it
  through `migrate`. It is expand-only, so the previous image ignores the new table.
- After that release, with no `TUDOCUATUI_AI_KEK` set yet (that is T-018.2 / M-16):
  - `docker compose -p tudocuatui logs --tail 20 tudocuatui` shows `ai not configured`.
  - Signed in through Access, opening `https://tudocuatui.mmlabs.online/api/ai-settings` in the browser shows
    `{"error":{"code":"server_misconfigured"}}`.
  - Items and photos work as before.
- Nothing to set up for T-018.1. The KEK, the deploy wiring and M-16 come with T-018.2.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261112160000_ai_settings.sql` | create (pick a timestamp after the newest on `main` at rebase time) | Scope bullet 1, D25. Content under Approach §1. |
| `server/ai/catalog.js` | create | C1: `AI_PROVIDERS`, `AI_MODELS`, `MODEL_ID_PATTERN`, `AI_ERROR_STATUS` (incl. C4), `defaultModelOf`, JSDoc typedef `AiSettingsView` |
| `server/ai/validate.js` | create | C1: `MAX_BODY_BYTES`, `isAllowedProvider`, `isAllowedModel`, `validateApiKeyFormat`, plus `parseSettingsBody` (REST shape `{provider, model, apiKey?}`, unknown keys → `bad_request`). `parseRequest` (RPC) is not ported. |
| `server/ai/mask.js` | create | C1: `keyHintOf`, `maskHint` |
| `server/ai/crypto.js` | create | Port of `supabase/functions/_shared/core/crypto.ts` with WebCrypto (`globalThis.crypto.subtle`, `Buffer` base64). `importKek`, `sealKey(kek, provider, plaintext)`, `openKey(kek, provider, sealed)`. AAD per C11. Format `v1:` + base64(IV‖ct+tag). |
| `server/ai/config.js` | create | `loadAiConfig(env)` → `{mode:"off"}` \| `{mode:"on", kekB64}`, and `AiConfigError` (C3). Strict regex `^[A-Za-z0-9+/]{43}=$` plus a decoded length of 32. Empty = unset. The message names `AI_KEK`, never the value. |
| `server/ai/store.js` | create | SQL for `ai_settings`: `get()`, `save({provider, model, sealed})` (one transaction; returns `{ok:false, code:"key_required"}` or the row), `clearKey()`. `getSecret()` is added in T-018.2. |
| `server/ai/rateLimit.js` | create | In-memory rolling window `createLimiter({now})`, `LIMITS = {save: 30/h, test: 20/h}` (C5) |
| `server/ai/routes.js` | create | `handleAiSettings(req, res, ctx)` for `GET /api/ai-settings`, `PUT /api/ai-settings`, `DELETE /api/ai-settings/key` |
| `server/api.js` | modify | `match()`: 2 new routes. Dispatch to `handleAiSettings` after the `Sec-Fetch-Site` guard and **before** the UUID check and the item body parsing (architect F2). Pass `ai` through. |
| `server/app.js` | modify | New optional dep `ai: { kek: CryptoKey, store?: AiStore } \| null` (default `null`). Create one limiter per app. Pass both to `handleApi`. |
| `server/index.js` | modify | `loadAiConfig(process.env)` (exit 2 on `AiConfigError`, like Drive). Top-level `await importKek(...)` once. Log `ai configured` / `ai not configured`. Pass `ai` to `createApp`. |
| `src/shared/ai/errors.ts` | modify | C4: 4 codes added to `AI_ERROR_STATUS`, nothing else (line 1 stays: T-016 owns it) |
| `supabase/functions/_shared/ai/errors.ts` | modify | C4: byte-identical copy of the file above (`mirror.test.ts`) |
| `src/shared/ai/boundary.test.ts` | modify | Append `"AI_KEK"` and `"ai_settings"` to `FORBIDDEN` (architect F7). Nothing else: T-016 also appends here. |
| `tsconfig.server.json` | modify | Add `"allowImportingTsExtensions": true` so `parity.test.ts` can import `src/shared/ai/*.ts` (and `validate.ts`'s `./catalog.ts`) under `tsc -p tsconfig.server.json`. Fallback if that fails: record it in impl-log and stop. Do not widen `include`. |
| `vitest.config.ts` | modify | Coverage threshold entry `"server/ai/**": thresholds` (R8). `server/**/*.js` is already included. |
| `scripts/check-image.sh` | modify | Line 58 regex: add `AI_`. Add `expect_exit 2 "server with malformed AI_KEK" "${ACCESS[@]}" -e AI_KEK=not-a-kek "$IMAGE"`. |
| `server/README.md` | modify | Env table row `AI_KEK`. New section "AI settings (T-018)": endpoints, error codes, KEK behaviour, the parity rule. Fix line 20 ("GitHub environment `tudocuatui`" → repository secrets, D28). |
| `work/decisions.md` | modify | Append D30 (text under Approach §8) |
| `work/tickets/T-010/ticket.md`, `work/tickets/F-701/ticket.md`, `work/tickets/F-702/ticket.md` | modify | Append one dated note each (Approach §8). F-701: `Depends on` → `T-018.2`. |
| `work/tickets/T-016/ticket.md` | modify | Append the coordination note (architect R-11, Approach §8) |
| `work/tickets/T-018/impl-log.md` | create | Implementer log |

**Not touched in T-018.1:** `Dockerfile`, `.dockerignore`, `package.json`, `deploy/deployment-repo/**`,
`scripts/deploy-envfile.test.ts`, `work/ming-todo.md` (all T-018.2), `work/backlog.md` (D16), the line-1 headers of
`src/shared/ai/*.ts`, `mirror.test.ts`, `src/data/aiSettings.ts` (T-016), `supabase/**` except the one mirror
file, `.env.example`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/ai/parity.test.ts › constants are equal` | Deep-equal `AI_PROVIDERS`, `AI_MODELS`, `AI_ERROR_STATUS`, `MAX_BODY_BYTES`, `MODEL_ID_PATTERN.source/flags`, `defaultModelOf` for each provider (C1, C4) |
| `parity.test.ts › validate agrees on a fixture table` | `validateApiKeyFormat` on keys of length 19, 20, 256 and 257; leading/trailing spaces (trimmed); inner space, tab and newline; non-ASCII (`é`, `ă`, emoji); non-strings (`null`, `5`, `{}`). `isAllowedProvider` on `claude`, `gemini`, `Claude`, `""`, `"toString"`. `isAllowedModel` on every catalog id, case variants, ids with a trailing space, and any id under `gemini` (catalog empty). |
| `parity.test.ts › mask agrees` | `keyHintOf` on padded and plain keys, `maskHint(null)` and `maskHint("abcd")` |
| `server/ai/crypto.test.ts` | Round trip. Wrong KEK, wrong provider, one flipped byte, truncated input (≤ 12 bytes), unknown version `v2:` and non-base64 input all reject. Two seals of the same plaintext differ. `importKek` rejects 31 and 33 bytes, non-base64 and empty input. Thrown messages never contain the plaintext. |
| `server/ai/config.test.ts` | Unset or `""` → off. Valid → on. 43 chars without `=`, 44 chars of wrong length, inner whitespace, `-_` (URL-safe) alphabet → `AiConfigError`. The message contains `AI_KEK`, never the value. |
| `server/ai/rateLimit.test.ts` | 30 saves pass and the 31st fails. One hour later (injected `now`) it passes again. Kinds are counted separately. A failed check records nothing. |
| `server/ai/validate.test.ts › parseSettingsBody` | `{provider, model}` ok. With `apiKey` ok. An extra key, a non-object, an array, `null`, a non-string provider/model/apiKey → `bad_request` |
| `server/ai/routes.test.ts › GET view shape` | No row → `{settings:null}`. With a row → exactly the 6 view keys. Masked hint. `modelSupported:false` for a model no longer in the catalog. `Cache-Control: no-store`. |
| `routes.test.ts › PUT validation` | `invalid_provider`, `invalid_model` (also `gemini` + any model), `invalid_key_format` (19 characters, inner space), `bad_request` (unknown field), 415 `unsupported_media_type`, 400 `invalid_json`, 413 `payload_too_large` above 4096 bytes |
| `routes.test.ts › PUT key handling` | A new key → `hasKey:true`, hint = last 4, and the stored ciphertext opens to the trimmed key. No key + same provider → key kept. No key + provider change with an existing key → 400 `key_required`; the store's transaction branch is covered by a fake that returns `key_required`. No row + no key → saved with `hasKey:false`. |
| `routes.test.ts › DELETE key` | Clears the key and returns the view with `hasKey:false`. Again → 200 (idempotent). No row → `{settings:null}`. |
| `routes.test.ts › rate limit` | The 31st PUT within an hour → 429 `rate_limited` |
| `routes.test.ts › routing and guards` | `POST /api/ai-settings` → 405 with `Allow: GET, PUT`. `GET /api/ai-settings/key` → 405 with `Allow: DELETE`. `/api/ai-settings/` and `/api/ai-settings/x` → 404. PUT/DELETE with `Sec-Fetch-Site: cross-site` → 403 `forbidden_origin`. `/api/ai-settings/key` is never answered `idInvalid` (proves dispatch happens before the UUID check). |
| `routes.test.ts › KEK off` | AC 4 (see the table above) |
| `routes.test.ts › store unavailable` | `pool: null` → 503 `db_unavailable` after input validation. Store throws a pg error with `code` `57P01` → 503 `db_unavailable`; any other error → 500 `internal` with `requestId`. The log entry has only `code`/`constraint`/`routine` (`dbLogFields`). |
| `routes.test.ts › sentinel never leaves the server` | AC 1. Sentinel `sk-ant-SENTINEL-0123456789abcdef`. A store fake that throws an error whose `message`/`detail` contain the sentinel proves that nothing echoes it. |
| `server/ai/store.db.test.ts` (`describe.skipIf(!dbAvailable)`, `createTestDb`, real migrations) | A second row (`id=false` → 23514; `id=true` duplicate → 23505) is rejected. A bad provider, a bad model, ciphertext without a hint, a 5-character hint, and ciphertext without `v1:` are rejected (23514). `updated_at` trigger fires. `save` → `get` round trip. Key kept on a same-provider save. `key_required` on a provider change (insert a row with provider `gemini` directly). `clearKey`. Sentinel: `select key_ciphertext` does not contain the sentinel, and `openKey` with the test KEK returns it. |
| `server/index.cli.test.ts › no AI_KEK: logs 'ai not configured'` and `› valid AI_KEK: logs 'ai configured', value not printed` and `› malformed AI_KEK exits 2 with 'config error: …AI_KEK…' and no value` | C3, AC 4 |
| `src/shared/ai/errors.test.ts` | Unchanged. The existing "every server code has 4xx/5xx" covers the 4 new codes. |

## Approach
1. **Migration** `db/migrations/20261112160000_ai_settings.sql`:
   - Header like `init.sql`: T-018, D25 (no RLS, no `user_id`; one row), D30.
   - Manual rollback block: `drop table ai_settings;` (destroys the saved key). `set_updated_at()` is shared and stays.
   - Table, as in the DB consult plus `id boolean`:
     ```sql
     create table ai_settings (
       id             boolean primary key default true check (id),
       provider       text not null check (provider in ('claude','gemini')),
       model          text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
       key_ciphertext text check (key_ciphertext is null or key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9+/=]+$'),
       key_hint       text check (key_hint is null or key_hint ~ '^[!-~]{4}$'),
       key_updated_at timestamptz,
       created_at     timestamptz not null default now(),
       updated_at     timestamptz not null default now(),
       constraint ai_settings_key_pair_chk check ((key_ciphertext is null) = (key_hint is null))
     );
     ```
   - Trigger `ai_settings_updated_at before update … execute function set_updated_at()`.
   - Name the inline checks `ai_settings_<what>_chk` if the implementer prefers explicit names.
   - Do not use `begin`, `commit`, `grant`, `end`, `create extension`, or these words in trailing comments or
     literals (DB consult). Do not seed a row.
2. **Pure ports** (`server/ai/{catalog,validate,mask,crypto,config,rateLimit}.js`):
   - Use `// @ts-check` and JSDoc, following `server/drive.js`.
   - Port the logic line for line from `src/shared/ai` and `supabase/functions/_shared/core/crypto.ts`.
   - Do not use `class X { constructor(readonly …) }` parameter properties (architect F3).
3. **Store** (`server/ai/store.js`):
   - Use `pool.connect()` with `begin`, `select … from ai_settings for update`, then the decision, then
     `insert … on conflict (id) do update …`, then `commit`, and `rollback` + release on any error. Same pattern as
     `saveItem` in `server/items.js`.
   - Sealing happens **before** the transaction. It needs only the requested provider.
   - `key_updated_at = now()` only when a new key is written.
   - Map rows to `{provider, model, keyHint, updatedAt: ISO}`. The view mapping lives in `routes.js` (`toView`, as in
     T-009).
4. **Routes** (`server/ai/routes.js`):
   - Order of checks:
     1. `ai === null` → 503 `server_misconfigured`.
     2. PUT only: limiter `save` → 429 `rate_limited`.
     3. PUT: `readJson(req, {limit: MAX_BODY_BYTES})`. On 413, use the same `Connection: close` handling as
        `api.js`.
     4. `parseSettingsBody` → `bad_request`.
     5. `isAllowedProvider` / `isAllowedModel` / `validateApiKeyFormat`.
     6. `store` missing (`pool` null) → 503 `db_unavailable`.
     7. The store call, inside `try`/`catch` with `mapDbError` and `dbLogFields`, like `api.js` lines 122-127.
   - Logging: only `{event:"ai_settings", id, action, code}`. Never the body, the key, the hint or error objects.
   - `setRoute` templates are `/api/ai-settings` and `/api/ai-settings/key`.
5. **Wiring:**
   - `api.js`: `match()` adds `{route:"/api/ai-settings", allow:"GET, PUT"}` (parts length 3) and
     `{route:"/api/ai-settings/key", allow:"DELETE"}` (parts length 4, `b === "key"`).
   - `handleApi` dispatches to `handleAiSettings` right after the `Sec-Fetch-Site` check. The origin guard stays
     shared.
   - `app.js` creates the store as `ai?.store ?? (pool ? createAiStore(pool) : null)`, so route tests inject a fake
     store and still go through the real Access → `/api` path. It also creates one limiter (with the app's `now`).
   - `index.js` loads the config after the Drive block and imports the CryptoKey once (non-extractable).
6. **Shared tree** (C4):
   - Add the 4 codes to `src/shared/ai/errors.ts`, then `cp` it to `supabase/functions/_shared/ai/errors.ts` and run
     `pnpm format`.
   - The server copy goes into `server/ai/catalog.js`. `parity.test.ts` guards it.
7. **Image check:** see `check-image.sh` under *Files*. Drive pattern: the server must exit 2 on a malformed value
   with no network.
8. **Docs and decisions:**
   - **D30** (2026-11-12, "AI settings on the Node server (amends D21)"):
     - AI is available in **API mode only**. Local mode and the Figma Make preview are unchanged.
     - One `ai_settings` row (provider, model, AES-256-GCM `v1:` ciphertext, 4-character hint). No RLS (D25).
     - KEK: repository secret `TUDOCUATUI_AI_KEK` (D28 pattern) → container env `AI_KEK`. Unset → AI routes 503
       `server_misconfigured`. Malformed → exit 2.
     - AAD `tudocuatui-ai-key|v1|single|<provider>`. Adding users later means keys are re-entered.
     - Losing the KEK means re-entering the key. Rotation is not implemented; the `v1:` prefix leaves room for it.
     - The KEK and the ciphertext sit on the same host, so encryption protects dumps and backups, not a compromised
       host.
     - The server uses JS ports of `src/shared/ai`, kept equal by `server/ai/parity.test.ts`. D26 is unchanged.
     - Rate limits are in memory.
     - Why: Ming 2026-11-12, "ok" to T-010 Q1–Q3, and T-018 plan approval. Tickets: T-018, T-010, F-701, F-702, T-016.
   - **T-010 note:** "2026-11-12: backend is T-018 (D30): REST `/api/ai-settings` (GET/PUT), `/key` (DELETE), `/test`
     (POST, T-018.2); `{settings: AiSettingsView|null}`. Generic `/api` codes (`invalid_json`,
     `unsupported_media_type`, `forbidden_origin`, `db_unavailable`) are in `AI_ERROR_STATUS`. An expired Access
     session shows up as a redirect/network error on fetch, not a 401: show 'đăng nhập lại'."
   - **F-701 note:** "re-plan on the Node server (D30); reads settings via `server/ai/store.js` and opens the key with
     `server/ai/crypto.js`; depends on T-018.2", and set `Depends on` to `T-018.2`.
   - **F-702 note:** "'Supabase mode only' → 'API mode only' (D30)".
   - **T-016 note:** "T-018 adds `server/ai/*.js`, mirrors of `src/shared/ai`, enforced by `server/ai/parity.test.ts`.
     When removing `supabase/`, the line-1 header of `src/shared/ai/*.ts` should say 'mirrored by `server/ai/*.js`;
     `server/ai/parity.test.ts` enforces equality'. Keep `AI_KEK` and `ai_settings` in `boundary.test.ts`
     `FORBIDDEN`. Whichever lands second rebases."
9. **Rules:**
   - R1: no `src/` runtime change, so local mode and the Figma Make preview are unchanged. AC 5 checks the diff.
   - R2/D25: a new migration file, no RLS by decision, never an edit to an applied one. No `src/types/database.ts`
     regeneration (that is Supabase-only; T-016 deletes it).
   - R3: the KEK lives only in the server env, the key never leaves the server, and the boundary test plus
     `check-image.sh` enforce it.
   - R5: no derived value is stored.
   - R7: anything else found goes to impl-log follow-ups.
   - R8: unit and DB tests above, plus a coverage threshold.
   - R10: untouched.
   - R4, R6 and R9: not applicable (no photos, no UI).

## Specialist input used
- **software-architect:**
  - Adopted: F1 → C1/R-1 (JS port plus parity test), F2 → dispatch before the UUID check, F3 (REST shapes, no
    `parseRequest`, no `class Fail` parameter properties), F4 → C4, F5 (no CORS/origins env; the shared guard and
    `readJson` are the CSRF defence), F7 (boundary names), F8/R-11 (do not touch T-016-owned headers; note on
    T-016), F9/R-12 (D30, F-701 depends on T-018.2), R-3 contract, R-4 (config, exit 2, `check-image.sh`), R-5 (AAD,
    tests), R-8 store interface, R-9 (in-memory limiter), R-10 (sentinel scope).
  - Deferred to T-018.2: F6/R-6 (deploy wiring, envfile validation, five-secret test, README, compose comment,
    M-16), R-7 (Claude `fetch`).
  - Rejected: alternatives (b) TS in the image and (c) a top-level `shared/` module (R-1). Fragile, or too large for
    this ticket.
- **database-optimizer:**
  - Adopted: file name and header convention, forbidden-word caution, no grants, no seed row, one `v1:` text column,
    the key-pair check, ciphertext and hint format checks, `created_at`, keep `key_updated_at` (Q3), table name
    `ai_settings` (Q2), no rate-limit table (Q1), a DB test for the singleton and constraints, a repo-level sentinel
    test, the rollback block.
  - Adopted with a change: the singleton type (boolean, as recommended; the architect's smallint is rejected).
  - Rejected: "1 call per few seconds" (see the disagreement note) and catalog defaults on GET without a row (C7).

## Assumptions
Consult defaults, adopted. Ming confirms them at plan approval.
- **A1** (architect Q1): the container env is `AI_KEK` and the repo secret is `TUDOCUATUI_AI_KEK` (C2).
- **A2** (architect Q2): a JS port plus a parity test. No D26 change (C1).
- **A3** (architect Q3): a malformed KEK exits 2. Unset means 503 on AI routes only (C3).
- **A4** (architect Q4): the 4 generic `/api` codes are added to `AI_ERROR_STATUS` and used as they are (C4).
- **A5** (architect Q5, DB Q1): in-memory limits, `save` 30/h and `test` 20/h, no table (C5).
- **A6** (architect Q6): Bitwarden backup in the personal collection, as a human step only (C13).
- **A7** (DB Q2/Q3): table `ai_settings`. Keep `key_updated_at`. It is not exposed in the view for now, because the
  `AiSettingsView` shape is unchanged.
- **A8:** the split T-018.1 / T-018.2 (C9). T-010 waits for T-018.2, and F-701 depends on T-018.2.
- **A9:** without the KEK, GET also answers 503 (C8).
- **A10:** D16 lets this branch edit other tickets' `ticket.md` notes (T-010, F-701, F-702, T-016), because the
  ticket scope asks for it. Only `work/backlog.md` is main-only. T-010 has its own branch `ticket/T-010` with a plan:
  whichever lands second rebases its `ticket.md`.
- **A11:** listing `TUDOCUATUI_AI_KEK` in the workspace `secrets.refs.yaml` (name only) is Ming's call. It is outside
  this repo and not part of this ticket.
- **A12:** `migrate` also receives `AI_KEK` through the shared `env_file` (T-018.2). It is accepted (no egress) and
  recorded as a `debt` follow-up: a separate env file for `migrate`.

Other assumptions:
- **Hotspots:**
  - T-016 (BLOCKED, plan approval pending in ming-todo) also edits `src/shared/ai/boundary.test.ts` (`FORBIDDEN`),
    `src/shared/ai/errors.ts` (line 1 only), `vitest.config.ts`, deletes `supabase/functions/_shared/ai/errors.ts`
    and may touch `scripts/check-image.sh`. These are expected trivial rebases.
  - T-010 (BLOCKED, branch `ticket/T-010`) edits its own `ticket.md`.
  - No other open ticket touches `server/api.js`, `server/app.js` or `server/index.js`. `src/App.tsx` is not
    touched.
- `tsconfig.server.json` with `allowImportingTsExtensions` typechecks `src/shared/ai/*.ts` under `lib: ES2023`. They
  use no DOM API, so this is expected to work. If it fails, the implementer stops and records it (no silent
  `@ts-nocheck`).
- The migration timestamp must sort after every migration on `main` at rebase time. An out-of-order pending file
  fails the runner.
- Losing the KEK makes the stored key unreadable (`key_unreadable` in T-018.2). Re-entering the key fixes it.
  Rotation is out of scope (ticket).

## Blocking questions
None.

## Split proposal
Estimate for the whole ticket: about 600 production lines, 700 test lines and 150 deploy/doc lines. That is well
over one implement/review cycle.

- **T-018.1 (this plan):** schema, crypto, KEK config, store, `GET`/`PUT`/`DELETE`, the parity test, the boundary
  and image checks, D30 and the ticket notes. ACs 1, 2, 4, 5 (plus 6 and 7). Nothing new to deploy: without a KEK
  the routes answer 503.
- **T-018.2 (orchestrator creates the ticket; `Depends on: T-018.1`; High: deploy workflow;
  `Gate: plan-approval`):**
  - `POST /api/ai-settings/test`:
    - `store.getSecret()`.
    - `openKey` failure → 409 `key_unreadable`.
    - No key → 409 `not_configured`.
    - Unsupported model → 400 `invalid_model`.
    - Limiter `test` 20/h.
    - The body must be `{}` with `Content-Type: application/json`.
  - `server/ai/providerErrors.js`: the Claude half of `mapClaudeError`.
  - `server/ai/claude.js`:
    - Injected `fetch`, `GET https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`.
    - Headers `x-api-key` and `anthropic-version: 2023-06-01`; `redirect:"error"`; `AbortSignal.timeout(10_000)`.
    - Read only `res.status`, cancel the body. Network error or timeout → `provider_unavailable`.
    - Tests use a fake fetch that asserts the sentinel appears only in `x-api-key` sent to the pinned host.
    - Extend the sentinel test to `test`. This is ticket AC 3.
  - Deploy drafts:
    - `deploy-tudocuatui.yml` envfile step: `AI_KEK: ${{ secrets.TUDOCUATUI_AI_KEK }}`, independent of the Drive
      group, validated `^[A-Za-z0-9+/]{43}=$`, appended with `printf`.
    - `scripts/deploy-envfile.test.ts`: five secrets, format cases, "unset leaves the line out".
    - `deploy/deployment-repo/README.md`: section "AI key encryption (T-018)".
    - `compose.yml`: comment only, including fixing the stale "GitHub environment".
  - **M-16** in `work/ming-todo.md`:
    1. Generate on the Mac with `umask 077; openssl rand -base64 32 > ~/.config/tudocuatui/ai-kek.txt`. Never print
       it.
    2. Save it in Bitwarden (personal collection).
    3. `gh secret set TUDOCUATUI_AI_KEK -R mmlabs-online/deployment < ~/.config/tudocuatui/ai-kek.txt`.
    4. Delete the file.
    5. Merge the setup PR the orchestrator opens with the workflow draft (non-`release/` branch).
    6. Run `workflow_dispatch`. The logs show `ai configured`.
    7. `GET /api/ai-settings` in the browser returns `{"settings":null}`.
  - Rollout order does not matter: an old image ignores `AI_KEK`.
