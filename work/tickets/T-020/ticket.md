# T-020: Remove the Google Drive photo privacy notice

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | XS |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | ui |
| Gate | none |
| Depends on | T-019.10 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/60 |

## Goal
Stop showing the photo privacy notice ("Ảnh bạn tải lên được lưu trong Google Drive cá nhân của Ming…") anywhere in the app.

## Feature reference
Ming, 2026-11-16: "bỏ màn hình thông báo GGdrive". Reverses the T-019.10 privacy-notice criterion and D38's privacy-notice part (recorded as D40).

## Scope
- Remove the notice from the join screen (`src/features/auth/JoinScreen.tsx`, `AUTH_COPY.join.privacy`) and from the editor's photo picker (`src/features/items/Editor.tsx`, `EDITOR_COPY.photo.privacy`).
- Delete `src/constants/privacy.ts` once nothing imports it.
- Update the tests that assert the notice (`JoinScreen.test.tsx`, `AuthGate.test.tsx`, `Editor.test.tsx`) so they assert it is gone; keep every other assertion.

## Out of scope
- Any change to where photos are stored, quotas or the join flow itself.

## Acceptance criteria
- [ ] No privacy notice text on the join screen or in the editor (API and local mode); the join screen keeps title, body, error, "Tiếp tục với <email>" and "Dùng tài khoản khác".
- [ ] `src/constants/privacy.ts` removed; no import of it remains.
- [ ] All checks pass; 390px and dark mode unchanged apart from the removed line.

## Notes / answers from Ming
- 2026-11-16 (Ming): "bỏ màn hình thông báo GGdrive" → remove the notice everywhere (join screen and editor).

## Handoff

### 2026-11-16 — claude — DONE
- Done: plan, implement attempt 1, review PASS (checks + 390px light/dark). PR https://github.com/mmlabs-online/TuDoCuaTui/pull/60.
- In progress / next: Ming merges; ships with the next release.
- Gotchas: an earlier `git checkout origin/main --` detached HEAD in the session clone; the branch was re-pointed to HEAD before the PR.
