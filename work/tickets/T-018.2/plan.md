Status: READY

# Plan — T-018.2: AI key test endpoint and the AI_KEK deploy wiring

This ticket is High tier (`Gate: plan-approval`), so the loop stops here until Ming writes "Plan approved". Each
place where the plan departs from the ticket text is listed as **C1–C6** under *Changes vs ticket scope*. The
consult's open questions and the T-018.1 security follow-ups are adopted as defaults **A1–A12**. Nothing blocks
planning.

## Feature summary
- Ticket goal: "Ming can check that the saved AI key works (`POST /api/ai-settings/test`), and the deploy delivers the
  KEK to the server, so AI settings work on the real app."
- This is the second slice of T-018. `work/tickets/T-018/plan.md` *Split proposal* says: "T-018.2 … `POST
  /api/ai-settings/test`: `store.getSecret()`. `openKey` failure → 409 `key_unreadable`. No key → 409
  `not_configured`. Unsupported model → 400 `invalid_model`. Limiter `test` 20/h. The body must be `{}` with
  `Content-Type: application/json`." Ming approved the split on 2026-11-12: "Plan approved (T-018), chia 2".
- `docs/feature-list.md` E7, F-701 says: "Calls a vision LLM server-side; the API key lives only in Supabase secrets".
  D21, D30 and D33 amend this.
- **D30** (2026-11-12) says: "AI is available in **API mode only** … KEK: repository secret `TUDOCUATUI_AI_KEK` (D28
  pattern) becomes container env `AI_KEK`; unset: AI routes answer 503 `server_misconfigured`; malformed: the server
  exits 2. … Rate limits are in memory (save 30/h, test 20/h)."
- **D33** (2026-11-13, amends D30) says: "`ai_settings` is one row per user, bring-your-own-key; AAD
  `tudocuatui-ai-key|v2|<sub>|<provider>`; legacy `v1` ciphertext cleared; AI rate limits per user." D33 is
  implemented by **T-019.3**, not by this ticket. This ticket only shapes the seams for it (consult R2).
- **D28** says: "repository secrets of `mmlabs-online/deployment`, not a GitHub environment".
- Ming's notes on the ticket (2026-11-12, from the T-018.1 security review) say: "refuse AI or warn loudly when
  Cloudflare Access is off (Y1); `delete process.env.AI_KEK` after import (G1); map every `openKey` failure to one
  code, never log the error object (G2); add a `/test` sentinel case with a provider error body echoing the key."

### Changes vs ticket scope (for Ming's approval)
| # | Ticket says | Plan does | Why |
|---|---|---|---|
| C1 | Files: `server/ai/{routes,claude,providerErrors}.js` | Also edits `server/ai/{store,crypto,config,validate}.js`, `server/{api,app,index}.js` and their tests | `getSecret()` does not exist yet (consult F2). The route needs a match in `api.js` and an injected `fetch` in `app.js`. G1 and Y1 live in the startup path (A1, A2). G2 needs one helper (`openStoredKey`). |
| C2 | (Y1 note: "refuse AI or warn loudly") | **Refuse**: with request auth off (`access === null`), AI is disabled. The log says `ai disabled: request auth off`, and the AI routes answer 503 `server_misconfigured`. A malformed KEK still exits 2. | A1. Consult R5 and the security review's proposed default. |
| C3 | Body must be `{}` | The body must be exactly `{}`. Any field is `400 bad_request`, **explicitly including `apiKey`**, and in that case no provider call is made. | Consult R3: the endpoint must never become a key-validity oracle. |
| C4 | `compose.yml`: "comment fix only" | Comment only. Fix the stale "GitHub environment `tudocuatui`" wording (D28). Name `AI_KEK` as a line in the env file. Note that `migrate` receives it but never reads it (T-018 A12). | Consult F4 |
| C5 | — | Add a dated forward note to `work/tickets/T-019.3/ticket.md`. Its `Depends on` field does not change. | A5, consult R7 |
| C6 | `server/ai/claude.js` maps errors | `claude.js` stays a pure adapter, `checkClaudeKey({fetch, key, model, timeoutMs?})`. It knows nothing about the store, the KEK, users or the limiter. | Consult R2. F-701 reuses it, and T-019.3 does not touch it. |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `POST /api/ai-settings/test` maps provider failures to `AiErrorCode` values. Fake-fetch unit tests cover invalid key, forbidden, model unavailable, rate limited, provider unavailable, timeout/network, `key_unreadable` and `not_configured`. | `server/ai/providerErrors.test.ts` (the status table). `server/ai/claude.test.ts` (request shape, timeout, network, body cancelled). `server/ai/routes.test.ts › POST /test` covers the end-to-end status and code for each case: 200 `{ok:true}`; 401→422 `invalid_key`; 403→422 `key_forbidden`; 404→422 `model_unavailable`; 429→429 `provider_rate_limited`; 500/529→502 `provider_unavailable`; timeout and network→502 `provider_unavailable`; no row or no key→409 `not_configured`; ciphertext under another KEK→409 `key_unreadable`; stored model not in the catalog or provider `gemini`→400 `invalid_model`. |
| 2 | The key sentinel appears only in the `x-api-key` header sent to the pinned Anthropic host. It never appears in responses, logs or error messages. | `claude.test.ts › sends the key only in x-api-key to the pinned URL`. `routes.test.ts › sentinel never leaves the server` is extended to cover `/test` in these cases: success; a 401 whose body echoes the sentinel; a fetch that rejects with an Error whose message contains the sentinel; and a body `{"apiKey": SENTINEL}`. Each case checks the response body, the headers and every log entry (JSON-stringified). The fake fetch records every call. Exactly one call goes to `https://api.anthropic.com/v1/models/<model>`, and the sentinel appears in no part of that call except `headers["x-api-key"]`. |
| 3 | The envfile step writes `AI_KEK` only when the secret is set and well formed, and fails on a malformed value. `deploy-envfile.test.ts` covers this. | `scripts/deploy-envfile.test.ts`: the new cases listed under *Tests to write*. The static check maps exactly five secrets. |
| 4 | Checks are green, and local mode is unchanged (R1). | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. `git diff --stat main -- src/` is empty. `store.db.test.ts` runs with `TEST_DATABASE_URL` (required in CI; locally if a Postgres is available, and the reviewer records which). |
| 5 | (G2) Every `openKey` failure becomes the single code `key_unreadable`, and no error object is logged. | `server/ai/crypto.test.ts › openStoredKey`. `routes.test.ts › key_unreadable log has fixed fields only`. |
| 6 | (G1, Y1) Startup removes `AI_KEK` from the environment, and AI is refused when request auth is off. | `server/ai/config.test.ts › initAi` (pure). `server/index.cli.test.ts`: with Access on and a valid KEK, the log says `ai configured`. With Access off and a valid KEK, the log says `ai disabled: request auth off` and `/api/ai-settings` returns 503 `server_misconfigured`. With Access off and a malformed KEK, the server still exits 2. |

