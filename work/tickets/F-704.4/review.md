Verdict: PASS

## Attempt 1 — 2026-11-18 (slice 1: client and pure logic)
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check` — "All matched files use the correct format." (324 files), exit 0
- `pnpm typecheck` — `tsc --noEmit && tsc -p tsconfig.server.json` clean, exit 0
- `pnpm test` — Test Files 131 passed | 11 skipped (142); Tests 1734 passed | 222 skipped (1956), exit 0 (matches impl-log).
  Targeted run of `src/data/aiOutfits.test.ts` + `src/features/outfits/suggest.test.ts`: 2 files, 65 tests passed, none skipped.
- `pnpm build` — "✓ built in 487ms", exit 0

### Acceptance criteria
- [x] 1. Request shape — evidence: `src/data/aiOutfits.ts:221-234` (POST `${base}/ai/suggest-outfits`, Accept + Content-Type JSON, `cache: "no-store"`, `credentials: "same-origin"`, `redirect: "manual"`, `signal`, via `createAuthedFetch`); body is exactly `{candidateIds, season, weather:{cold,hot,rain}}` plus `avoidIds` only when non-empty (`:224-229`). Matches `server/ai/outfitSuggest.js` `parseSuggestBody` (exact key set with optional `avoidIds`, `weather` exactly `{cold,hot,rain}` booleans, `season` a DB id from `SEASONS`). Tests: "posts JSON to /api/ai/suggest-outfits", "sends avoidIds only when non-empty" (`[]` and `undefined` → no key), "adds the bearer token" — pass.
- [x] 2. Response parsing — evidence: `parseOutfits` `aiOutfits.ts:195-207`; server answers `{outfits: [{itemIds, reason}]}` (`server/ai/suggestOutfits.js:66,98`). Tests "returns the outfits", "drops malformed entries", "malformed 200 -> internal" (`{}`, `{outfits:"x"}`, `null`), "non-JSON body -> internal" (200, 502) — pass.
- [x] 3. Error mapping identical to `createHttpAiTagger` (`aiTagging.ts`): abort rethrown before mapping (`aiOutfits.ts:236`), 401 → `unauthorized`, other rejections → `network`, non-JSON → `internal` with status, non-OK → `isServerErrorCode` code or `internal`, `requestId` kept (`:248-256`). Tests: `it.each` over rate_limited/ai_busy/not_configured/provider_bad_response/request_timeout, "unknown code -> internal, request id kept", "network rejection -> network", "401 twice -> unauthorized and onAuthLost", "aborted signal rejects with the abort error, not network" — pass.
- [x] 4. `candidatePool` eligibility/cap — evidence: `suggest.ts:576-591` takes `pools`/`outerWanted` from the same private `eligibility()` used by `suggestOutfits` (`suggest.ts:480-520`, `ruleRole` `:523-527`); outer only when `outerWanted`; cap `AI_CANDIDATE_CAP = 40`. Tests "only active items in rule categories", "season step" (incl. fit-or-all fallback), "outer only when the rules add one" (4 cases), "caps at 40" — pass.
- [x] 5. Order and round-robin — evidence: comparator `byUnworn` `suggest.ts:565-570` (never-worn → worn with empty `lastWorn` → oldest `lastWorn`, then `createdAt`, then `id`: total order, so input-order independent); round-robin over fixed `POOL_ROLES` `:563,585-589`, loop terminates when every list is exhausted. Tests "orders never-worn, then longest-unworn, within a role", "round-robin keeps every role under the cap", "same result for shuffled input", "empty wardrobe -> []" — pass.
- [x] 6. `toAiOutfits` — evidence: `suggest.ts:613-631`: map built from `ruleRole`-eligible items (active, not bikini/other), unknown/archived/excluded id drops the whole outfit, 1–5 ids, no duplicate ids, no repeated id set, empty cleaned reason dropped, cap 3, server order kept; one-piece alone kept (consistent with F-704.1 rules the server enforces). Tests: all six `describe("toAiOutfits")` cases pass.
- [x] 7. `cleanReason` — evidence: `suggest.ts:596-610`: NFC first, strips C0 (except U+0009–000D), DEL, C1 (incl. U+0085), U+200B–200F, U+2028/2029, U+202A–202E, U+2066–2069, U+FEFF; collapses `\s+`, trims, cuts to 120 code points with `Array.from`. Tests "removes bidi, zero-width, line/paragraph separators and controls", "NFC and Vietnamese kept" (`đ`, `Đ`), "collapses whitespace, trims, cuts to 120 code points" — pass.
  **Judgement on tab/newline:** collapsing U+0009–000D to a single space instead of deleting them is the right call: deleting would glue words together ("đi\nchơi" → "đichơi"), while the result is still one line of plain text with no control characters, which is what security-review item 2 and A4 ask for. It does not contradict plan AC 7, which also says "collapses whitespace runs to one space". See nit 1 for the small inconsistency with U+2028/2029.
- [x] 8. `suggestOutfits` unchanged — evidence: `git diff --numstat origin/main...HEAD -- src/features/outfits/suggest.test.ts` = `164 0` (additions only: imports, `DEC` const, three new `describe` blocks); all existing cases pass. Refactor review: `wanted`, `byRole` grouping (now via `ruleRole`, same predicate), fit-or-all per role (same item order), and the outer condition are moved verbatim into `eligibility()`; `mulberry32(seed)` is still created before the first `rank` call and no random draw happens in between; `rank` calls keep their order (one-pieces, top/bottom, shoes, conditional outer, accessory), so seeded output is identical.
- [x] 9. Scope / R1 — evidence: `git diff --stat origin/main...HEAD` lists only `src/data/aiOutfits.ts`, `src/data/aiOutfits.test.ts`, `src/features/outfits/suggest.ts`, `src/features/outfits/suggest.test.ts` plus `work/tickets/F-704.4/*`; the only new `fetch` is in `src/data/aiOutfits.ts`; no component or UI change.
- [x] 10. All checks pass — see Checks above.

Ming verification after merge: none for this slice (plan); the manual check with real Claude and Gemini keys moves to F-704.5.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1: data access only in `src/data/aiOutfits.ts`, no component fetch, no fallback mode. R5: wear data only read. R6: no UI copy added. R7: only the four planned files. R8: every new pure function and the client have unit tests. R9: n/a (no UI). No High path touched; no review trigger path matched.

### Blockers from review agents
None (no review trigger matched).

### Nits (do not block)
- 💭 `cleanReason` (`suggest.ts:602`): U+2028/2029 are deleted while `\n`/`\t` collapse to a space, so "a b" becomes "ab" but "a\nb" becomes "a b". Mapping U+2028/2029 to a space (or letting `\s+` handle them, since JS `\s` already matches them) would be more consistent. The plan and its test ask for removal, so this is not a defect.
- 💭 `cleanReason`: the 120-code-point cut happens after `trim()`, so a cut that lands on a space leaves one trailing space. Harmless as a JSX text node; a final `.trimEnd()` would tidy it.
- 💭 `AiSuggestInput.season` is typed `string`; `seasonOf()` returns a Vietnamese label ("Đông"), while the server needs the DB id (`"winter"`). F-704.5 must map it through `SEASON_TO_DB` (the doc comment at `aiOutfits.ts:179` says so); a narrower type would catch the mistake at compile time.

### Follow-ups (out of scope)
- F-704.5: map `seasonOf(now)` through `SEASON_TO_DB` before calling `suggest`; skip the call when `candidatePool` returns fewer than 2 items (as planned).
