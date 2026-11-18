Verdict: PASS

# Review — F-704.3 (server slice)

## Attempt 1 — 2026-11-18
Verdict: PASS

Reviewed: commit 765fab2 (`git diff origin/main...HEAD`), plan.md ACs 1–10 (server subset), impl-log attempt 1,
ticket Notes (Ming's answers + "Plan approved" 2026-11-18, A1–A7 accepted).

### Checks (run by reviewer)
- `pnpm typecheck` — `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0, no errors.
- `pnpm format:check` — 322 files, exit 0.
- `pnpm test` — `Test Files 130 passed | 11 skipped (141)`, `Tests 1700 passed | 222 skipped (1922)`, exit 0.
  Matches impl-log exactly.
- `pnpm build` — `vite build` ok, exit 0.
- **Condition for the orchestrator:** `server/isolation.db.test.ts` › "suggest-outfits: B sending A's item ids gets
  no outfits and no provider call; A's stored item is not sent" is **skipped locally** (no Postgres). It is the only
  test that runs `loadSuggestCandidates` against real SQL (notably `category = any($3)` against the
  `item_category` enum with an untyped text-array parameter, and RLS). The PR's CI run must show the `*.db.test.ts`
  job green with this case executed (not skipped) before the PR is presented as ready. If it fails, this ticket
  goes back to REWORK.

### Acceptance criteria
- [x] AC 1 — own active candidates only; foreign/unknown/stored/bikini ids never sent or returned, same answer
  (no oracle). Evidence: `server/items.js:201-219` (`withUser` read-only; `user_id = $1 and id = any($2::uuid[])
  and status = 'active' and category = any($3)` on `items_with_stats`; rows reordered by request ids);
  `suggestOutfits.test.ts` › "candidate query is scoped to user, ids, active, allowed categories" (params
  `[OWNER_A, ids, SUGGEST_CATEGORIES]`), "ids the DB does not return never reach the prompt" (B's, stored, bikini
  names absent; `i5` absent), "an alias outside the sent set is dropped…"; `outfitSuggest.test.ts` › drops
  `nope`/`toString`/`__proto__` (own-property lookup, `outfitSuggest.js:264`). Real-DB case: see condition above.
- [x] AC 2 — strict validator per F-704.1: `arrange()` `outfitSuggest.js:197-234` (exactly one one-piece with no
  top/bottom, or exactly one top + one bottom; ≤1 shoes/outer/accessory; any other category → drop), length 1..5,
  in-outfit duplicate → drop, set-equality dedupe, cap 3, reason via `cleanText(…,120)` (NFC, trimmed, no control
  chars, non-empty), nothing left → `provider_bad_response`. `ONE_PIECE` and the bikini/other skip match
  `src/features/outfits/suggest.ts:67,95`. Tests: `outfitSuggest.test.ts` › validateSuggestions keep/drop/dedupe/
  4th/bad-shape cases (lines 202-289).
- [x] AC 3 — `<2` rows → `200 {outfits: []}` before limiter and key (`suggestOutfits.js:340-344`); test "fewer
  than 2 usable candidates -> 200 [] without quota, key or fetch" (31 calls, 0 fetch, 0 getSecret, then a real
  call passes).
- [x] AC 4 — `rateLimit.js:17,26` `suggest` 30/24 h per user, 600/24 h global (owner skips global via existing
  limiter); `rateLimit.test.ts` kind lists extended; "30 pass, the 31st is 429 before getSecret; tag-photo is
  still allowed; passes 24 h later".
- [x] AC 5 — separate `suggestSlots` `app.js:74-75` (1/user, 2 total, owner exempt), acquired before any await
  and before the limiter (`suggestOutfits.js:324-325`), released in `finally`; tests "second concurrent call ->
  503 ai_busy + Retry-After, no quota used", "a held tag-photo call does not block suggest", "owner passes when
  two other users hold the total".
- [x] AC 6 — text only: `claude.js` `suggestWithClaude` content `[{type:"text"}]`; `gemini.js` `suggestWithGemini`
  `parts: [{text}]`; prompt data block has only alias, category, colors, seasons, material, wearCount,
  daysSinceWorn, name, avoid (`outfitSuggest.js:133-143`) — no id, notes, brand, tags, size, price, location,
  photos. Tests: `claude.test.ts:271` / `gemini.test.ts:401` (text-only, key only in header, no image /
  `inline_data`, no temperature for Gemini), `outfitSuggest.test.ts` › "uses aliases i1..iN … no UUID or private
  field", "secrets and logs" tests (key, names, reason absent from logs and responses).
- [x] AC 7 — `parseSuggestBody` exact keys, 1..40 UUIDs lowercased+deduped, `avoidIds` 0..40, season in
  `SEASONS`, weather exactly three booleans; `readJson` 8 KB + `application/json` + body timeouts; all before
  `limiter.check`. Tests: `outfitSuggest.test.ts` › parseSuggestBody accept/reject; `suggestOutfits.test.ts` ›
  "bad body, wrong content type and over 8 KB -> 400/415/413, no quota, no fetch".
- [x] AC 8 — only existing codes (`bad_request`, `db_unavailable`, `server_misconfigured`, `not_configured`,
  provider codes via `AI_ERROR_STATUS`, `rate_limited`, `ai_busy`, DB errors via `mapDbError`); `parity.test.ts`
  not in the diff and passes. Test "error codes" describe (lines 397-453).
- [x] AC 9 — adapter refactor is behaviour-neutral: request body key order and fields unchanged for tagging
  (`temperature: 0` kept for Gemini tag, tag tool/content identical). `git diff` of `claude.test.ts`,
  `gemini.test.ts`, `rateLimit.test.ts`, `tagPhoto.test.ts` shows removed lines only: the two import lines
  (claude/gemini, re-added with extra names) and the two `rateLimit.test.ts` kind lists extended with
  `"suggest"` (planned). `tagPhoto.test.ts` unchanged. Regression test `toGeminiSchema(buildTagSchema())` equals
  `buildGeminiSchema()`. All pass.
- [x] AC 10 — all checks green (above).

Ordering verified: slot → body → parse → candidates → limiter → store/key → adapter → validator
(`suggestOutfits.js:322-374`), as in plan step 6 / A7.

### Plan deviations recorded by the implementer
- **Aliases as `Record<string,string>`** (plan did not fix the type; validator takes `categoryById: Map` instead
  of `candidatesById`): accepted. Lookups use `Object.hasOwn`, so `__proto__`/`toString` cannot resolve (tested).
- **Isolation test fake fetch answers `suggest_outfits` calls**: accepted; purely additive to the shared fake,
  needed for A's positive path, does not change existing cases.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1 n/a (server only); R3 key only in the provider header, never in responses or logs
(tested); R4 no photos sent; R5 `wear_count`/`last_worn` read from `items_with_stats`; R7 every changed file is in
the plan's file list (`work/ming-todo.md` and ticket files are workflow bookkeeping); R8 pure logic in
`outfitSuggest.js` fully unit-tested. Scoping: the new SQL mentions `user_id` and runs through `withUser`
(read-only), so `scoping.test.ts` and RLS apply. High path `server/**` was named by the plan and approved by Ming.

### Blockers from review agents
None (security-ai-generated-code-auditor runs in parallel; the orchestrator copies any 🔴 here).
Security review attempt 1: PASS, no 🔴 (one 🟡: the 408 body-timeout path does not close the socket — follow-up; two 💭 notes).

### Nits (do not block)
- 💭 A pool with ≥2 rows but no valid combination (e.g. only shoes + accessory) still spends a `suggest` call and
  ends in `502 provider_bad_response`. The F-704.4 client draws candidates from the rule pool, so this is unlikely;
  a cheap server pre-check ("at least one one-piece, or a top and a bottom") would save the quota.
- 💭 `suggestOutfits.test.ts` rate-limit case asserts tag-photo `status !== 429` rather than a specific success;
  enough for "separate budget", but weak.
- 💭 `promptText` strips control characters only in the C0 range + DEL; C1 (`\u0080-\u009f`) and bidi controls
  pass into the prompt. Harmless for the model (data block is JSON-encoded), noted for consistency.

### Follow-ups (out of scope)
- F-704.4 (client slice): `createHttpAiOutfits`, `candidatePool`, toggle, fallback, 390px/dark mode.
- Ming's optional real-provider check after release (Claude tool use without an image, Gemini schema dialect with
  the alias enum) — plan "Ming verification after merge"; carry it into the PR body.
