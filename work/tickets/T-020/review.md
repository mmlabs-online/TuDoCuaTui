## Attempt 1 — 2026-11-16
Verdict: PASS

### Checks (run by reviewer)
- typecheck: exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: exit 0, "All matched files use the correct format." (250 files)
- test: Test Files 95 passed | 9 skipped (104); Tests 1232 passed | 176 skipped (1408). Matches impl-log.
- build: `✓ built in 374ms`
- `grep -rn "constants/privacy\|PHOTO_PRIVACY_NOTICE\|Google Drive cá nhân" src`: no output (exit 1). `src/constants/privacy.ts` does not exist.

### Acceptance criteria
- [x] No privacy notice on the join screen or in the editor (API and local mode); join screen keeps title, body, error, "Tiếp tục với <email>" and "Dùng tài khoản khác". Evidence: `src/features/auth/JoinScreen.tsx:13-14` (info notice removed, error notice kept); `src/features/items/Editor.tsx:130-138` (notice block removed, `photoById` prop still used at :174/:179). Tests pass: `JoinScreen.test.tsx › renders title, body, continue and other-account, and no photo privacy notice`; `Editor.test.tsx › photo privacy notice › no photo privacy notice with or without photoById` (covers `photoById=true`, i.e. API mode, and false, i.e. local mode); `AuthGate.test.tsx › join flow › sign-in: not_member + join_available …` (line 504 now asserts `queryByText(/Google Drive/)` is null). The existing JoinScreen error/other-account tests still pass.
- [x] `src/constants/privacy.ts` removed; no import of it remains. Evidence: the file is deleted in 75ad2ce, the grep above is empty, and typecheck is green.
- [x] All checks pass; 390px and dark mode unchanged apart from the removed line. Evidence: checks above. Playwright (Chrome, 390x844, `pnpm dev` local mode). `/auth-preview.html` with screen "Tham gia" in light and dark: no "Google Drive" text, scrollWidth = clientWidth = 390, both buttons present, no page errors, card layout intact. App editor ("Món đồ mới") in light and dark: no "Google Drive" text, scrollWidth = clientWidth = 390, photo area and caption render normally. The diff adds no classes or styles.

### Issues
None.

### Scope
`git diff 0ac57cf..HEAD --stat` touches exactly the plan's 8 `src` files plus `work/tickets/T-020/{impl-log.md,ticket.md}`. There are no out-of-plan files, and nothing changed outside the plan.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data-access change. R6: the dead copy keys `join.privacy` and `photo.privacy` were removed. R7: the diff stays within the plan. R8: tests were updated and checks are green. R9: verified at 390px in light and dark. R10: no Figma Make files touched. The change in `src/features/auth/**` is markup/copy only and does not alter the auth flow.

### Nits (do not block)
- `Editor.test.tsx:210`: the `describe("photo privacy notice")` name is kept for a test that now asserts absence. That is acceptable, but a name like "no photo privacy notice" would read more clearly.
- `JoinScreen.tsx` no longer uses `AuthNotice kind="info"`. The variant is still used elsewhere, so this needs no action.

### Follow-ups (out of scope)
- None.
