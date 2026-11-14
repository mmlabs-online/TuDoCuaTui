# Security review — F-701

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, read-only)

**Verdict: no blocking findings; pass on security.** No 🔴. Two 🟡 (client-disconnect edge cases; T-019.3 hazards) can be fixed cheaply here or logged as follow-ups. No tests run.

### Findings

**🟢 API key never in logs, responses or errors (AC 3, R3)**
- `server/ai/claude.js:73-110`: key only in `x-api-key` to hardcoded `CLAUDE_MESSAGES_URL` (line 31), `redirect:"error"`; nothing in URL/body; no host override.
- `claude.js:128`: `catch {}` without binding drops fetch/undici errors; non-2xx (line 111) → `mapClaudeError(status)` only; body cancelled in `finally` (line 131); provider text never returned.
- `server/ai/tagPhoto.js:24`: log exactly `{event,id,code,ms}`; catch at line 74 logs only `dbLogFields` (`server/errors.js:35-44`); `openStoredKey` never throws (`server/ai/crypto.js:59-63`); top-level `unhandled` log (`server/app.js:104-108`) only `name`/`code`.
- Plaintext key only as handler-local `s.key` (`tagPhoto.js:48,62`).
- Tests: `tagPhoto.test.ts:383-405` (sentinel: success, 401 body echoing key, fetch throwing with key; body, headers, logs), `:407-420` (log key set).

**🟢 Image bytes only to the pinned URL, never logged** — base64 only inside the request body (`claude.js:100`); test asserts it is absent from logs and the response (`tagPhoto.test.ts:401-403`); never stored (no Drive/DB call).

**🟢 Body limits, deadline, magic bytes** — exact `image/jpeg` (`tagPhoto.js:38-39`); declared > 2 MB → 413 before reading (line 40); streamed > 2 MB → 413 (`server/photos.js:54-57`); 30 s deadline → 408 `request_timeout` (`photos.js:50-53`); declared length mismatch → 400 (`photos.js:59-64`); `FF D8 FF` (`tagPhoto.js:55-57`); early rejects via `rejectUnread` (`photos.js:25-28`).

**🟢 Check order** (`tagPhoto.js:36-50`): `ai` null → limiter → content type → declared length → in-flight → store → `loadSettingsKey` → body. Provider/model checked before `openStoredKey` (`server/ai/routes.js:43-49`); Gemini/unknown models never decrypt. Decrypt-before-body is accepted trade-off A11.

**🟢 In-flight cap** — `MAX_IN_FLIGHT = 2`, `try/finally` releases on every path (`tagPhoto.js:41-80`); tests `tagPhoto.test.ts:310-335`.

**🟢 Response cap + strict `tool_use` parsing** — `readCapped` (`claude.js:40-61`) stops at 64 KB of decoded stream (bounds gzip bombs); accept only `stop_reason === "tool_use"`, exactly one block, name `tag_item`, plain-object input (`claude.js:117-126`); else `provider_bad_response`; no retries, no logging.

**🟢 Sanitizer vs prompt injection** (`server/ai/tagging.js:93-118`) — fresh object with 7 fixed keys; own-property reads (line 66), own `__proto__` never copied; `category` in `CATEGORIES` or `null` (no deprecated, no `"other"`); colours/seasons enum, deduped, capped 3/4 (81-87); strings NFC, trimmed, code-point caps, C0/DEL → `null`; tags ≤ 5 × 30. Tool has no side effects; output fills the user's own form, React-escaped; instruction tells the model to ignore text in the image.

**🟢 `Sec-Fetch-Site` write guard applies** — `server/api.js:69-73` before dispatch (77); `image/jpeg` not CORS-safelisted → preflight, no CORS headers; forms can't send it. Access check before `handleApi` (`app.js:79-85`); Access off → `ai` null → 503 (`server/index.js:55`). Tested `tagPhoto.test.ts:370-380`.

**🟡 F1. Client disconnect before the provider call is not handled** (`tagPhoto.js:58-59`, `photos.js:34-68`). The `res.once("close")` abort is registered only after `readBody` resolves.
- Case 1: client sends the full body and disconnects while `getSecret`/decryption is pending → abort listener never runs → full Claude call (≤ 45 s, user's tokens) discarded.
- Case 2: socket closes with an incomplete body before `readBody` attaches listeners → waits up to 30 s, holding an in-flight slot and the decrypted key in memory.
- Severity low (single user behind Access; costs money). Fix: create the `AbortController` and `res.once("close", () => ctl.abort())` at the top; in `readBody` resolve `bad` at once when `req.destroyed || req.readableAborted`; return before the tagger when `ctl.signal.aborted || res.destroyed`; test: socket destroyed while a deferred `getSecret` is pending → no fetch, counter released. Existing tests (`tagPhoto.test.ts:266-279`, `337-367`) cover disconnect during upload and during fetch only.

**🟡 F2. Hazards for D33 / T-019.3**
- (a) `loadSettingsKey(ai)` (`routes.js:42`) takes no user; `tagPhoto.js:48` calls it without one. Any call site left on the single-row path after T-019.3 would run B's request on A's key (CWE-639). T-019.3: make `userId` required (throw when missing); two-user isolation test for `/test` and `/tag-photo` (B → `not_configured`, no fetch).
- (b) Global `tag` limiter (`rateLimit.js:12,18`): per-user + global ceiling in T-019.3 (A16).
- (c) Global `inFlight` (`tagPhoto.js:13`): consider per-user cap 1 inside global 2.
- (d) AAD still `v1|single` (`crypto.js:12-13`): expected; mismatch → `key_unreadable` cleanly.
- Add (a) and (c) to the T-019.3 note.

**🟢 F3. Hardening options (follow-ups)**
- `tagging.js:76` rejects C0/DEL only; C1 (U+0080–U+009F), bidi overrides (U+202A–U+202E, U+2066–U+2069) and U+2028/2029 pass — cosmetic spoofing in the user's own form. Fix: also reject `\p{Cc}`, bidi controls and line/paragraph separators.
- `ai_busy` / `invalid_photo` still use a limiter slot (limiter first, A3): intended.
- `claude.js:131`: `res.body.cancel()` rejects on success (reader holds the lock); caught; harmless.

### Recommendations
- AC 3 / R3: nothing to fix.
- AC 4: fix F1 (early abort, `req.destroyed` short-circuit, check before tagger) + one test — optional, cheap.
- Follow-ups: F2 (a)(c) into the T-019.3 note; F3 bidi/C1 filter.

### Risks
- Free-text fields can be steered by text in the image; bounded to the user's own unsaved form.
- Model ids and `tool_use` shape taken on trust (A10); only M-23 exercises the real API.

### Open questions
- Fix F1 in this ticket (plan step 8 "abort on client disconnect") or log as follow-up?

Not reviewed in depth: `server/validate.js`, `tsconfig.server.json`, `claude.test.ts` / `tagging.test.ts` beyond names.
