<!-- PR title: T-030: Decide whether a 403 from the API signs the user out -->
<!-- Branch: ticket/T-030 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- Records D55 in `work/decisions.md`: a 403 from the Node API (e.g. `forbidden_origin`) is returned as an error, gets no token-refresh retry and does not call `onAuthLost` (Ming, 2026-11-23, option (a)); corrects the T-028.1 wording "only 401/403 sign out".
- `src/data/authFetch.ts`: doc comments only — the code already behaved this way, no runtime change.
- Three tests pin it: authFetch 403 pass-through, authFetch 401 → 403 on the retry, repo.http 403 `forbidden_origin` → `ApiError(403, forbidden_origin)` with no `onAuthLost`.

## Acceptance criteria
- [x] Ming's decision is recorded in `work/decisions.md` — D55 at `work/decisions.md:64` (review.md).
- [x] Tests cover a 403 per that decision; 401 and 503 behaviour unchanged — 3 new tests pass; test files only gain lines, existing 401/503 tests pass.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 1998 passed, 7 failed, 288 skipped on the agent's Windows machine; the 7 are the known Windows-only failures also on `main` (none in areas this diff touches). The two changed test files pass on their own (59 tests). Please confirm CI is green.

## Needs Ming's decision
- None. No High path touched.

## Follow-ups
- No 403 tests for the photo loader and AI clients (`photoUrls`, `aiOutfits`, `aiSettings`, `aiTagging`); they share `createAuthedFetch`, so the behaviour is the same.
- `photoUrls.ts:73` maps a 403 to `ApiError(403, "unexpected")`, dropping the server code (UX only); its `onAuthLost` doc comment (`photoUrls.ts:18`) does not mention D55.
- Nit: `src/data/authFetch.ts:18` comment is 135 characters.

Links: [plan.md](work/tickets/T-030/plan.md) · [review.md](work/tickets/T-030/review.md) · [security-review.md](work/tickets/T-030/security-review.md) · [impl-log.md](work/tickets/T-030/impl-log.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