## Ming verification after merge
- **M-16** (added to `work/ming-todo.md` by this ticket) covers: generate the KEK, save it in Bitwarden, set the
  repository secret, delete the local file, merge the setup PR, run `workflow_dispatch` and check that the logs show
  `ai configured`, and check that `GET /api/ai-settings` returns `{"settings":null}`.
- **Optional real-key check** (A3): save a Claude key, then call `POST /api/ai-settings/test`. Expect `{"ok":true}`.
  A wrong key should give `invalid_key`. M-16 gives a browser-console snippet for this, because T-010 has no UI yet.
  Note that T-019.3 will clear this key later, and Ming will need to enter it again.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/ai/providerErrors.js` | create | Ticket scope. Exports `mapClaudeError(status)`, which returns an `AiErrorCode`. |
| `server/ai/claude.js` | create | Ticket scope. Exports `CLAUDE_MODELS_URL` (a constant) and `checkClaudeKey({fetch, key, model, timeoutMs = 10_000})`, which returns `{ok:true} \| {ok:false, code}`. |
| `server/ai/crypto.js` | modify | G2 / consult R2. Add `openStoredKey(kek, secret)`, which returns `{ok:true, key} \| {ok:false, code:"not_configured"\|"key_unreadable"}`. `openKey`, `sealKey` and the AAD stay unchanged. |
| `server/ai/store.js` | modify | Add `getSecret()`, which returns `{provider, model, ciphertext} \| null` using SQL only (consult F2/R2). Extend the `AiStore` typedef. |
| `server/ai/validate.js` | modify | Add `parseTestBody(body)`: only `{}` passes, anything else is `bad_request` (C3). |
| `server/ai/routes.js` | modify | Add the `POST /api/ai-settings/test` handler, and add `fetch` to the `AiContext` typedef. |
| `server/ai/config.js` | modify | Add `initAi(env, {requestAuth, importKek})`. It contains G1 and Y1 as a pure, testable function (A1, A2). |
| `server/api.js` | modify | `match()` gets `{route:"/api/ai-settings/test", allow:"POST"}`, with parts length 4 and `b === "test"`. |
| `server/app.js` | modify | The `ai` dep accepts an optional `fetch`. `aiContext.fetch = ai.fetch ?? globalThis.fetch`. |
| `server/index.js` | modify | Replace the AI block with `initAi(process.env, {requestAuth: access !== null, importKek})`, and log its line. |
| `server/ai/providerErrors.test.ts` | create | AC 1 |
| `server/ai/claude.test.ts` | create | AC 1, AC 2 |
| `server/ai/crypto.test.ts` | modify | AC 5 |
| `server/ai/validate.test.ts` | modify | `parseTestBody` |
| `server/ai/config.test.ts` | modify | AC 6 |
| `server/ai/routes.test.ts` | modify | AC 1, 2, 5: the fake store gets `getSecret`, the `start()` helper gets `fetch`, and the new describe blocks |
| `server/ai/store.db.test.ts` | modify | `getSecret` |
| `server/index.cli.test.ts` | modify | AC 6. The existing test "valid AI_KEK: logs 'ai configured'" runs with Access off today, so it switches to fake `CF_ACCESS_*` values. |
| `server/README.md` | modify | AI section: the `/test` endpoint and its codes, `test` 20/hour, the Y1 rule. In the env table, the `AI_KEK` row says it is removed from `process.env` after import. |
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | modify | Envfile step: `AI_KEK: ${{ secrets.TUDOCUATUI_AI_KEK }}`, the format check and the `printf` line. Update the header comment. |
| `scripts/deploy-envfile.test.ts` | modify | AC 3 |
| `deploy/deployment-repo/README.md` | modify | Add the section "AI key encryption (T-018)" and a table row for the setup PR. |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | modify | Comment only (C4) |
| `work/ming-todo.md` | modify | Add M-16 in a new section `### T-018.2 — AI key encryption (D30)`, placed before the T-019 section. |
| `work/tickets/T-019.3/ticket.md` | modify | Append one dated note under *Notes / answers from Ming* (C5, A5). |
| `work/tickets/T-018.2/impl-log.md` | create | Implementer log |

