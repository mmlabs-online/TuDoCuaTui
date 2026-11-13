# Security review — T-018 (slice T-018.1)

## Attempt 1 — 2026-11-12 (security-ai-generated-code-auditor, read-only)

**Verdict: no 🔴 findings. Nothing blocks a PASS on security grounds.** There are 2 🟡 items. Both are hardening for T-018.2, and one is already tracked. The rest are 🟢 notes.

Files read: `server/ai/{crypto,config,routes,store,rateLimit,validate,mask}.js`, `server/{api,app,index,errors,http}.js`, `db/migrations/20261112160000_ai_settings.sql`, `src/shared/ai/boundary.test.ts`, `scripts/check-image.sh`, the sentinel section of `server/ai/routes.test.ts`, the `plan.md` criteria and `impl-log.md`. I did not run any tests or checks.

### Findings, by checklist item

**1. The key never leaves the server: confirmed**
- **Responses:** they only carry `toView` (`server/ai/routes.js:22-32`): provider, model, a masked 4-character hint, `hasKey`, `modelSupported` and `updatedAt`. `store.js:14` (`COLUMNS`) never selects `key_ciphertext`, so the ciphertext doesn't leave the DB layer either.
- **Logs:** `fail()` (`routes.js:47-50`) logs only `{event, id, action, code}`. The DB error path (`routes.js:90-95`) uses `dbLogFields` (`server/errors.js:35-44`), which keeps only code, constraint and routine. So pg `detail` ("Failing row contains …") and `message` are never logged.
- **Error bodies:** they only carry fixed codes plus `requestId`. If `sealKey` throws outside the `try` (`routes.js:77`), the outer handler (`server/app.js:102-109`) logs only name and code and returns 500 `internal`. That is safe.
- **Startup errors:** the fatal handler (`server/index.js:18-23`) prints only `err.code`.
- **Tests:** the sentinel test (`routes.test.ts:292-316`) covers PUT ok, invalid model, an unknown field, bad JSON, an oversize body, a DB error whose `detail` and `message` contain the sentinel, GET and DELETE. It checks bodies, headers and logs. The coverage is good.

**2. Crypto: correct**
- The KEK is imported as `raw` AES-GCM with `extractable: false` and usages encrypt/decrypt only (`server/ai/crypto.js:34`). The length is enforced at exactly 32 bytes (`:33`).
- Each seal uses a fresh random 12-byte IV from `crypto.getRandomValues` (`:39`). Tags are the default 128 bits.
- The AAD is `tudocuatui-ai-key|v1|single|<provider>` (`:12-13`). This binds the ciphertext to the provider and the format version.
- The store keeps the AAD consistent. If the provider changes without a new key, the save is refused with `key_required` (`store.js:44-47`), so a key sealed for one provider is never kept under another.
- Version and format handling: the strict `v1:` prefix (`:56`), strict base64 (`:9`, `:17`) and a minimum length (`:58`) all fail closed. Tampering is caught by GCM auth.
- The format is always `v1:` + base64, and the DB check (`migration:15`) matches it.

**3. KEK loading: correct**
- Unset or empty means AI is off. `ai` is null, and the AI routes return 503 `server_misconfigured` (`routes.js:43`) only after routing, the 405 check and the origin guard. The rest of the API is unaffected.
- A malformed value raises `AiConfigError`. The message names only the variable (`config.js:14-15`), and `index.js:58-60` prints `config error: …` and exits 2. Whitespace-only and trailing-newline values also exit 2, which fails closed.
- The KEK is imported once at startup.

**4. Guards: in place**
- Cloudflare Access is verified for every `/api/*` path before `handleApi` (`app.js:76-84`).
- The 405 check and the `Sec-Fetch-Site` write guard run before AI dispatch (`api.js:59-69`). AI dispatch comes before the UUID check, as the plan requires.
- PUT goes through `readJson` with `limit: MAX_BODY_BYTES` (4096) (`routes.js:56`, `validate.js:5`). That enforces content type `application/json` (415 otherwise) and the size limit using both Content-Length and a streaming count, closes the socket on 413, and decodes strict UTF-8.
- Requiring a JSON content type also forces a CORS preflight for any cross-origin write, which is a second layer of CSRF protection.

**5. PUT body strictness: good**
- `parseSettingsBody` (`validate.js:40-51`) rejects non-objects, arrays and unknown keys. A JSON `__proto__` key is an own key, so it is rejected too.
- Types are strict.
- Provider and model must match the catalog exactly. The `includes` check guards against values like `"toString"`.
- The key must be 20 to 256 printable ASCII characters after trimming.
- Validation happens before sealing, so an invalid request never touches the KEK.

