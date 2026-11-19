T-028.3 PLAN consult (read-only; frontend + auth-flow view). I read the ticket, D44/D46/D50, the T-028.2 plan/review/security-review, and the current auth code. I did not open AuthNotice.tsx, Btn, any test file other than a grep of AuthGate.test.tsx, or docs/identity-architecture.md.

## Findings (current code)
- Contract (org-admin `consumers.md:164-179`): `GET /auth/accounts` returns `{items:[{account_id,email,email_verified,display_name}]}`, oldest first, with cookie + `X-MM-App`. "Switching only changes the app's own `localStorage.mm_account_id`".
- `identityClient.accounts()` (`identityClient.ts:177-189`) already validates UUID and email and drops `email_verified`.
- `get()` (`identityClient.ts:81-101`) has no timeout. A hung `/accounts` would hold the "loading" state forever.
- The store has no way to pick an existing account. `signIn` is `login` + `reset()` + set id/email + `storage.write` + `renew()` (`tokenStore.ts:225-232`). `join` uses the same pattern.
- `onMessage` (`tokenStore.ts:204-221`) ignores any message whose `accountId` differs from this tab's id. `reset()` bumps `generation` (`:107-113`), and `renew` drops late answers of an older epoch (`:118-129`).
- AuthGate starts at `signed_out` (no id) or `checking` (id stored) (`AuthGate.tsx:52-54`). The form is rendered at `:434-448`. The error → view routing is `failTo` (`:89-95`) and `onTokenError` (`:121-122`).
- `email_unverified` today is only an error banner with a resend action inside `SignInScreen` (`SignInScreen.tsx:60-76`). The store keeps the id for `email_unverified` (`tokenStore.ts:157-159`), so `resendVerification` works (`AuthGate.tsx:310-327`).
- `VerifyEmailScreen` does not fit. It is the link-token machine (ready/verifying/verified/invalid/rate_limited), and its "invalid" state prints the `token_invalid` copy "Link xác minh không hợp lệ…" (`VerifyEmailScreen.tsx:43-46`). That is the wrong message for an unverified sign-in.
- `JoinScreen` already shows a long email with `whitespace-normal break-all` (`JoinScreen.tsx:15-19`). Copy it.

## Recommendations

### 1. Store: one new method, `continueAs(accountId, email?)` (AC1)
- `tokenStore.ts`: `reset(); id = accountId; email = email ?? null; storage.write(id); await renew();`. Put it in `TokenStore` (`:13-33`). Refactor `signIn` to share the same "adopt" tail so the two cannot drift.
- Calling `reset()` bumps the epoch, so a late answer from an earlier restore or continue is dropped.
- Seeding `email` means `accountEmail()` (`:297-306`) makes no second `/accounts` call when the token answer is `not_member` and the join screen opens.
- Do not call `signOut` or post `signedOut` for any previous id.
- Cross-tab: nothing new is needed, because messages are keyed by `accountId` (`:205`).
  - Tab B continuing as Y never signs out tab A (X). A ignores B's Y token broadcast, and A's `signedOut` for X is ignored by B.
  - The only cross-tab effect is that `mm_account_id` in the shared localStorage becomes Y. A's in-memory session keeps working, and a reload of A would adopt Y. This is the same as `signIn` today.
- Pre-existing hazard (noted by T-028.2 review.md:63, not part of this ticket): `signOut`/remote handler call `storage.clear()` unconditionally (`:219`, `:242`). A's later sign-out of X would wipe B's stored Y. Suggest a follow-up that clears storage only if `storage.read() === gone`. For the plan: record it as a follow-up and add a test documenting the current behaviour only if cheap.

