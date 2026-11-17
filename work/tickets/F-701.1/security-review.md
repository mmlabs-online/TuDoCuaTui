# Security review — F-701.1

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-17

No 🔴 findings; 3 🟡. Read-only static review (tests not run by the auditor).

### Confirmed
| Check | Result | Evidence |
|---|---|---|
| Key only in `x-goog-api-key` to the pinned host | OK | `server/ai/gemini.js:9` base `https://generativelanguage.googleapis.com/v1beta/models/`; header at `:72,97`; no `?key=`. Sentinel tests `gemini.test.ts:98-116, 257-265`, `routes.test.ts:547`, `tagPhoto.test.ts:547`. |
| Key never in logs, error bodies, responses | OK | Fixed codes only; `catch {}` drops error objects incl. the sentinel `TypeError` (`gemini.test.ts:160-164, 364-368`); fixed-field logs (`routes.js:68,89`, `tagPhoto.js:24`). |
| SSRF via model id | OK | Exact catalog allowlist `isAllowedModel` (`validate.js:19-21`) on PUT (`routes.js:135`) and before decryption (`routes.js:49`); `encodeURIComponent` (`gemini.js:70,95`; `gemini.test.ts:118-124`). |
| Redirects | OK | `redirect: "error"` (`gemini.js:73,116`). |
| Timeouts | OK | 10 s key check, 45 s tagging, `AbortSignal.any` with client disconnect (`gemini.js:117`, `tagPhoto.js:58-59`); covers body reading. |
| Body caps | OK | `readCapped.js:10-31` chunked, cancels over cap; 64 KB success, 8 KB error. |
| Provider error text never echoed | OK | `geminiReasonOf` (`providerErrors.js:35-52`) allowlist only, never reads `message` (fixture puts sentinel in `message`, `gemini.test.ts:28`). |
| Prompt injection via photo text | OK, bounded | No tools; `responseSchema` then server `parseTagSuggestion` (`tagging.js:97-122`): enums, length caps, no control chars, own properties; thought parts and non-STOP rejected (`gemini.js:123-129`). |
| Provider/model checked before decryption | OK | `routes.js:48-52`; tests `routes.test.ts:710`, `tagPhoto.test.ts:163`. |
| AAD / provider binding | Unchanged | `crypto.js:14-16`; `store.js:58-59`. |
| Rate limits, owner lane | Apply | `routes.js:71`; `tagPhoto.js:41-44`. |
| Secrets in client code | None | `src/` has catalog ids, labels, copy only. |
| Header injection via key | OK | `validateApiKeyFormat` printable ASCII, no whitespace, 20–256 (`validate.js:28-33`). |

### Findings
- 🟡 `server/ai/providerErrors.js:57-61`: a Gemini 400 with a reason not on the allowlist (e.g. `INVALID_ARGUMENT`) maps to `provider_unavailable` (502). Fails closed; a missed key-state reason would show as "provider unavailable". Check during M-27; add missed reasons to the allowlist, never fall back to `message`.
- 🟡 `server/ai/gemini.js:80,144` (same in `claude.js:28,104`): `res.body.cancel()` in `finally` after `readCapped` locked the stream rejects and is swallowed — a no-op, no leak. Optional: skip when `res.body.locked`.
- 🟡 Free-text fields (`name`, `material`, `brand`, `tags`) can carry photo-driven wording; bounded, no control chars, rendered as React text, user confirms. Keep them as escaped text, never links/HTML.

### Open questions
None blocking. `MODEL_ID_PATTERN` is test-only (`catalog.test.ts:37`); exact catalog match + `encodeURIComponent` suffice. Live Google behaviour is verified only by M-27.
