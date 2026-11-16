Status: READY

# Plan — T-020: Remove the Google Drive photo privacy notice

## Feature summary
T-020 is not in `docs/feature-list.md`. It comes from Ming's decision in `work/decisions.md`:

> | D40 | 2026-11-16 | No photo privacy notice | Ming: "bỏ màn hình thông báo GGdrive". The Google Drive photo privacy notice is removed from the join screen and the editor (T-020). Amends D38 (privacy notice before M-22) and T-019.10's notice criterion; photos still live in Ming's Drive with per-user quotas (T-019.14). |

Ticket goal: "Stop showing the photo privacy notice ("Ảnh bạn tải lên được lưu trong Google Drive cá nhân của Ming…") anywhere in the app."
`docs/` does not mention the notice (grep for "privacy notice" / `PHOTO_PRIVACY` finds nothing), so no doc changes are needed.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | No privacy notice text on the join screen or in the editor (API and local mode). The join screen keeps title, body, error, "Tiếp tục với <email>" and "Dùng tài khoản khác". | `JoinScreen.test.tsx › renders title, body, continue and other-account, and no photo privacy notice` (new); `Editor.test.tsx › no photo privacy notice with or without photoById` (rewritten); `AuthGate.test.tsx › join flow › sign-in: not_member + join_available -> join screen…` still passes and now asserts the notice is absent. The existing JoinScreen tests (continue click, submitting, error notice / other-account, markup email, long email wrap) still pass unchanged. `grep -rn "Google Drive cá nhân\|PHOTO_PRIVACY_NOTICE\|\.privacy\b" src` returns nothing. Local mode: `pnpm dev`, open the editor, check there is no notice line under the photo buttons (local mode never showed it because `photoById` was false; API mode is covered by the `photoById=true` test case). |
| 2 | `src/constants/privacy.ts` removed; no import of it remains. | The file does not exist; `grep -rn "constants/privacy" src` returns nothing; `pnpm typecheck` is green. |
| 3 | All checks pass; 390px and dark mode unchanged apart from the removed line. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all green. The diff removes one JSX element per screen and adds no styles or classes, so layout and dark mode are unaffected except for the missing line. Optional visual check: the auth preview (`AuthPreview.tsx`, "join" screen) at 390px in light and dark. |

