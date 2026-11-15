# T-019.10: Join flow UX

| Field | Value |
|---|---|
| State | REWORK |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, ui |
| Gate | plan-approval |
| Depends on | T-019.7, T-019.13 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-13 |
| Claimed by | claude@2026-11-15T07:53:36Z |
| PR | — |

## Goal
New users can join `tudocuatui` from the app once org-admin-api ships the join endpoint (USR-03b).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.10). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.10, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] `not_member` with `join_available` shows "Tiếp tục với <email>"; join, then token.
- [ ] A refused join shows Vietnamese copy.
- [ ] The join screen shows the photo privacy notice before "Tiếp tục với <email>" (D38, T-019.13 plan A2). Proposed copy (Ming may edit): "Ảnh bạn tải lên được lưu trong Google Drive cá nhân của Ming (người vận hành TuDo), và Ming có thể xem được. Đừng tải lên ảnh có thông tin nhạy cảm." Also in Settings or near the photo picker if cheap.
- [ ] All checks pass; 390px and dark mode.

## Technical notes
- Files (likely): `src/features/auth/*`
- Upstream: org-admin-api USR-03b (join endpoint) must be live.

## Test plan
- See the umbrella plan *Tests to write* (T-019.10 rows).

## Notes / answers from Ming
- 2026-11-15 (Ming: "duyệt T-019.10"): **Plan approved**, including the join copy (Approach step 4) and the privacy notice as proposed.
- 2026-11-14: upstream ready — org-admin-api USR-03b (join for open apps) is live in v0.1.3; see its `docs/consumers.md` "Accounts" / "Join".
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff

### 2026-11-15 — claude — BLOCKED
- Done: plan.md READY (no consult areas): `join()` / `accounts()` in identityClient, join codes in errors, `tokenStore.join()` (token only after a successful join), new `JoinScreen.tsx`, AuthGate routes `not_member` + `join_available` from sign-in, reload and background refresh; privacy text in `src/constants/privacy.ts`, shown on the join screen and in the editor's photo picker (API mode only).
- In progress / next: Ming approves the plan and the Vietnamese copy (plan Approach step 4 + privacy text); then implement.
- Gotchas: T-019.12 edits the same auth files; whichever runs second rebases.
