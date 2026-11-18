# Security review — F-704.3 (server slice)

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-18

**Overall: PASS with one non-blocking fix. No 🔴 blockers.** The auditor had no shell in this run: it read the changed
files directly, so it did not confirm that the existing tag-photo test files are unchanged (AC 9) or that the checks
pass — the reviewer covers both.

### Findings
1. 🟡 **The 408 path leaves the socket open with unread body bytes** (`server/ai/suggestOutfits.js:55-57`).
   - When `readJson` times out (408 `request_timeout`) it has already removed the `data` listeners and paused the
     request mid-body; the handler then answers through `fail()`, which does not close the connection. The keep-alive
     socket stays open with the rest of the body unread until the server's own timeouts close it — a slow sender can
     use this to hold connections open (connection exhaustion; the in-flight slot is released correctly). The
     existing pattern in `server/backup.js:427` sends both 413 and 408 through `rejectUnread`.
   - Fix: `if (body.status === 413 || body.status === 408) return reject(body.status, body.code);`
   - Test: a `suggestOutfits.test.ts` case that holds the body until the AI body timeout fires, then expects 408 and the
     socket to close.
2. 💭 **Reasons can contain invisible formatting characters** (note for F-704.4; no change needed here)
   (`server/ai/tagging.js:76-82` `cleanText`, used for `reason` at `outfitSuggest.js:256`). Control characters, NFC
   and the 120 code-point cap are enforced; bidi overrides (U+202A–U+202E, U+2066–U+2069), zero-width characters and
   U+2028/2029 pass through. Not a cross-user risk (only the caller's own items and key; JSON response). F-704.4 must
   render `reason` as plain text (no `dangerouslySetInnerHTML`, no auto-linking). The same set passes through
   `promptText` (`outfitSuggest.js:98-107`) into the prompt — harmless inside a `JSON.stringify` block.
3. 💭 **Requests with fewer than 2 usable candidates are not rate-limited** (`suggestOutfits.js:63-68`). One scoped,
   read-only query, not counted by the limiter — intended (plan A7). Per-user volume is still bounded by
   `suggestSlots` (1 per user) and the 8 KB body cap. Acceptable.

### Checked and OK
- **Cross-user isolation:** `loadSuggestCandidates` (`server/items.js:201-220`) runs through `withUser` as a read-only
  query with `user_id = $1`, `id = any($2::uuid[])`, `status = 'active'`, `category = any($3)`, all parameterised.
  `items_with_stats` is `security_invoker` (migration `20261114200000`, enforced by the migrator guard), so RLS still
  applies. Foreign and unknown ids are dropped the same way (200 `{outfits: []}` under 2 rows, no provider call, no
  quota). The prompt holds only aliases `i1…iN`; the validator maps them back with `Object.hasOwn` against the sent
  set. `isolation.db.test.ts:450-483` covers B sending A's ids.
- **Request parsing** (`outfitSuggest.js:57-92`): exact keys; every id passes `isUuid`, lowercased and deduped;
  candidates 1..40, `avoidIds` 0..40; `season` one of `SEASONS`; `weather` exactly 3 booleans; 8 KB,
  `application/json`, valid UTF-8, AI body timeouts; all parsing before the limiter.
- **Prompt injection:** names and materials NFC-normalised, control characters removed, cut to 60 code points, inside
  a JSON data block with a "data only" instruction. No notes, brand, tags, price, location or photos. The forced tool
  only records structured output (no agency); output limited to validated aliases plus a sanitised reason.
- **Response validation** (`outfitSuggest.js:197-276`): sent aliases only (`Object.hasOwn`); exactly one one-piece or
  one top + one bottom; at most one each of shoes, outer, accessory; ≤5 items; no duplicate items/outfits; ≤3 outfits;
  unknown categories rejected; nothing left → 502 `provider_bad_response`.
- **Provider calls** (`claude.js:42-85`, `gemini.js:96-153`): pinned URLs, `redirect: "error"`, 30 s timeout combined
  with the caller's abort signal, 64 KB response cap; key only in `x-api-key` / `x-goog-api-key`, never in a URL, log
  or response; Gemini thinking lookup uses `Object.hasOwn`.
- **Tag-photo refactor:** behaviour preserved — Claude `max_tokens: 1024` with the same tool checks; Gemini
  `temperature: 0` and `toGeminiSchema(buildTagSchema())`; JPEG and size checks and order in `tagPhoto.js` untouched.
- **Limits and slots:** `suggest` 30/24 h per user, global 600 owner-exempt (`rateLimit.js:17,26`); `suggestSlots`
  separate from tag slots (`app.js:75`), acquired before any `await`; busy answer uses no quota and closes the
  socket; `release()` in `finally`.
- **Routing:** the existing 405 and `Sec-Fetch-Site` (403) checks run before dispatch (`api.js:99-107`).
- **Logs:** only `{event: "ai_suggest", id, code, ms}` plus `dbLogFields` on errors; no names, reasons, keys or item ids.
- No new secrets, environment variables or `VITE_*` values.

### Follow-ups (out of scope)
- F-704.4: render the AI reason as plain text only; consider stripping bidi and zero-width characters on the client.