**Not touched:** `src/**` (R1), `db/migrations/**` (no schema change), `scripts/check-image.sh` (it already
allow-lists `AI_` and checks that a malformed `AI_KEK` exits 2), `server/ai/rateLimit.js` (A4), `server/ai/catalog.js`
(every code already exists), `package.json` (no SDK), `work/backlog.md` (D16), `work/decisions.md` (no new decision;
A1 is a T-018 security follow-up), and `vite.config.ts` and `AGENTS.md` (R10).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `providerErrors.test.ts › maps Claude statuses` | 401→`invalid_key`; 403→`key_forbidden`; 404→`model_unavailable`; 429→`provider_rate_limited`; 500, 502, 503 and 529→`provider_unavailable`; any other status (400, 408, 418, 0) also gives `provider_unavailable`. Every result is a key of `AI_ERROR_STATUS`. |
| `claude.test.ts › sends the key only in x-api-key to the pinned URL` | The fake fetch records `(url, init)`. Check: `url === "https://api.anthropic.com/v1/models/claude-haiku-5-5"`, `method` is `GET`, `redirect` is `"error"`, the headers are exactly `{"x-api-key": SENTINEL, "anthropic-version": "2023-06-01"}`, `init.signal` is an `AbortSignal`, and there is no `body`. The sentinel is absent from `url` and from every other init field. |
| `claude.test.ts › model id is URL-encoded` | The model `a/b` goes into the URL as `a%2Fb`. This is defence in depth: the route only passes catalog ids. |
| `claude.test.ts › 200 → ok; non-2xx → mapped code` | 200 gives `{ok:true}`. 401, 403, 404, 429 and 500 each give the mapped code. |
| `claude.test.ts › reads only the status and cancels the body` | The fake response's `body.cancel` is called on both success and error. Calling `json()`, `text()` or `arrayBuffer()` would throw, which proves they are never called. A 401 body that contains the sentinel is never read, and the returned object has only `ok` and `code`. |
| `claude.test.ts › network error, redirect error, timeout → provider_unavailable` | Covers fetch rejecting with `TypeError("fetch failed: " + SENTINEL)` (the result does not contain the sentinel), and with a `TimeoutError` `DOMException`. A real timeout uses `timeoutMs: 20` and a fetch that waits on `init.signal`. |
| `crypto.test.ts › openStoredKey` | `null` gives `not_configured`. A round trip gives `{ok:true, key}`. A wrong KEK, wrong provider, one flipped byte, a `v2:` prefix, non-base64 input and truncated input all give `{ok:false, code:"key_unreadable"}` with no throw. A `console.error`/`console.log` spy is never called. |
| `validate.test.ts › parseTestBody` | `{}` passes. These give `bad_request`: `{apiKey:"x"}`, `{x:1}`, `[]`, `null`, `"{}"`, `0`, and `Object.create(null)` with one key. A JSON `{"__proto__":1}` (own key) also gives `bad_request`. |
| `config.test.ts › initAi` | A valid KEK with `requestAuth:true` returns `{ai:{kek}, line:"ai configured"}`. A valid KEK with `requestAuth:false` returns `{ai:null, line:"ai disabled: request auth off"}`. Unset gives `{ai:null, line:"ai not configured"}`. A malformed KEK throws `AiConfigError`, even with `requestAuth:false`. In **every** case `env.AI_KEK` is gone from the passed object afterwards, and `importKek` is not called when AI is refused or unset. |
| `routes.test.ts › POST /test results` | Each case from AC 1, through `createApp` with a fake store (`getSecret`) and a fake `fetch`. The success body is exactly `{ok:true}` with `Cache-Control: no-store`. The `invalid_model` and `not_configured` cases never call fetch. |
| `routes.test.ts › POST /test body and guards` | These give 400 `bad_request` and no fetch call: `{"apiKey": SENTINEL}`, `{"x":1}` and `[]`. A missing content type gives 415. Bad JSON gives 400 `invalid_json`. A body over 4096 bytes gives 413. `Sec-Fetch-Site: cross-site` gives 403 `forbidden_origin`. `GET /api/ai-settings/test` gives 405 with `Allow: POST`. `/api/ai-settings/test/x` gives 404. |
| `routes.test.ts › POST /test rate limit` | 20 calls pass and the 21st gives 429 `rate_limited`, with fetch called exactly 20 times. The limit is checked before the body is read, and a limited call never calls `getSecret`. 20 tests do not block a `PUT` (the kinds are separate). One hour later (injected `now`) calls pass again. |
| `routes.test.ts › POST /test KEK off / store unavailable` | With `ai: null`, the response is 503 `server_misconfigured`. With `pool: null`, it is 503 `db_unavailable`. `getSecret` throwing a pg `57P01` gives 503, and any other error gives 500 `internal` with `requestId`. The log uses `dbLogFields` only. |
| `routes.test.ts › key_unreadable log has fixed fields only` | A ciphertext sealed under another KEK. The log entry for `/test` has exactly the keys `{event, id, action, code}`, with `action:"test"` and `code:"key_unreadable"`. |
| `routes.test.ts › sentinel never leaves the server` (extended) | AC 2. Covers the `/test` cases listed there. The fake store's `getSecret` returns a real ciphertext of the sentinel under the test KEK. |
| `store.db.test.ts › getSecret` | No row gives `null`. A row without a key gives `null`. A row with a key gives `{provider, model, ciphertext}`, where `ciphertext` matches `^v1:` and opens to the key. |
| `index.cli.test.ts` | Valid KEK with fake `CF_ACCESS_*`: the log has `ai configured`. Valid KEK with `TUDO_ACCESS_DISABLED=1`: the log has `ai disabled: request auth off`, `/api/ai-settings` returns 503 `server_misconfigured`, and the value is not printed. Malformed KEK with Access off still exits 2. These tests replace the current "valid AI_KEK" test. |
| `deploy-envfile.test.ts › AI_KEK only (no Drive)` | The file is `DATABASE_URL` + `AI_KEK=<kek>\n`, with mode 600. The value is not in stdout or stderr. `changed=true`, then `false` on a re-run. |
| `deploy-envfile.test.ts › AI_KEK with all four Drive values` | The line order is DB, the four Drive lines, then `AI_KEK`. |
| `deploy-envfile.test.ts › unset or empty leaves the line out` | With `AI_KEK` absent and with `AI_KEK=""`, the file contains no `AI_KEK`. Removing the secret after a run with it gives `changed=true` and the line disappears. |
| `deploy-envfile.test.ts › malformed AI_KEK: exit 1, file unchanged, value not printed, no temp left` | Cases: 43 characters without `=`; 42 characters plus `==`; 45 characters; the URL-safe characters `-` and `_`; an inner space; a trailing `\n`; `"<valid>\nTUDO_ACCESS_DISABLED=1"`; `$` and `"` characters. The error message names `TUDOCUATUI_AI_KEK`. Also run each case together with valid Drive values, which proves the KEK check does not depend on the Drive group. |
| `deploy-envfile.test.ts › AI_KEK independent of the Drive group` | A valid KEK with a 2-of-4 Drive set still fails on the Drive rule, and the message does not mention AI. A valid KEK with no Drive values passes. |
| `deploy-envfile.test.ts › static: envfile maps exactly five secrets` | The existing test is renamed and extended. It adds `["AI_KEK", "secrets.TUDOCUATUI_AI_KEK"]` and expects `secrets.` to occur 5 times in the whole file. The test "no run block contains `${{`" stays green. |

