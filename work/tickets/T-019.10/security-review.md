# Security review — T-019.10

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor)

Read-only (no shell); line numbers refer to the working tree at d46f15f. **No 🔴; one 🟡.**

### 🟡 S1 — a late join result can still change the gate after "Dùng tài khoản khác" (no gate-level generation guard)
`src/features/auth/AuthGate.tsx:245-261` (`join`), `:282-288` (`onUseOtherAccount`); `JoinScreen.tsx:19`; the link stays enabled while joining (`AuthLayout.tsx:28` has no `disabled`).
1. Click "Tiếp tục với A" → `joining.current = true`, `/join` for A pending.
2. Click "Dùng tài khoản khác" → `forget()`, view `signed_out`; `joining.current` stays `true`.
3. Sign in as B; B's App mounts.
4. A's join resolves → `store.join()` returns quietly; `:253` reads `store.accountId()` (now **B**) and calls `enterReady()` → B's App remounts, or B's App mounts before B joined (recovers via the background not_member path).
5. A's join rejects with `session_invalid` → `:258` sets `signed_out` while B is ready, **skipping `retireApp()`** and not clearing B's id; B's App unmounts but its generation stays current, so its callbacks still work.
6. `joining.current` stays `true` until A settles, so B's join click does nothing meanwhile.
`store.join()` itself is guarded (`tokenStore.ts:154-166`); no token for A is fetched or exposed.

### 🟢 Verified
- Join only on the button click (single call site `AuthGate.tsx:250`); not_member paths (`:200`, `:110`, `:124`) only call `offerJoin`.
- `join_available === true` strictly (`errors.ts:55-58`; `canJoin` `AuthGate.tsx:84-85`); nothing else read from `details`.
- Token only after join and for the current store generation (`tokenStore.ts:152-166`); `forget()` bumps the generation, drops `inflight`, clears `email`.
- Accounts lookup can't switch accounts: `accountEmail()` (`tokenStore.ts:142-151`) returns only the email matching the stored id; `identityClient.ts:160-171` filters to UUID ids with string emails.
- Error-code lookup safe (`errors.ts:46` fixed list; `copy.ts:116` `hasOwnProperty`); server text never echoed.
- No token in storage/URLs/logs; `boundary.test.ts:22-38` allowlist intact.
- Requests match the contract (`identityClient.ts:154-159`, `:44-95`): `credentials:"include"`, `X-MM-App`, join body `{account_id}`, reply `status === "member"`.
- "Dùng tài khoản khác" uses `forget()` (no `/logout`), clears the id.
- No XSS (`JoinScreen.tsx:17`, test with markup in email). Privacy notice before the button (`JoinScreen.tsx:14`); editor only when `photoById` (`Editor.tsx:138`).

### Recommendations
1. **S1:** capture a gate-level marker when the join starts (e.g. `generation.current` or a `joinSeq` ref bumped by `onUseOtherAccount`); after the await ignore success and error if it changed or the view isn't `join`; reset `joining.current` in `onUseOtherAccount`; optionally have `store.join()` return a boolean and call `enterReady()` only on true; optionally disable the link while busy. Test: join pending → other account → sign in as B → resolve / reject A's join with `session_invalid` → B unchanged, no extra `enterReady`.
2. Low: clear the id in `accountEmail` on `session_invalid` (generation-guarded).

### Risks
Server-supplied email shown as text (bidi/confusables only from Identity itself); cancelling after the join request was sent doesn't undo the server-side join (idempotent; click was consent).

### Open questions
Disable "Dùng tài khoản khác" while joining? Does the login reply always include `user.email` (fallback is the typed email, `identityClient.ts:112`)?

## Attempt 2 — 2026-11-15 (security-ai-generated-code-auditor)

Re-check of S1 only; read-only, tests not run. **🟢 S1 resolved; no new 🔴/🟡.**
- Every exit from `join` invalidates a pending join: `onUseOtherAccount` bumps `joinSeq` and resets `joining.current` first (`AuthGate.tsx:287-295`); the join's own result leaves only after `stale()` (`:254`, `:259`); no other path leaves `join` while pending (`store.subscribe` acts only in `ready` `:123`; restore effect keyed on `attempt` `:106-117`).
- Late A results can't affect B: gate captures `seq` (`:249`), `stale()` checks seq and view on both branches (`:250`); store `join()` returns false and skips `/token` when the generation changed (`tokenStore.ts:158,165,167`; `fetchToken` `:64,70`); `enterReady()` only on `joined && store.accountId()` (`AuthGate.tsx:257`). `session_invalid` → `signed_out` (`:263`) only from the join view, where no App is mounted and the App generation was already retired (`:124,138,147`).
- `joining.current` can't stick: reset on both non-stale branches (`:255,261`) and in `onUseOtherAccount` (`:289`); the stale early-return correctly leaves it.
- 🟢 notes / follow-ups: route any future exit from `join` through one helper that bumps `joinSeq` and resets `joining.current`; `join()` false while still on the join view leaves the button idle (fails safe, unreachable today); test gaps: assert `store.join()` resolves `false` after `forget()` (`tokenStore.test.ts:297`), B's join click works while A's join is pending, A's late success while B is on its own join view.
- Disabling "Dùng tài khoản khác" while joining is now a UX choice only.
