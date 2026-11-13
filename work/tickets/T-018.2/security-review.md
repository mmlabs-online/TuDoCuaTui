# Security review — T-018.2

## Attempt 1 — 2026-11-13 (security-ai-generated-code-auditor, read-only)

**Verdict: no 🔴 findings, so nothing blocks a PASS on security grounds.** One 🟡 runbook gap (Y3) and one 🟡 carried over from T-018.1 (Y2); the rest are 🟢 notes. Tests and checks were read, not executed.

Files read: `server/ai/{claude,providerErrors,crypto,config,routes,validate,store,catalog}.js`, `server/{api,app,index,errors,http}.js`, `server/ai/claude.test.ts`, `server/ai/routes.test.ts` (360–573), `server/index.cli.test.ts` (105–153), the AI_KEK cases in `scripts/deploy-envfile.test.ts`, `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`, `deploy/deployment-repo/apps/tudocuatui/compose.yml`, the README section, `work/ming-todo.md` M-16 and the T-019.3 forward note.

### Findings, by focus area

**1. The API key never appears in logs, responses or errors: confirmed 🟢**
- `server/ai/claude.js:15-27`: key only in `x-api-key`; `catch {}` with no binding drops fetch errors containing the key; only `res.status`/`res.ok` read, body cancelled in `finally`; return value only `{ok}` / `{ok, code}`.
- `server/ai/routes.js:44-47`: `fail()` logs fixed fields only. `routes.js:75-79`: catch logs only `dbLogFields`; response carries a fixed code plus `requestId`.
- Plaintext key exists only as `opened.key`, passed straight to `checkClaudeKey` (`routes.js:69-71`).
- `openStoredKey` (`server/ai/crypto.js:57-64`) maps every `openKey` failure to `key_unreadable` without a binding — G2 closed.
- Tests: `routes.test.ts:540-572` (success, 401 echoing the key, fetch rejecting with the key, body `{apiKey: SENTINEL}`; key only in `x-api-key` to `MODEL_URL`), `claude.test.ts:27-45, 70-102`, `routes.test.ts:458-460`.
- Outer fallbacks: `app.js:103-110` and `index.js:18-23` print name/code only.

**2. SSRF and redirects: safe 🟢** — constant host, model `encodeURIComponent`'d and limited to catalog `claude` models (`routes.js:66`); `redirect: "error"` (`claude.js:19`) → `provider_unavailable`, key never re-sent; `AbortSignal.timeout(10s)`.

**3. Body exactly `{}`: confirmed 🟢** — `validate.js:58-63` rejects non-objects, arrays and any own key incl. `apiKey` and JSON `__proto__`; `readJson` enforces JSON, 4096 bytes, strict UTF-8 (`http.js:44-74`); tests `routes.test.ts:465-493` (400 with zero fetches; 415, 413, cross-site 403, 405).

**4. Limiter before decryption: confirmed 🟢** — order: AI off 503 → limiter → read body → `parseTestBody` → store check → `getSecret` → catalog/provider check → `openStoredKey` → provider call. `routes.test.ts:497-511`: 21st call refused before body/store, exactly 20 fetches.

**5. G1 (AI_KEK removed from env): done 🟢** — `config.js:30-34` deletes `env.AI_KEK` in `finally` on every path; `config.test.ts:43-70`.
- 🟢 **N1:** the value is still readable via `/proc/1/environ` in the container and `docker inspect` / `docker exec … env` on the host (env_file delivery). G1 is defence in depth only; a file/secret mount would close it (follow-up).

**6. Envfile handling for AI_KEK: correct 🟢** — passed via step `env:`, never interpolated into `run:`; `[[ =~ ^[A-Za-z0-9+/]{43}=$ ]]` rejects newline injection and trailing `\n`; check before `mktemp`; regex excludes `$`, `"`, space; written with `printf`, never echoed; Drive all-or-none unaffected. Tests `deploy-envfile.test.ts:130-202, 286`.
- 🟢 **N2:** `scripts/deploy-envfile.test.ts:171-172` labels are off (42 chars labelled "43 chars without =", 43 chars labelled "42 chars + =="); boundary cases not exercised. Suggest `KEK.slice(0, 43)` and `KEK.slice(0, 42) + "=="`. Test-only.

**7. Y1 (AI refused when request auth is off): done 🟢** — `config.js:36`, `index.js:55` (`requestAuth: access !== null`); `importKek` not called when refused; malformed KEK still exits 2; CLI test checks 503 `server_misconfigured` and no value printed.

**8. D33 / T-019.3 / T-019.5 compatibility: no blockers 🟢** — seams in place (`getSecret()` SQL only `store.js:75-83`; `openStoredKey` single AAD site `crypto.js:52`; pure `checkClaudeKey`); forward note `work/tickets/T-019.3/ticket.md:47-52` covers userId scoping, AAD v2, per-user limiter + global ceiling, two-user `/test` test, leftover v1, T-019.5 `requestAuth`.
- 🟢 **N3:** until T-019.3, any authenticated caller tests the single stored key — correct under D30. T-019.3 must not ship identity mode without `userId`; its reviewer should treat the two-user test as blocking.
- 🟢 **N4:** under T-019.5, `requestAuth: access !== null` would silently disable AI in identity mode (fails closed); covered by `config.js:22` comment and the note.

### 🟡 Medium
- **🟡 Y3. M-16 "KEK leaked" recovery does not say to rotate the Claude key** (`work/ming-todo.md:224`). KEK + any DB dump (ciphertext is in every `pg-backup` dump) decrypts the stored Anthropic key. Fix: "KEK leaked: revoke the Claude key in the Anthropic console first, then generate a new KEK (steps 1–4), Run workflow, and enter a **new** key." Same sentence in `deploy/deployment-repo/README.md:56` next to "Rotation is not supported".
- **🟡 Y2 (carried from T-018.1):** `migrate` receives `AI_KEK` via the shared `env_file` (`compose.yml:21-23, 31-33, 65-72`); the comment documents it accurately. Confirm the debt issue (spaceM#47) exists.

### 🟢 Low / notes
- N1–N4 above.
- N5: `deploy/deployment-repo/README.md:57` "The Bitwarden backup is the only copy" → "the only recoverable copy".
- N6: `/test` uses a limiter slot on 415/400/413 (A4, accepted).
- N7: `providerErrors.js:15` maps 400/408/other to `provider_unavailable` (A7), safe.

### Recommendations
- AC 1, AC 2, AC 5/6 met; AC 3 met (optionally fix N2). R3 met.
- Before the PR: apply Y3 wording to M-16 and the README (docs-only, inside this ticket's files).

### Risks
- KEK readable via `docker inspect` / `/proc/1/environ` by anyone with the runner's docker socket (N1).
- DB dumps + KEK reveal the provider key; keep them apart (Y3).
- In-memory limits reset on restart (accepted, D30).

### Open questions
1. Was spaceM#47 (separate env file for `migrate`) filed?
2. Fix Y3 in this ticket (default yes) or record as follow-up?

### Resolution — 2026-11-13 (orchestrator, docs only)
- Y3 applied: `work/ming-todo.md` M-16 and `deploy/deployment-repo/README.md` now say to revoke the provider key first when the KEK leaks, then set a new KEK and enter a new key. N5 wording ("only recoverable copy") applied in the same README line.
- Y2, N1, N2 left as follow-ups (listed in the PR).