### 2. AuthGate: accounts state and loading (AC1, AC2)
- Add `accounts: {accountId,email}[] | "loading" | null` and a `listSeq` ref (stale guard, like `joinSeq`).
- A helper `loadAccounts(exclude?: string)`:
  - sets "loading";
  - calls `client.accounts()`;
  - on any rejection (network, rate_limited, session_invalid, unknown) or an empty list sets `null`. Form only, no banner, no retry. This is AC2 and the "errors → form only" scope line;
  - drops the answer if `listSeq` moved on;
  - dedupes by lowercased id, filters out `exclude`, and caps the list at 5 (server order, oldest first; the form covers the rest).
- No flash: while `accounts === "loading"` (on the sign-in screen only), render the existing checking layout (`AuthLayout` + `AuthNotice busy` with `AUTH_COPY.gate.checking`, as at `AuthGate.tsx:354-361`). Do not render the form until the list resolves.
- When to load (only on the sign-in screen, never forgot/signUp):
  - mount with no stored id (initial state "loading" when `screen === "signIn"`, so the first paint is already the loader);
  - the remote sign-out handler (`:128-145`; the device may still hold other accounts);
  - `session_invalid` from a continue or restore (this is the contract's "re-list the accounts", `consumers.md:50`).
- When NOT to load (set `null` and bump `listSeq`; form only):
  - own sign-out (`:180-197`). The `/logout` answer is async, so listing right after would show the account the user just left, and one click would fail with `session_invalid`;
  - `onUseOtherAccount` (`:370-378`). The just-forgotten account would otherwise be offered again, which is a loop;
  - `onAuthLost` (`:198-204`);
  - after a password sign-in error (the list stays as loaded, no refetch).
- `goto("signIn")` from signUp/forgot: keep the existing list; do not refetch.
- `client.accounts()` needs a timeout. Add `AbortSignal.timeout(~8000)` to `get()` in `identityClient.ts:81`, mapped to `networkError` (the catch at `:90` already covers it). Otherwise a hung request keeps the loader forever. Add a test.

### 3. Continue handler in AuthGate (AC1; join flows unchanged)
- `continueAs(a)`: guard with a `continuing` ref (double click = one `/token`). Bump `signOutSeq`. Set `status="submitting"` and remember the chosen id for the per-button busy label. Then `await store.continueAs(a.accountId, a.email)`.
  - On success: `setStatus("idle"); if (store.accountId() !== null) enterReady();` (mirror `signIn` at `:250-253`).
  - On error: `setStatus("idle")`, then `canJoin(err)` → `void offerJoin()`. `canJoin` works because the id is set before `renew` (`:97-98`). Other codes go through `failTo`. network/rate_limited/unknown give the retry view, and its Retry runs `restore` on the stored id (`:382-397`). session_invalid gives `signed_out` + error + `loadAccounts()`.
  - Ignore a late result when `listSeq`/`signOutSeq` moved or `viewRef.current.kind !== "signed_out"`.
- Join consent (D8), join closed and join errors stay as they are (`join()` `:329-349`, `JoinScreen`). Continue never calls `store.join`. `join_closed` still surfaces only at the user's join click.
- G1 (security-review.md:163): after `continueAs` the email is seeded, so `offerJoin` makes no `accounts()` call and the session_invalid fall-through (`:105-110`) is not reachable from the list path. The copy still fits (the only way to clear the id is an Identity `session_invalid`). Note it in the plan and keep the `accountEmail()` fallback for restore.

### 4. `email_unverified` → dedicated screen (AC3)
- Add a view `{kind:"unverified"; email: string | null}` and a new small `UnverifiedScreen.tsx`, not `VerifyEmailScreen` (reason above). It reuses `AuthLayout`, `AuthNotice`, `Btn` and `LinkButton`.
  - Content: body "Chúng tôi đã gửi link xác minh tới {email}" (omit the email when null). Resend button with the `resend` state (reuse `ResendState`, `copy.actions.resend/resending/resendSent`). A "Tôi đã xác minh email" button that goes `checking` + `attempt++` (restore → token). A `LinkButton` "Dùng tài khoản khác" that runs `store.forget()` and goes to signed_out.
- Route it in one place: at the top of `failTo`, `if (err.code === "email_unverified" && store.accountId()) → unverified view`. That covers password sign-in (`:264`, where the existing `email` state holds the typed address), continue, restore and the background subscriber (`:164-172`). Take the email from the continue list, the typed email, or `null`; do not call `/accounts` for it.
- `resendVerification` (`:310-327`) is reused as-is, plus one fix: on `session_invalid` call `store.forget()` and go to signed_out with the error (today it only shows a banner, though the account is gone).
- Keep the `SignInScreen` email_unverified banner + resend as a fallback, to avoid test churn (R7). It simply stops being reachable from the main paths.
- Reset `resend` when entering/leaving the view (`goto` at `:231` already does for the form).

### 5. SignInScreen UI (R9, accessibility)
- New optional props in `types.ts` (`SignInScreenProps`): `accounts?: {accountId,email}[]`, `onContinueAs?: (a) => void`, `continuingId?: string | null`. Fewer screens, less state: render the list inside `SignInScreen`, above the form, after the notices.
- Markup: a `<section role="group" aria-labelledby>` (or a `<ul>` with `aria-label`) holding one `Btn type="button"` per account. First = `kind="primary"`, the rest the existing secondary kind (check `Btn` kinds). The label is `copy.signIn.continueAs(email)`, inside `<span className="whitespace-normal break-all">` as in `JoinScreen.tsx:16` so a long email wraps at 390 px. Keep a 44 px min height. The visible text is the accessible name; no extra aria-label.
- While submitting: all list buttons and the form submit are `disabled`; the chosen button shows `copy.signIn.continuing`.
- Then a muted divider text "hoặc đăng nhập bằng tài khoản khác" (a `<p>`, not a button), shown only when the list has entries. The form below is unchanged.
- Focus: no autofocus change on load. After a failed continue, the error banner appears above the buttons; confirm `AuthNotice` announces (role alert/status); I did not open it. Render the list with a stable key (`accountId`) so a failed click keeps focus on the same button.
- Do not show `display_name` (it is not parsed), and do not add `email_verified` to the client shape. Optional niceties go to follow-ups.

### 6. Copy (R6, `copy.ts`)
- `signIn.continueAs: (email) => \`Tiếp tục với ${email}\``, `signIn.continuing: "Đang đăng nhập…"`, `signIn.otherAccount: "hoặc đăng nhập bằng tài khoản khác"`, `signIn.accountsLabel: "Tài khoản đã đăng nhập trên trình duyệt này"`.
- `unverified: { title: "Xác minh email", body: (email: string | null) => …, checkAgain: "Tôi đã xác minh email", otherAccount: "Dùng tài khoản khác" }`.
- `preview.unverified: "Chưa xác minh"`.
- Leave `AUTH_COPY.join.continue` alone (separate screen); do not couple the two. Check `copy.test.ts` for any key-shape assertions.

### 7. Preview (AuthPreview, R9, D42)
- `AuthPreview.tsx:11-22`: add `signIn` states `accounts` (3 accounts), `accounts_long` (one email of ~60 chars with no spaces, plus a normal one), `continuing`. Add a new `Screen` `unverified` with states `idle`, `sending`, `sent`. The `Screen`-driven select reads `p[s]`, so add `preview.unverified`.
- Loading is the existing checking layout, so no new state is needed.
- One-off Playwright script (outside the repo): 390 px frame, light and dark. Capture `accounts_long` (no horizontal scroll), `continuing` (disabled), `unverified` (idle and sent), checking. Record the result in impl-log and review (D42). No App-level tests (BUG-006).

### 8. Tests (R8; fake client)
- `SignInScreen.test.tsx`:
  - one button per account with the right label and a click calling `onContinueAs`;
  - no list and no divider when `accounts` is empty or undefined;
  - buttons disabled while `status="submitting"`, and the chosen one shows `continuing`;
  - a long email gets the `break-all` class;
  - the form is still present.
- `AuthGate.test.tsx` (fake client at `:66-79` style):
  - no id → `accounts` called once; the held `accounts` promise shows the checking notice and no email input;
  - resolved list → buttons;
  - click → `client.token(accountId)` called, `client.login` not called, `mm_account_id` written, app rendered;
  - `accounts` rejecting (network, session_invalid, rate_limited) → form only, no error banner;
  - empty list → form only;
  - an id stored (restore path) → `accounts` not called;
  - continue then `not_member` + `join_available` → join screen with the list email, `accounts` called once in total, `join` not called until the click; then join_closed after the click shows its error (flow unchanged);
  - continue then `email_unverified` → `UnverifiedScreen`; resend calls `resendVerification(accountId)`; 409 → `/token` → app;
  - password sign-in `email_unverified` → `UnverifiedScreen`;
  - continue then `session_invalid` → form + error + accounts refetched;
  - double click → one `/token`;
  - sign-out and "Dùng tài khoản khác" → form only, `accounts` not called; the excluded account is not offered;
  - remote signedOut during loading → a late list is dropped;
  - a continue result arriving after a view change is ignored.
- `tokenStore.test.ts`:
  - `continueAs` writes the id, calls `token(accountId)` and not `login`, and seeds `accountEmail()` with no `accounts` call;
  - a late `/token` answer of the previous epoch is dropped;
  - no `signedOut` is posted;
  - the token broadcast carries the new `accountId`;
  - an `email_unverified` rejection keeps the id.
- `tabs.test.ts`: A (X) and B `continueAs` Y → A is not signed out, A ignores Y's token and keeps X's, and storage holds Y.
- `identityClient.test.ts`: `accounts` aborts on timeout → `network` error.

## Risks
- High path (`src/features/auth/**`): the plan needs Ming's approval.
- Privacy: the list shows the emails of every account signed in on this browser, including on a shared machine. That is the D50 intent and the contract's design. Mention it to Ming at the gate, and note the deliberate "no list after own sign-out" rule.
- The shared `mm_account_id` is overwritten when another tab continues as a different account (see §1). It is the existing `signIn` behaviour, and a follow-up is proposed.
- Routing `email_unverified` in `failTo` changes the behaviour of existing tests (the banner-with-resend assertions). Keep the SignInScreen fallback, but update the AuthGate tests that assert the sign-in banner for that code.
- An `/accounts` call on every cold sign-in page costs one round trip. The 8 s timeout bounds the worst case.
- The Playwright check is a one-off; the real cross-tab behaviour of two different accounts is jsdom/fake-channel only, as in T-028.2.

## Out of scope (follow-ups, R7)
- `display_name` and `email_verified` in the list and badges; an account switcher inside the app.
- A conditional `storage.clear()` on sign-out/remote sign-out (multi-account hazard in §1).
- Broadcasting `signedOut` on `forget`/`session_invalid` (T-028.2 F1).
- Removing the now-unreachable SignInScreen `email_unverified` banner.
- T-028.1 (verifier) and T-028.2 (session) code beyond the one `continueAs` method.

## Open questions
1. Is the cap of 5 listed accounts OK, with the form for the rest?
2. Confirm "form only after an explicit sign-out and after 'Dùng tài khoản khác'" (no list there), or does Ming want the list shown after sign-out?
3. Is a "Tôi đã xác minh email" re-check button wanted on the verify screen, or resend and "other account" only?

Files read: /home/user/TuDoCuaTui/src/features/auth/{AuthGate.tsx,SignInScreen.tsx,tokenStore.ts,accountId.ts,identityClient.ts,copy.ts,types.ts,VerifyEmailScreen.tsx,JoinScreen.tsx,AuthLayout.tsx,preview/AuthPreview.tsx}, /home/user/TuDoCuaTui/work/decisions.md (D44/D46/D50), T-028.2 review.md and security-review.md, /home/user/org-admin-api/docs/consumers.md.