## Approach
1. **Pure modules first.**
   - `providerErrors.js`: a `switch` on status. Add a JSDoc note that the Gemini half is F-701's or later.
   - `claude.js`:
     ```js
     export const CLAUDE_MODELS_URL = "https://api.anthropic.com/v1/models/";
     ```
     - Call `fetch(CLAUDE_MODELS_URL + encodeURIComponent(model), {method:"GET", headers:{"x-api-key": key,
       "anthropic-version":"2023-06-01"}, redirect:"error", signal: AbortSignal.timeout(timeoutMs)})`.
     - In a `finally`, run `await res.body?.cancel().catch(() => {})`.
     - `res.ok` gives `{ok:true}`. Otherwise return `{ok:false, code: mapClaudeError(res.status)}`.
     - `catch {}` (no binding) gives `provider_unavailable`.
     - No env override of the URL. No logging inside the module.
   - `crypto.js` `openStoredKey`: `null` gives `not_configured`. Otherwise
     `try { return {ok:true, key: await openKey(kek, s.provider, s.ciphertext)} } catch { return {ok:false,
     code:"key_unreadable"} }`. Add a comment: "T-019.3 changes the AAD here (v2, sub) and nowhere else."
   - `validate.js` `parseTestBody`: a plain non-array object with `Object.keys(b).length === 0`.
   - `config.js` `initAi(env, {requestAuth, importKek})`:
     - Call `loadAiConfig(env)`. It may throw, and malformed input always exits 2, even in dev.
     - `delete env.AI_KEK` (G1). This runs in a `finally` right after the value is read, so it happens on every path.
     - Off gives "ai not configured".
     - On with `!requestAuth` gives `ai:null` and "ai disabled: request auth off" (Y1).
     - Otherwise `importKek` gives "ai configured".
     - Add a comment: "T-019.5: requestAuth becomes 'auth mode is access or identity'."
     - `importKek` is passed in so `config.js` does not import `crypto.js` in tests. A default import is also fine.
