# T-028.2: Share the sign-in session across tabs and renew tokens before they expire

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | M |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-028.1 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-19T03:05:00Z |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/90 |

## Goal
Several TuDoCuaTui tabs stay in step: one renewal at a time, a token renewed in one tab is reused by the others, and signing out in one tab signs out all of them.

## Feature reference
"Sign in with mmlabs" consumer spec (reference ricotdin; contract org-admin-api `docs/consumers.md`, which wins on conflict); `work/decisions.md` D50 (what TuDoCuaTui adopts and where it differs), D31/D32 (rows keyed by `sub`), D37, D38 (owner sub), D46 (12 h tokens).

## Scope
- `/token` renewals serialised across tabs with a Web Lock (`navigator.locks.request("tudocuatui-auth-refresh", …)`), still single-flight per tab; fallback when Web Locks are missing.
- `BroadcastChannel("tudocuatui-auth")`: the renewing tab posts `{type:"token", accessToken, expiresAt, at}`; a tab that gets a 401 adopts a token another tab received in the last 10 s; `{type:"signedOut"}` signs out every tab. Messages are validated; tokens never leave memory.
- Proactive renewal timer 60 s before `exp` (tokens last 12 h, D46), plus the existing one retry after an API 401.
- Sign-out: drop the token, clear `mm_account_id`, broadcast, wait for a running renewal, then `POST /logout`; the epoch counter drops late answers; if `/logout` is not confirmed, the sign-in page warns (shared-computer note).
- 409 `email_already_verified` on resend → get a token.

## Out of scope
- Sign-in page account list (T-028.3); verifier (T-028.1).

## Acceptance criteria
- [ ] Two tabs (fake lock + channel): one `/token` call, both get the token.
- [ ] A 401 in one tab adopts a token broadcast within 10 s instead of signing out; older tokens are ignored.
- [ ] Sign-out in one tab signs out the other; a renewal answer arriving after sign-out is dropped.
- [ ] Renewal fires 60 s before expiry (fake timers).
- [ ] Unconfirmed `/logout` shows a warning on the sign-in page.
- [ ] Resend → 409 `email_already_verified` gets a token.
- [ ] No token in storage, URLs or logs; works when `localStorage`, Web Locks or BroadcastChannel are unavailable.
- [ ] 390px and dark mode for the warning; all checks pass.

## Technical notes
- High path (`src/features/auth/**`): plan approval; route to `security-ai-generated-code-auditor` at review.
- Files: `src/features/auth/tokenStore.ts`, `identityClient.ts`, `AuthGate.tsx`, new broadcast/lock helpers + tests.

## Notes / answers from Ming
- 2026-11-19 — Plan approved by Ming ("duyệt T-028.2"), including assumptions A1–A6.
- 2026-11-19 — After attempt 1 (review PASS, security PASS), Ming chose "Sửa cả 3 trong PR này": change the A6 warning copy to "Bạn đã đăng xuất khỏi Tủ đồ của tôi trên trình duyệt này, nhưng chưa xác nhận được việc đăng xuất khỏi tài khoản mmlabs. Nếu đây là máy dùng chung, hãy kết nối mạng rồi đăng nhập và đăng xuất lại, hoặc xoá dữ liệu duyệt web (cookie) của trình duyệt này."; fix the short-token renewal loop; fix the join-screen spinner stall.

## Handoff

### 2026-11-19 — claude — BLOCKED
- Done: consult software-architect; plan READY (refreshLock.ts Web Lock, authChannel.ts BroadcastChannel + parseAuthMessage, lock-guarded renewal with double-check and broadcast, proactive timer 60 s before exp, cross-tab signedOut, signOut returns {confirmed} + logout_unconfirmed warning, 409 email_already_verified → restore, /token 15 s timeout).
- In progress / next: waiting for Ming's plan approval (M-34; src/features/auth/** is High); then implement.
- Gotchas: assumptions A1–A6 in plan.md need approval; AuthGate/SignInScreen/copy hotspots shared with T-028.3.

### 2026-11-19 — claude — DONE
- Done: plan approved; refreshLock.ts (Web Lock) + authChannel.ts (BroadcastChannel, parseAuthMessage); lock-guarded renewal with double-check and broadcast; proactive renewal 60 s before exp (min 15 s); cross-tab sign-out; signOut returns {confirmed} + logout_unconfirmed warning; 409 email_already_verified → restore; /token 15 s timeout. Attempt 1 PASS + security PASS; attempt 2 (Ming: new warning copy, short-token loop, join spinner) PASS + security PASS. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/90.
- In progress / next: Ming merges the PR; then T-028.3 (Continue as) and T-028.4 (/api/auth/me).
- Gotchas: real-browser lock/channel ordering is not visible in jsdom — check two real tabs after deploy.
