## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| src/constants/privacy.ts | Deleted (AC 2) |
| src/features/auth/copy.ts | Removed import and `join.privacy` |
| src/features/auth/JoinScreen.tsx | Removed the info notice element |
| src/features/items/copy.ts | Removed import and `photo.privacy` |
| src/features/items/Editor.tsx | Removed the `photoById` notice block (prop kept) |
| src/features/auth/JoinScreen.test.tsx | Replaced the notice test with an absence test |
| src/features/auth/AuthGate.test.tsx | Notice assertion changed to `queryByText(/Google Drive/)` null |
| src/features/items/Editor.test.tsx | Rewrote the notice block as an absence test |

### Tests added / changed
- JoinScreen.test.tsx › renders title, body, continue and other-account, and no photo privacy notice
- Editor.test.tsx › photo privacy notice › no photo privacy notice with or without photoById
- AuthGate.test.tsx › join flow › sign-in: not_member + join_available (one assertion changed)

### Checks (actual output summary)
- typecheck: green (tsc app + server, no errors)
- format:check: "All matched files use the correct format." (250 files)
- test: Test Files 95 passed | 9 skipped (104); Tests 1232 passed | 176 skipped (1408)
- build: built OK
- grep `constants/privacy|PHOTO_PRIVACY_NOTICE|Google Drive cá nhân` in src: empty

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? no
- Diff size: roughly +20 / -35 lines (not committed, per instruction)