2. **Store.** `getSecret()` runs `select provider, model, key_ciphertext from ai_settings where id and key_ciphertext
   is not null` and maps the row to `{provider, model, ciphertext}`, or returns `null`. It takes no parameter. T-019.3
   adds `userId` (consult R2).
3. **Route** (`routes.js`).
   - `handleAiSettings` branches on `route === "/api/ai-settings/test"` into `handleTest`.
   - The order of checks (consult R2/R4) is:
     1. `ai === null` → 503 `server_misconfigured`
     2. `ai.limiter.check("test")` → 429 `rate_limited`
     3. `readJson(req, {limit: MAX_BODY_BYTES})`, with the existing 413 `Connection: close` handling
     4. `parseTestBody` → 400 `bad_request`
     5. `!ai.store` → 503 `db_unavailable`
     6. `getSecret()`, inside the same `try`/`catch` with `mapDbError` and `dbLogFields`. `null` → 409
        `not_configured`.
     7. If `!isAllowedProvider(provider)`, `provider !== "claude"` or `!isAllowedModel(provider, model)` → 400
        `invalid_model`. This runs before decryption, so plaintext is not produced for a request that cannot go out.
     8. `openStoredKey` → 409 `key_unreadable`
     9. `checkClaudeKey({fetch: ai.fetch, key, model})` → 200 `{ok:true}`, or `AI_ERROR_STATUS[code]` with `{error:{code}}`
   - The plaintext `key` is held only in a local `const` that is passed to `checkClaudeKey`. It is never put into a
     log, a response or an error.
   - The log is `{event:"ai_settings", id, action:"test", code}` on every outcome, with `code:"ok"` on success.
     Setting `action` for POST: replace the current ternary with a small map.
