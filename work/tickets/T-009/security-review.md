# Security review — T-009

## Attempt 1 — 2026-11-10 (security-ai-generated-code-auditor, static, read-only)

**Verdict: no 🔴 blockers.** Design matches D21/D22 and the approved plan. Two 🟡 to fix or accept, plus 🟢 hardening notes.

Limits: no shell (files read directly, no `git diff`); no `.env` read except the names-only `supabase/functions/.env.example`; pgTAP, the Deno runtime and a live Claude call were not run.

### Focus items
1. **Caller auth — OK.** User id only from `admin.auth.getUser(token)` (`supabase/functions/tudo-ai-settings/index.ts:23-26`); bearer matched by regex, failure → 401 (`settingsHandler.ts:77-85`); anon/publishable token → 401. `parseRequest` rejects unknown fields incl. `__proto__` and `user_id` (`_shared/ai/validate.ts:36-56`). Every `store.ts` query filters `.eq("user_id", uid)`, upsert sets `user_id` from `uid` (`store.ts:69-155`). `action` logged only after parsing.
2. **Crypto — OK.** Fresh 96-bit IV per seal (`crypto.ts:41`); AAD `tudo-ai-key|v1|user|provider` (`crypto.ts:20-21`); KEK must decode to 32 bytes, non-extractable, parse failure → `server_misconfigured` (`crypto.ts:24-33`); versioned `v1:` also checked in DB (`migration:16`); open failure → `key_unreadable` (`settingsHandler.ts:157-161`); provider switch without new key → `key_required` (`settingsHandler.ts:127-128`).
3. **Key never returned or logged — OK.** `getView` selects only `provider, model, key_hint, updated_at` (`store.ts:73`); error bodies `{error:{code}}` (`http.ts:30-32`); typed `LogEntry` (`settingsHandler.ts:17-21`); Claude adapter reads only `e.status` (`claude.ts:12`); Gemini only status + `details[].reason` (`providerErrors.ts:39-47`).
4. **SQL — OK.** RLS on, no policies; `revoke all … from public, anon, authenticated` + explicit `service_role` grant (`migration:37-41`); cascades; CHECKs on provider, model pattern, ciphertext format, 4-char hint, ciphertext/hint pair; no SECURITY DEFINER; `tudo_` names. pgTAP asserts empty privilege arrays, 42501 for both roles, CHECKs, cascade — **not run** (M-10 step 7).
5. **CORS — OK.** Exact-match allowlist, never `*`, `Vary: Origin`, no credentials; empty allowlist → `server_misconfigured` (`http.ts:12-20`, `settingsHandler.ts:69`).
6. **Rate limit — fails closed** (`rateLimit.ts:19-31`, `store.ts:62-65`); runs before any provider call.
7. **Adapters — OK with 🟡1.** Claude: official SDK, `maxRetries: 0`, `timeout: 10_000`, key as `apiKey` (`claude.ts:7`). Gemini: key in `x-goog-api-key`, model URL-encoded, 10 s AbortController (`gemini.ts:16-23`).
8. **R3 — OK.** Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_VERSION` in `src/`; `TUDO_AI_KEK` / `SERVICE_ROLE` only in the negative test `src/shared/ai/boundary.test.ts`; fake test key; `.dockerignore` excludes `supabase`, `.env*`, `**/.env*`; `supabase/.gitignore:11` ignores `functions/.env`.
9. **Pins — OK.** Exact `npm:` pins (supabase-js 2.119.0, anthropic sdk 1.6.0); `deno.lock` v5 with sha512 hashes.

### 🟡 Should fix or explicitly accept
**🟡1. Anthropic client can pick up project-wide env (`supabase/functions/_shared/deno/claude.ts:7`).** The SDK fills `baseURL` from `ANTHROPIC_BASE_URL` and `authToken` from `ANTHROPIC_AUTH_TOKEN`; Edge secrets are project-wide on the shared stoktok project. If either is set, user keys could go to another host or a server-wide bearer could be attached. Fix: `new Anthropic({ apiKey: key, authToken: null, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 10_000, logLevel: "off" })`, verified with `deno check` against SDK 1.6.0. (AC4, R3)

**🟡2. M-10 smoke test puts a live Claude key in shell history and the process list (`work/ming-todo.md:80-82`).** Fix: `read -rs K`, then pipe the body via stdin, e.g. `jq -n --arg k "$K" '{action:"save",provider:"claude",model:"claude-haiku-5-5",apiKey:$k}' | curl … --data-binary @-`, or leave `save` to T-010's UI. (AC4)

### 🟢 Hardening notes / follow-ups
- Gemini fetch keeps `x-goog-api-key` on cross-origin redirects (`gemini.ts:19`): add `redirect: "error"` (unreachable until Gemini models exist).
- Rate-limit count-then-insert is not atomic (`rateLimit.ts:26-28`); `get`/`deleteKey` unlimited (one Auth round trip each). Acceptable.
- Body cap buffers a chunked body before the 4 KB check (`http.ts:35-40`), after auth. Low risk.
- `http://localhost:8443` in production `TUDO_ALLOWED_ORIGINS`: harmless (token required); drop if not needed.
- KEK readable by every function on the shared project; rotation not implemented (`openKey` only `v1`) — listed follow-up.
- `key_hint` stores the last 4 in plaintext, per ticket; keys ≥ 20 chars.

### Risks
- pgTAP (41 assertions) and a Deno runtime call through SDK 1.6.0 not run; `SUPABASE_SERVICE_ROLE_KEY` name from memory (may differ with `sb_secret_` keys → fails closed). Don't mark AC2 verified until M-10 step 7 passes.
- `verify_jwt=false` relies on the CLI reading `[functions.tudo-ai-settings]` from `config.toml`; M-10 step 5 includes the dashboard check.
- Gemini endpoint/error shape from memory: acceptable only while the Gemini model list stays empty.

### Open questions
- Does stoktok set any `ANTHROPIC_*` Edge secrets on the shared project?
- SDK 1.6.0 depends on `@opentelemetry/api`: confirm no tracer captures request headers.