**6. Rate limiter: fine for one user behind Access**
- Save is limited to 30 per hour, checked before the body is read (`routes.js:55`). A refused check records nothing, and memory is capped at `max` entries per kind.

**7. Migration: matches D25 and the plan**
- No grants and no RLS.
- A singleton row (`id boolean primary key check (id)`).
- Checks on provider, model, ciphertext format and hint format, plus the pair constraint between ciphertext and hint (`migration:11-21`).
- An `updated_at` trigger and a documented manual rollback.

**8. R3 bundle boundary: holds**
- Nothing under `src/` imports `server/` or names `AI_KEK` or `ai_settings` (checked by grep). The only `VITE_*` value is the existing anon key (`src/lib/supabase.ts:5`).
- `boundary.test.ts:7-15` now forbids `AI_KEK` and `ai_settings`, and checks that `.env.example` contains no AI or KEK names.
- `check-image.sh:58` adds `AI_` to the image env allowlist check, and `:114` adds the malformed-KEK exit-2 check.

### 🟡 Medium
- **🟡 Y1. In dev mode with Access turned off and a KEK set, the AI routes have no authentication** (`server/index.js:52-61`, `app.js:78`, the listener is on `0.0.0.0` at `index.js:71`).
  - `TUDO_ACCESS_DISABLED=1` is refused in production (`access.js:28-30`, `check-image.sh:110`), so this only affects non-production runs.
  - In T-018.2, `POST /test` will spend the real key. Anyone on the same LAN as a dev server could then set or replace the key or trigger provider calls.
  - Recommendation for T-018.2, not this slice: refuse to enable AI when `access.mode === "off"`, or at least log `ai configured with access OFF` loudly. Binding dev servers to `127.0.0.1` would also help.
- **🟡 Y2. The `migrate` container will receive `AI_KEK` through the shared env file** (plan A12). This is already accepted and should stay a `debt` issue. It widens the KEK's exposure to a process that never needs it. Please check that the debt issue really was filed.

### 🟢 Low / notes
- **🟢 G1:** after `importKek`, `process.env.AI_KEK` is still set (`index.js:56`). Running `delete process.env.AI_KEK` right after the import would keep it away from any future child process, env-dumping error reporter or debug endpoint. This is a one-line change and could go to T-018.2.
- **🟢 G2:** `openKey` throws errors that differ by cause: `unreadable`, `bad_base64`, or a WebCrypto `OperationError` (`crypto.js:17,56,58,59`). Slice 1 never calls `openKey` from a route. T-018.2 should map every failure to one code (for example `key_unreadable`) and never log the error object or its message. That avoids leaking which check failed and keeps the "fixed log fields" rule.
- **🟢 G3:** `importKek` trims its input (`crypto.js:29`) but `loadAiConfig` does not (`config.js:14`). This is harmless because the config check runs first and fails closed. It is only an inconsistency.
- **🟢 G4:** `DELETE /api/ai-settings/key` has no rate limit. That is acceptable: it is idempotent, cheap, behind Access and can only remove data. It is noted only to complete the rate-limiter review.
- **🟢 G5:** the plaintext `key_hint` stores the last 4 characters and returns them masked. This is the accepted design. With a 20-character minimum key, it reveals a negligible amount of entropy.
- **🟢 G6:** the `check-image.sh:114` exit-2 check discards stderr, so it doesn't prove the value is absent from the output. That property is covered by `index.cli.test.ts` (per `impl-log.md`), so no change is needed. Adding a `grep -v` on the dummy value would be cheap extra coverage.

### Recommendations
- **Plan criterion AC1 (the key never appears in any endpoint, log or error):** met. No change needed.
- **AC4 (an unset KEK only disables the AI routes; a malformed one exits 2):** met.
- **R3:** met.
- **Carry into the T-018.2 plan:**
  - Y1: refuse AI, or warn loudly, when Access is off.
  - G1: `delete process.env.AI_KEK` after import.
  - G2: one error code for every `openKey` failure, and no error objects in logs.
  - Add a `/test` case to the sentinel test that includes a provider error body echoing the key.

### Risks
- The rate limits live in memory, so a restart resets them. That is accepted under C5.
- KEK rotation has no re-seal path. Losing or changing the KEK means re-entering the key, which `decisions.md` records as D30. Back up the KEK separately from DB backups.
- The ciphertext is in DB backups. That is safe only while the KEK is not stored alongside those backups.

### Open questions
1. Was the `debt` issue for A12 (a separate env file for `migrate`) actually filed in the workspace repo? `impl-log.md` says to "keep" it, but I can't see the issue from here.
2. Should AI be refused when Access is off (Y1)? My proposed default: yes, starting in T-018.2, with a clear log line at startup.