4. **Wiring.** Add the `api.js` match. In `app.js`, the `aiContext` gets `fetch`. In `index.js`, the AI block becomes
   `const r = await initAi(process.env, {requestAuth: access !== null, importKek}); ai = r.ai; console.log(r.line);`.
   It keeps the existing `try`/`catch` that exits 2 on `AiConfigError`.
5. **Deploy drafts.**
   - Workflow envfile step:
     - Add `AI_KEK: ${{ secrets.TUDOCUATUI_AI_KEK }}` after the four Drive mappings.
     - After the Drive validation and before `mktemp`:
       `re_kek='^[A-Za-z0-9+/]{43}=$'; if [ -n "$AI_KEK" ] && ! [[ "$AI_KEK" =~ $re_kek ]]; then echo "::error::Malformed
       TUDOCUATUI_AI_KEK (expected base64 of 32 bytes). Nothing was started; $ENV_FILE was not changed."; exit 1; fi`
     - After the Drive `printf`: `if [ -n "$AI_KEK" ]; then printf 'AI_KEK=%s\n' "$AI_KEK" >> "$tmp"; fi`.
     - Never `echo` the value.
     - Update the header comment ("Secrets: …") and the step comment to mention the KEK: optional, independent of the
       Drive group, and never printed.
   - `compose.yml` lines 21–23: "The env file also holds the four Google Drive values … when the deployment repo has
     all four repository secrets (D28), and `AI_KEK` when `TUDOCUATUI_AI_KEK` is set (T-018). `migrate` shares the file
     but is only on the internal `db` network (no egress) and never reads them."
   - The README section "AI key encryption (T-018)" covers:
     - the secret's name and its env line
     - the format, and that it is optional
     - that unset means the AI routes answer 503
     - that a malformed value fails the envfile step, and a malformed value that gets past it makes the server exit 2
     - that the value is never printed
     - rotation is not supported: a new KEK means re-entering the key
     - that the Bitwarden backup is the only copy
     - a pointer to M-16
     - a table row for the setup PR `setup/tudocuatui-ai-kek` (the workflow and the compose comment).