## Ming verification after merge
None. Optionally, Ming can look at the hosted join screen and editor and confirm the notice is gone.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/constants/privacy.ts` | Delete | AC 2; nothing else uses it once the two copy entries are gone. |
| `src/features/auth/copy.ts` | Remove the `PHOTO_PRIVACY_NOTICE` import (line 1) and `join.privacy` (line 64) | The copy entry exists only for the notice (R6: copy lives in one place, so a dead key is removed rather than left behind). |
| `src/features/auth/JoinScreen.tsx` | Remove `<AuthNotice kind="info">{copy.privacy}</AuthNotice>` (line 14). Keep the `AuthNotice` import, since the error notice still uses it. | AC 1 (join screen). |
| `src/features/items/copy.ts` | Remove the `PHOTO_PRIVACY_NOTICE` import (line 1) and `photo.privacy` (line 11) | Dead copy once the editor stops rendering it. |
| `src/features/items/Editor.tsx` | Remove the `{photoById && (<p …>{EDITOR_COPY.photo.privacy}</p>)}` block (lines 138-142). **Keep the `photoById` prop**, because line 179 onwards still uses it to remove photos. | AC 1 (editor). |
| `src/features/auth/JoinScreen.test.tsx` | Remove the `PHOTO_PRIVACY_NOTICE` import. Replace the test "privacy notice is rendered and precedes the continue button in DOM order" with the absence test below. | Tests that assert the old behaviour would fail; the ticket says to assert the notice is gone. |
| `src/features/auth/AuthGate.test.tsx` | Line 504: replace `expect(screen.getByText(AUTH_COPY.join.privacy)).toBeTruthy();` with `expect(screen.queryByText(/Google Drive/)).toBeNull();`. Leave the rest of the test as it is. | `AUTH_COPY.join.privacy` no longer exists (typecheck would fail). |
| `src/features/items/Editor.test.tsx` | Remove the `PHOTO_PRIVACY_NOTICE` import (line 3). Rewrite the `describe("photo privacy notice")` block (lines 211-220) as the absence test below. | `EDITOR_COPY.photo.privacy` and the constant no longer exist. |

Checked and **left unchanged**:
- `src/features/auth/preview/AuthPreview.tsx`: renders `<JoinScreen>` with props only and never refers to the notice. It loses the line automatically.
- `src/features/auth/types.ts`: `JoinScreenProps` has no privacy field.
- `src/features/auth/copy.test.ts`, `src/features/auth/boundary.test.ts`, `src/features/layout/copy.test.ts`, `src/features/settings/copy.test.ts`, `src/shared/ai/boundary.test.ts`: none of them mention the notice or `privacy` (grep across `src/` finds no other hits).
- `server/`, `e2e`/CI, `docs/`: no references.
- `src/App.tsx:198` (`photoById={wardrobe.mode === "api"}`): still needed for photo removal.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/auth/JoinScreen.test.tsx › renders title, body, continue and other-account, and no photo privacy notice` | AC 1: `getByText(AUTH_COPY.join.title)`, `getByText(AUTH_COPY.join.body)`, the `Tiếp tục với an@example.com` button, the `AUTH_COPY.join.otherAccount` button, and `queryByText(/Google Drive/)` is null. The error notice is already covered by the existing test. |
| `src/features/items/Editor.test.tsx › photo privacy notice › no photo privacy notice with or without photoById` | AC 1: `renderEditor(vi.fn(), true, true)`, then `queryByText(/Google Drive/)` is null; `cleanup()`; same check with `photoById=false`. |
| `src/features/auth/AuthGate.test.tsx › join flow › sign-in: not_member + join_available -> …` (existing, one line changed) | AC 1 through the real gate flow (API mode). |

Use the literal regex `/Google Drive/` for the absence checks, because the constant is being deleted. A regex catches the sentence even if it were split across nodes.

## Approach
1. Delete the notice in `JoinScreen.tsx` and `Editor.tsx` (the two render sites).
2. Remove `join.privacy` and `photo.privacy`, along with their imports, from the two copy files.
3. Delete `src/constants/privacy.ts`.
4. Update the three test files as described above.
5. Run `grep -rn "constants/privacy\|PHOTO_PRIVACY_NOTICE\|Google Drive cá nhân" src` and expect no output. Then run the checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`.

Rules:
- R1: no data access changes; local mode is unaffected.
- R6: copy stays in the per-feature copy files; the removed keys leave no dead copy behind.
- R7: only the files listed above. `photoById` stays, and no other editor or join-flow changes are made (ticket out of scope: storage, quotas, join flow).
- R8: tests are updated, and the checks must be green.
- R9: removing an element only. No new classes, so 390px and dark mode are unchanged apart from the missing line.
- R10: no Figma Make files are touched.

`src/features/auth/**` is listed as High risk for the *auth flow*. This change touches only copy and markup, not flow logic, and the ticket has `Gate: none`, so there is no plan approval gate.

## Specialist input used
None (no consult files; areas are `ui` only).

## Assumptions
- "Everywhere" means the two render sites found in `src/` (join screen and editor). No other surface shows the notice (verified by grep).
- After the change, `JoinScreen` no longer uses the `AuthNotice kind="info"` variant. Six other auth screens and `AuthGate.tsx` still use it, so `AuthNotice.tsx` stays as it is.
- The T-019.10 ticket and plan files are history and are not edited. D40 already records the reversal.
- Hotspot: `src/features/items/Editor.tsx` and `src/features/auth/AuthGate.test.tsx` may be touched by other open tickets. The edits here are small, line-local deletions, so rebase conflicts should be trivial.

## Blocking questions
None.

## Split proposal
None (about 30 changed lines, no migration).
