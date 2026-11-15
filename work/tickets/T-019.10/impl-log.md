## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| `src/constants/privacy.ts` (new) | One source of `PHOTO_PRIVACY_NOTICE` (D38, R6); text verbatim from the ticket |
| `src/features/auth/identityClient.ts` | `join(accountId)`, `accounts()`, private `get()` helper (AC1) |
| `src/features/auth/types.ts` | Three join codes, `AuthError.joinAvailable`, `JoinScreenProps` |
| `src/features/auth/errors.ts` | Accept join codes; `joinAvailable` only for `details.join_available === true` |
| `src/features/auth/tokenStore.ts` | In-memory email, `accountEmail()`, `join()` (token only after join; generation guard; no new storage) |
| `src/features/auth/JoinScreen.tsx` (new) | The "Tiếp tục với <email>" screen |
| `src/features/auth/AuthGate.tsx` | `join` view, `offerJoin`/`onTokenError`, join click is the only caller of `store.join()` (ref guard against double submit) |
| `src/features/auth/copy.ts` | `AUTH_COPY.join`, three join error messages, preview label |
| `src/features/auth/preview/AuthPreview.tsx` | Preview screen "Tham gia" (390px / dark check) |
| `src/features/items/copy.ts` | `EDITOR_COPY.photo.privacy` |
| `src/features/items/Editor.tsx` | Notice after `.photo-source-actions`, only when `photoById` |
| `identityClient.test.ts`, `errors.test.ts`, `tokenStore.test.ts`, `copy.test.ts`, `JoinScreen.test.tsx` (new), `AuthGate.test.tsx`, `Editor.test.tsx` | R8, tests listed in the plan |

### Tests added / changed
- identityClient.test.ts: 5 join/accounts cases (request shapes, response validation, join errors, accounts validation)
- errors.test.ts: "not_member joinAvailable only for === true", "join codes accepted; app_mismatch -> unknown"
- tokenStore.test.ts: 5 join/accountEmail cases; "never writes anything but mm_account_id" extended to run a join; fake client got `join`/`accounts`
- copy.test.ts: record extended with the three join codes
- JoinScreen.test.tsx: 5 cases (email button, privacy before button via compareDocumentPosition, submitting, error + other account, markup as text)
- AuthGate.test.tsx: "join flow" block, 14 tests incl. it.each of 6 codes (sign-in, restore, no match, no join_available, click + double click, join_* errors with retry, session_invalid, other account, background refresh); `setup` got `join`, `accounts`, `firstTokenError` (restore effect runs at render)
- Editor.test.tsx: "photoById shows the photo privacy notice; without it there is no notice"

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: "All matched files use the correct format." (242 files)
- test: Test Files 90 passed | 9 skipped (99); Tests 1162 passed | 176 skipped (1338)
- build: `built in 542ms`, success

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- A failed `accounts()` lookup with a non-network error (for example `session_invalid`) goes through `failTo` and leaves the id until the next `/token` rejects it; harmless, left as planned.
- Visual check at 390px / dark mode in `/auth-preview.html` and the editor in `pnpm dev` not done by the implementer (no browser); reviewer/Ming to check.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +507 / -4 tracked lines (15 files), plus 3 new files (`privacy.ts`, `JoinScreen.tsx`, `JoinScreen.test.tsx`). Not committed.

## Attempt 2 (REWORK)

Fixes only the latest review: Issue 1, Issue 2 and security S1.

### Files touched
- `src/features/auth/JoinScreen.tsx`: label span is now `whitespace-normal break-all`. Required because `.btn` sets `white-space: nowrap` (Issue 1).
- `src/features/items/Editor.tsx`: privacy notice is `mt-2 text-xs` with `#fff8eb` at opacity 0.85 (Issue 2).
- `src/features/auth/tokenStore.ts`: `join()` returns `Promise<boolean>`, true only if the store generation is unchanged after the join and the token fetch (S1).
- `src/features/auth/AuthGate.tsx`: `joinSeq` ref; `join()` ignores success and error when the seq changed or the view is no longer `join`, and calls `enterReady()` only if `store.join()` returned true; `onUseOtherAccount` bumps `joinSeq` and resets `joining.current` (S1). "Dùng tài khoản khác" is not disabled while busy.
- Tests: `JoinScreen.test.tsx` (long-email label has `whitespace-normal`), `AuthGate.test.tsx` (2 tests: A's join resolves late, A's join rejects `session_invalid` late; B stays ready, no remount, no extra token call, B's id kept).

### Checks
- `pnpm typecheck`: clean.
- `pnpm format:check`: all matched files use the correct format.
- `pnpm test`: 90 files passed, 9 skipped; 1165 tests passed, 176 skipped.
- `pnpm build`: built.

### Out-of-plan files: none. Follow-ups: none new.
Scope self-check: only the listed review issues; not committed.