6. **M-16** (in `work/ming-todo.md`, its own section):
   1. On the Mac: `mkdir -p ~/.config/tudocuatui && umask 077 && openssl rand -base64 32 | tr -d '\n' >
      ~/.config/tudocuatui/ai-kek.txt`. Do not `cat` the file.
   2. Bitwarden, **personal** collection, item "TuDoCuaTui AI_KEK": paste the value from the file. Copy it with
      `pbcopy < ~/.config/tudocuatui/ai-kek.txt` and clear the clipboard afterwards.
   3. `gh secret set TUDOCUATUI_AI_KEK -R mmlabs-online/deployment < ~/.config/tudocuatui/ai-kek.txt`. Check that
      `gh secret list -R mmlabs-online/deployment` shows the name.
   4. `rm ~/.config/tudocuatui/ai-kek.txt`.
   5. Merge the setup PR `setup/tudocuatui-ai-kek` on `mmlabs-online/deployment`, which contains the two drafted
      files. If no PR was opened, copy the two files from `deploy/deployment-repo/` into one, on a branch whose name
      does not start with `release/`.
   6. Check that `/version.txt` shows a release that contains T-018.1. If it does not, cut a release, as in M-15
      step 7. Then go to Actions → `deploy-tudocuatui` → Run workflow from `main`. On the Mac,
      `docker compose -p tudocuatui logs --tail 20 tudocuatui` should show `ai configured`.
   7. Signed in through Access, `https://tudocuatui.mmlabs.online/api/ai-settings` should return `{"settings":null}`.

   Add these to the item:
   - An optional step 8 (A3) with a browser-console snippet: a PUT with `apiKey: prompt("key")`, then
     `POST /api/ai-settings/test` with body `{}`.
   - The line: "A key saved now is cleared by T-019.3 (per-user keys, D33); enter it again after that release."
   - A recovery line: KEK lost or leaked → generate a new one (steps 1–4), Run workflow, re-enter the key.
   - A turn-off line: `gh secret delete TUDOCUATUI_AI_KEK -R mmlabs-online/deployment`, then Run workflow.
