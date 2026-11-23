<!-- PR title: BUG-008: Stale "Tiếp tục với" list after a retry, and no re-list after a join-lookup sign-out -->
<!-- Branch: ticket/BUG-008 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- `failTo` in `src/features/auth/AuthGate.tsx` clears the "Tiếp tục với" account list on the retry and other signed-out branches, so a failed continue → retry → `not_member` no longer shows a stale list (B1).
- `offerJoin` captures `signOutSeq` before the join lookup; when the account id disappears during the lookup and no remote sign-out happened, it routes to `failTo({ code: "session_invalid" })` and re-lists accounts from Identity (B2, B3 guard).
- Regression tests T1–T3 added to `AuthGate.test.tsx` (additions only).

## Acceptance criteria
- [x] Regression test for case 1 fails on `main` before the fix — T1: `expected <button> to be null` on main's `AuthGate.tsx` (reviewer re-ran it).
- [x] Regression test for case 2 — T2 fails on main (`Unable to find role="button" and name "Tiếp tục với me@b.co"`), passes with the fix; T3 fails once the `signOutSeq` guard is removed.
- [x] All checks pass — format, typecheck, build green; `pnpm test` all 84 `AuthGate.test.tsx` tests pass. See Checks for the Windows-only failures.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 1995 passed, 7 failed on the agent's Windows machine. The same tests fail on a clean `origin/main` (6 failed + 1 flaky in `server/ai/tagPhoto.test.ts`), in `server/api.test.ts`, `server/ai/tagPhoto.test.ts`, `server/index.cli.test.ts`, `server/scoping.test.ts`, `src/features/auth/boundary.test.ts` (backslash path separators, socket resets). CI (Linux) is the source of truth — please confirm it is green, especially `boundary.test.ts`.

## Needs Ming's decision
- High path (`src/features/auth/**`): plan approved 2026-11-23 (B1–B3). Ming reviews this PR.
- Optional check after deploy: go offline, click "Tiếp tục với", go back online and press "Thử lại"; a `not_member` answer should show the form with no list.

## Follow-ups
- Security 🟡 3: AuthGate handlers that call `store.forget()` do not bump `signOutSeq`; if a future change calls `forget()` during a join lookup, the left account would be re-listed. Relevant to T-029 / T-031.
- Windows-only test failures make `pnpm test` red locally for every ticket (debt).
- `.claude/loop.config.md` › High paths omits `src/features/auth/**` while CLAUDE.md lists it.
- Nit: the comment at `src/features/auth/AuthGate.tsx:161` is ~170 characters on one line.

Links: [plan.md](work/tickets/BUG-008/plan.md) · [review.md](work/tickets/BUG-008/review.md) · [security-review.md](work/tickets/BUG-008/security-review.md) · [impl-log.md](work/tickets/BUG-008/impl-log.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