7. **T-019.3 note** (append, dated): "T-018.2 merged first (KEK deployed). T-019.3 must also:
   - make `store.getSecret(userId)` take the user
   - move `openStoredKey` (`server/ai/crypto.js`) to the v2 AAD
   - make the `test` limiter per user, and keep a global ceiling on `test`/`save` (open join)
   - add a two-user `/test` isolation test (B never sends A's key and gets `not_configured`)
   - test that a leftover v1 ciphertext gives `key_unreadable`, or is cleared by the migration.

   The 'KEK not yet deployed' rationale of T-019 plan A6 no longer holds. Clearing is still correct; Ming re-enters
   his key. T-019.5 must change `initAi`'s `requestAuth` to 'auth mode is access or identity' (T-018.2 A1)."
   Only add this if T-018.2 merges before T-019.3 starts, which the run order makes certain.
8. **Rules.**
   - R1: no `src/` change, so local mode and the Figma Make preview are unchanged.
   - R2: no schema change.
   - R3: the KEK lives only in the server env and is removed from `process.env` after import. The provider key only
     goes to the pinned host. No `VITE_*` change.
   - R7: anything else goes to the follow-ups in `impl-log.md`.
   - R8: unit tests for every new pure function. `server/ai/**` already has a coverage threshold.
   - R10: untouched.
   - R4, R5, R6 and R9 do not apply (no photos, no stored derived values, no UI).

## Specialist input used
- **software-architect (`consult-software-architect.md`)**:
  - **Adopted:**
    - R1: ship now, before T-019.1.
    - R2: no `userId` plumbing. The seams are `getSecret()` as SQL only, `openStoredKey` as the single AAD site, the
      pure `checkClaudeKey`, and a route that only wires these together.
    - R3: the body is strictly `{}`, with an `apiKey` test (C3).
    - R4: the limiter stays as it is and runs first.
    - R5: Y1 as an auth predicate with a T-019.5 comment (C2, A1).
    - R6: the deploy half as ticketed, plus G1.
    - R7: the T-019.3 forward note (C5, A5).
    - F4: `check-image.sh` is unchanged.
    - F7: M-16 is free.
    - F8: hotspots.
    - Risks: the M-16 wipe line, the global-ceiling note for T-019.3, and the body-echo sentinel test.
  - **Adapted:**
    - The R2 route order puts the model/catalog check **before** `openStoredKey`, so the key is never decrypted for a
      request that cannot be sent.
    - `openStoredKey` goes in `crypto.js`, not in a new `keys.js`, so the AAD change in T-019.3 touches one file.
  - **Left to the orchestrator:** R8, citing D33 in the ticket's *Feature reference*. `ticket.md` is the
    orchestrator's file. This plan already quotes D33.
- **T-018.1 security review:** Y1 → A1/C2. G1 → `initAi`. G2 → `openStoredKey` plus the fixed-field log test. The
  `/test` sentinel case with a body that echoes the key → AC 2. Y2 (`migrate` sees `AI_KEK`) stays accepted as T-018
  A12, and the compose comment documents it.

## Assumptions
- **A1 (Y1: refuse or warn; consult Q1).** Default: **refuse**. With `access === null`, the server logs
  `ai disabled: request auth off` and the AI routes answer 503.
  - Cost: manually testing the AI routes against a local dev server needs Access on (or Identity mode after T-019.5).
    Unit and route tests are not affected, because they build `createApp` directly.
  - If T-010 needs a dev escape hatch, that is a follow-up and not added here.
  - Production is unaffected, because Access is required there.
- **A2 (G1).** `delete process.env.AI_KEK` runs on every path, including when AI is refused or unset. Nothing else in
  the server reads `AI_KEK` after startup.
- **A3 (saving a real key before T-019.3; consult Q2).** Default: **allowed but optional**. M-16 says the key will be
  cleared by T-019.3 and must be entered again. The cost is one re-entry. T-010 (the UI) is blocked anyway, so the
  only way to save a key now is the console snippet.
- **A4.** The limiter stays a single in-memory window (`test` 20/h, D30). It becomes per user in T-019.3. A `/test`
  call that fails the body check still uses a slot, the same as `save`.
- **A5 (T-019.3 note or dependency; consult Q3).** Default: **note only**. T-019.3's `Depends on` stays `T-019.2`.
  The note is appended in this ticket's diff so the reviewer sees it. If T-019.3 ran first, this ticket would rebase
  onto it instead, and the orchestrator would drop the note.
- **A6.** The success body is `{ok:true}`. This is the contract in T-018's consult (`/test` → `{ ok: true }`), which
  T-010 plans against. Failures use the standard `{error:{code}}` with `AI_ERROR_STATUS`.
- **A7.** Only HTTP 2xx means OK. Any status the mapper does not list gives `provider_unavailable`. That includes 400,
  which on `GET /v1/models/<id>` would mean a malformed request on our side. `redirect:"error"` turns a 3xx into a
  rejection, which also gives `provider_unavailable`.
- **A8.** The pinned `anthropic-version: 2023-06-01` and the `GET /v1/models/{model_id}` endpoint are as documented by
  Anthropic, and the call costs no tokens. The catalog ids (`claude-*-5-5`) are T-018.1's, and are not revalidated
  here. A retired id gives `model_unavailable`.
- **A9 (setup PR).** The drafts are copied into `mmlabs-online/deployment` as setup PR `setup/tudocuatui-ai-kek`. The
  orchestrator opens it at DONE if it has access, the same pattern as T-005.5. Otherwise Ming copies the files (M-16
  step 5).
- **A10.** `TUDOCUATUI_AI_KEK` is optional in the workflow. With it unset, the deploy behaves exactly as today. The
  rollout order does not matter, because an image without T-018.1 ignores `AI_KEK`.
- **A11.** The setup PR changes `compose.yml` and the workflow, so merging it triggers a deploy, because the path
  `apps/tudocuatui/**` changed. With the secret already set (step 3 comes before step 5), that deploy writes `AI_KEK`.
  Step 6's `workflow_dispatch` is the explicit check.
- **A12 (size).** The estimate is about 250 production lines, 450 test lines and 100 lines of deploy and docs. Test
  lines dominate, and every piece is small and independent, so this stays one implement/review cycle with no split.
- **Hotspots** (rule 7; T-019 plan A17):
  - T-019.2, .3 and .5 (all BACKLOG) will edit `server/index.js`, `server/app.js`, `server/ai/{routes,store,
    rateLimit,crypto}.js` and `compose.yml`. Whichever merges second rebases. This ticket's edits are additive.
  - T-019 (the umbrella, IN_PROGRESS) holds only its plan.
  - Nothing else open edits these files.
  - `src/App.tsx` is not touched.

## Blocking questions
None. Each open question has a default (A1, A3, A5) for Ming to confirm at plan approval.

## Split proposal
None. This is already slice 2 of T-018, and it fits one cycle (A12).
