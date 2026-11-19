Status: READY

# Plan — T-028.3: "Continue as {email}" on the sign-in page and a verify-email screen

Gate: `plan-approval` (the ticket touches `src/features/auth/**`, a High-tier auth path in CLAUDE.md "Risk tiers"). Ming approves this plan before IMPLEMENT.

## Scope summary
Sources quoted:
- `work/decisions.md` D50: "Adopted: "Continue as {email}" list from `GET /accounts` on the sign-in page, cross-tab Web Lock + BroadcastChannel session, …". The cross-tab session landed in T-028.2. This ticket is the list.
- Ticket scope:
  - "Sign-in page: `GET /accounts` → one "Continue as {email}" button per account, then "hoặc đăng nhập bằng tài khoản khác" and the existing email + password form; errors → form only."
  - ""Continue as" stores `account_id` and gets a token (join consent / join closed flows unchanged)."
  - "403 `email_unverified` → a dedicated verify screen with resend (reuse `VerifyEmailScreen` if it fits)."
  - "Vietnamese copy in the auth copy file (R6)."
- Contract (`org-admin-api/docs/consumers.md`, read-only; it wins on conflict):
  - §"Listing the accounts on this browser" (l.164-179): `GET /api/v1/auth/accounts` with cookie + `X-MM-App` → `{items:[{account_id,email,email_verified,display_name}]}`, "oldest first"; "Use it for an account switcher or a "Continue as <account>" screen. Switching only changes the app's own `localStorage.mm_account_id`."; "Same errors as `/token` …".
  - l.50 / l.206: 401 `session_invalid` → "re-list the accounts … or sign in again".
  - l.52: 403 `email_unverified` → "Ask the user to verify their email; offer "resend"".
  - Resend table (l.101-109): 202 sent; 401 `session_invalid` → "Sign in again"; 409 `email_already_verified` → "fetch a new `/token`"; 429 → show `Retry-After`.
  - Email verification step 4 (l.92): after verifying, "if the user is signed in, fetches a new `/token`".
- D8 (in force, quoted in `JoinScreen`/`identityClient`): join only from the user's click. "Continue as" on the sign-in page never calls join.
- Out of scope (ticket): the cross-tab session (T-028.2) and the verifier (T-028.1).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | With accounts on the device, the sign-in page shows one "Tiếp tục với {email}" button per account (at most 5, server order), then "hoặc đăng nhập bằng tài khoản khác" and the unchanged form. One click stores that `account_id` and gets a token. The App renders, with no `login` and no `join` call. | `AuthGate.test.tsx › continue as: list -> one click -> token(id), id stored, App rendered, no login/join`; `… list is capped at 5 and deduped`; `SignInScreen.test.tsx › one button per account …`; `tokenStore.test.ts › continueAs …` |
| 1a | Join consent / join closed flows are unchanged after a continue. | `AuthGate.test.tsx › continue -> not_member + join_available -> join screen with the list email, accounts called once, join only on click; join_closed after the click stays on join` |
| 1b | Double click sends one `/token`. While continuing, every list button and the form submit are disabled, and the chosen button reads "Đang đăng nhập…". | `AuthGate.test.tsx › double click on a continue button -> one /token`; `SignInScreen.test.tsx › submitting disables the list and the form; the chosen button shows continuing` |
| 1c | `session_invalid` on a continue → the form with the `session_invalid` error, and the list fetched again (contract l.50). | `AuthGate.test.tsx › continue -> session_invalid -> form + error + accounts re-listed` |
| 2 | With no accounts, or when `/accounts` fails (network, `rate_limited`, `session_invalid`, unknown, timeout), only the form shows, with no error banner. | `AuthGate.test.tsx › accounts [] -> form only`; `… accounts rejects (each code) -> form only, no alert`; `identityClient.test.ts › accounts carries an AbortSignal (5 s timeout)` |
| 2a | While the list loads, the existing "Đang kiểm tra phiên đăng nhập…" notice shows (no form flash). A stored id (restore path) never calls `/accounts` for the list. | `AuthGate.test.tsx › no id -> checking notice while accounts is pending, then the form`; `… id stored -> accounts not called` |
| 2b | No list after an own sign-out, a remote sign-out, "Dùng tài khoản khác" or `onAuthLost`. A late list answer after such a move is dropped. | `AuthGate.test.tsx › own sign-out / Dùng tài khoản khác / remote sign-out -> form only, accounts not called again`; `… remote sign-out while the list loads -> late list dropped` |
| 3 | `email_unverified` (password sign-in, continue, restore, background refresh) → a dedicated "Xác minh email" screen with: resend (sending/sent/error states); "Tôi đã xác minh email" (fetches a token again); "Dùng tài khoản khác". | `UnverifiedScreen.test.tsx › *`; `AuthGate.test.tsx › password sign-in email_unverified -> unverified screen with the typed email`; `… continue -> email_unverified -> unverified screen; resend -> resendVerification(id) -> sent`; `… resend 409 -> /token -> App`; `… Tôi đã xác minh email -> /token -> App; still unverified -> screen with error`; `… resend session_invalid -> form + error, id cleared`; `… restore email_unverified -> unverified screen, id kept` |
| 4 | Vietnamese copy only in `copy.ts` (R6). | `copy.test.ts › continue-as and unverified copy`; review of the diff (no Vietnamese literals in .tsx) |
| 5 | Works at 390 px and in dark mode (R9). | One-off Playwright run on `/auth-preview.html` (D42), recorded in impl-log and repeated by the reviewer: the states listed under "Preview" in light and dark, with `document.documentElement.scrollWidth <= 390` and the long email wrapped. `boundary.test.ts` still passes (no hex colours, no fixed width > 390 px). |
| 6 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- On production, while signed in to another mmlabs app (for example ricotdin) on the same browser: open TuDoCuaTui signed out. "Tiếp tục với {email}" shows, and one click opens the app (or the join screen for a new member).
- With a new, unverified account: the "Xác minh email" screen shows. Resend delivers an email. After you open the link in another tab, "Tôi đã xác minh email" enters the app.
- Real `/accounts` latency on a cold page: the loader should be brief.

## Files to create / modify
High path: every file under `src/features/auth/**` is in the High-tier auth path (CLAUDE.md "Risk tiers"). None of these files is in `loop.config.md` "High paths".

| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/tokenStore.ts` | Add `continueAs(accountId, email)` to `TokenStore` and the implementation: `reset(); id = accountId; email; storage.write(id); await renew()`. `signIn` uses the same private `adopt(accountId, email)` tail. | AC1: the store has no way to adopt an existing account. | auth (High tier) |
| `src/features/auth/identityClient.ts` | `get(path, signal?)` passes an optional signal. `accounts()` uses `AbortSignal.timeout(ACCOUNTS_TIMEOUT_MS = 5000)`. The existing catch maps an abort to `network`. | AC2/2a: a hung `/accounts` would hold the sign-in loader forever. | auth |
| `src/features/auth/AuthGate.tsx` | Accounts list state, `loadAccounts()`, a `continueAs` handler, the `unverified` view, routing of `email_unverified`, and resend `session_invalid` handling. Details under Approach. | AC1-3 | auth |
| `src/features/auth/SignInScreen.tsx` | Optional list above the form, the divider text and the disabled/continuing states. | AC1, 1b | auth |
| `src/features/auth/UnverifiedScreen.tsx` (new) | The verify screen for 403 `email_unverified`. | AC3 (`VerifyEmailScreen` does not fit, see Specialist input §4) | auth |
| `src/features/auth/types.ts` | `AccountChoice = {accountId; email}`. `SignInScreenProps`: `accounts?`, `onContinueAs?`, `continuingId?`. New `UnverifiedScreenProps`. | AC1, AC3 | auth |
| `src/features/auth/copy.ts` | `signIn.continueAs`, `signIn.continuing`, `signIn.otherAccount`, `signIn.accountsLabel`, the `unverified` block and `preview.unverified`. | R6 | auth |
| `src/features/auth/preview/AuthPreview.tsx` | Sign-in states `accounts`, `accounts_long`, `continuing`. New screen `unverified` with states `idle`, `sending`, `sent`, `still`. | R9 one-off Playwright check (D42) | auth |
| `src/features/auth/tokenStore.test.ts` | New `continueAs` tests. | R8 | auth |
| `src/features/auth/tabs.test.ts` | One two-account cross-tab test. | R8, AC1 (multi-account on a shared device) | auth |
| `src/features/auth/identityClient.test.ts` | `accounts` signal test. | R8 | auth |
| `src/features/auth/SignInScreen.test.tsx` | New list tests. | R8 | auth |
| `src/features/auth/UnverifiedScreen.test.tsx` (new) | Screen tests. | R8 | auth |
| `src/features/auth/AuthGate.test.tsx` | New flow tests, plus the existing tests listed under "Existing tests that change". | R8 | auth |
| `src/features/auth/copy.test.ts` | Pin the new copy. | R6/R8 | auth |

No other file. `src/App.tsx`, `src/data/**` and `server/**` are untouched.

## Tests to write
All tests use a fake `IdentityClient` (`vi.fn`) and the fake channel hub (`fakeTabs.ts`) at component/store level. There are no App-level tests (BUG-006 / D42).

| Test (file › name) | Covers |
|---|---|
| `tokenStore.test.ts › continueAs writes the id, calls token(id) and never login; accountEmail() returns the given email with no accounts call` | AC1 |
| `tokenStore.test.ts › continueAs drops a late /token answer of the previous epoch (restore in flight, then continueAs)` | AC1, epoch safety |
| `tokenStore.test.ts › continueAs posts no signedOut; the token broadcast carries the new accountId` | AC1, cross-tab |
| `tokenStore.test.ts › continueAs rejecting email_unverified keeps the id; session_invalid clears it` | AC1c, AC3 |
| `tabs.test.ts › tab A signed in as X, tab B continueAs Y: A keeps X's token and is not signed out, A ignores Y's broadcast, storage holds Y` | multi-account safety |
| `identityClient.test.ts › accounts carries an AbortSignal (5 s timeout); a rejected fetch -> network` | AC2 |
| `SignInScreen.test.tsx › one button per account labelled "Tiếp tục với {email}"; click calls onContinueAs with that account; the first is primary` | AC1 |
| `SignInScreen.test.tsx › no list and no divider when accounts is empty or undefined; the form is still there` | AC2 |
| `SignInScreen.test.tsx › the divider "hoặc đăng nhập bằng tài khoản khác" is between the list and the form; the list group has the accessible name accountsLabel` | AC1 |
| `SignInScreen.test.tsx › submitting disables the list buttons and the form submit; the chosen button shows continuing` | AC1b |
| `SignInScreen.test.tsx › a long email label carries break-all` | R9 |
| `UnverifiedScreen.test.tsx › shows the title and the body with the email; without an email the generic body` | AC3 |
| `UnverifiedScreen.test.tsx › resend: idle -> click calls onResend; sending disables it; sent shows resendSent and hides the button; an error shows its copy` | AC3 |
| `UnverifiedScreen.test.tsx › "Tôi đã xác minh email" calls onCheckAgain; "Dùng tài khoản khác" calls onUseOtherAccount; still=true shows the email_unverified error` | AC3 |
| `UnverifiedScreen.test.tsx › an email with markup is rendered as text` | XSS sanity (mirrors `JoinScreen.test.tsx`) |
| `AuthGate.test.tsx › no id -> checking notice while accounts is pending (no email input), then the list and the form` | AC2a |
| `AuthGate.test.tsx › continue as: list -> one click -> token(id), id stored, App rendered, no login/join` | AC1 |
| `AuthGate.test.tsx › list is capped at 5 and deduped by account id (case-insensitive), server order kept` | AC1 |
| `AuthGate.test.tsx › accounts [] -> form only` | AC2 |
| `AuthGate.test.tsx › accounts rejects (network, rate_limited, session_invalid, unknown) -> form only, no alert` (`it.each`) | AC2 |
| `AuthGate.test.tsx › id stored -> accounts not called for the list (restore path)` | AC2a |
| `AuthGate.test.tsx › double click on a continue button -> one /token` | AC1b |
| `AuthGate.test.tsx › continue -> not_member + join_available -> join screen with the list email, accounts called once in total, join only on click; join_closed after the click stays on join` | AC1a |
| `AuthGate.test.tsx › continue -> network -> retry view; Retry restores the chosen id -> App` | AC1, failTo |
| `AuthGate.test.tsx › continue -> session_invalid -> form + session_invalid error + accounts re-listed, id cleared` | AC1c |
| `AuthGate.test.tsx › continue -> email_unverified -> unverified screen with the list email; resend -> resendVerification(id) -> sent` | AC3 |
| `AuthGate.test.tsx › password sign-in email_unverified -> unverified screen with the typed email` | AC3 |
| `AuthGate.test.tsx › restore email_unverified -> unverified screen without an email, id kept` | AC3 |
| `AuthGate.test.tsx › Tôi đã xác minh email -> /token -> App; a second email_unverified -> unverified screen with the still-unverified error` | AC3 |
| `AuthGate.test.tsx › resend 409 email_already_verified on the unverified screen -> /token -> App` | AC3 (contract) |
| `AuthGate.test.tsx › resend session_invalid on the unverified screen -> form + error, id cleared, accounts re-listed` | AC3 (contract "Sign in again") |
| `AuthGate.test.tsx › Dùng tài khoản khác on the unverified screen -> form only, id cleared, logout and accounts not called` | AC3, AC2b |
| `AuthGate.test.tsx › own sign-out -> form only, accounts not called again` | AC2b |
| `AuthGate.test.tsx › remote sign-out while the list loads -> the late list is dropped, form only with the signed-out notice` | AC2b |
| `AuthGate.test.tsx › remote sign-out during a continue -> App never rendered` | AC1, epoch safety |
| `copy.test.ts › continue-as and unverified copy` (exact strings for `continueAs("a@b.co")`, `otherAccount`, `checkAgain`, both `unverified.body` forms) | R6 |

### Existing tests that change (and why)
- `AuthGate.test.tsx` helpers:
  - `signInWith()` first awaits `screen.findByLabelText(AUTH_COPY.fields.email)`, because the form now renders after the list resolves.
  - `withFailure()` (restore outcomes) adds `accounts: vi.fn(async () => [])` to its fake client.
  - `setup()` gains an optional `accounts` override. The default stays `[{ID, "me@b.co"}]`.
- `AuthGate.test.tsx › restore › "no id -> sign-in with zero network and the App not rendered"`: renamed to "no id -> one accounts call, then sign-in; no token/login". It now awaits the form. The one `/accounts` call is the point of this ticket.
- `AuthGate.test.tsx › restore › "notice verified is shown on the sign-in screen"`: awaits the form (`findByRole`).
- `AuthGate.test.tsx › restore outcomes › "%s -> sign-in with that error, id kept"`: the `email_unverified` row moves to the new test "restore email_unverified -> unverified screen". `not_member` stays.
- `AuthGate.test.tsx › sign-in › "email_unverified -> resend -> sent"`: now asserts the unverified screen (resend button there, `resendSent` shown) instead of the sign-in banner.
- `AuthGate.test.tsx › cross-tab… › "resend 409 email_already_verified -> /token -> App rendered"`: starts from the unverified screen instead of the banner.
- `AuthGate.test.tsx › join flow › "sign-in: not_member + join_available -> … no join call before the click"`: `expect(s.client.accounts).not.toHaveBeenCalled()` becomes `toHaveBeenCalledTimes(1)` (the mount listing only; the join lookup still makes no call because the login email is known).
- Any other no-id `AuthGate` test that queries the form synchronously right after `setup()` awaits it first. This is mechanical, and the implementer lists each one in impl-log.
- No change expected in `SignInScreen.test.tsx` existing cases (the new props are optional; the `email_unverified` banner stays), nor in `JoinScreen`, `VerifyEmailScreen`, `tabs` or `tokenStore` existing cases.

## Approach
1. **Store (`tokenStore.ts`).**
   - Add `continueAs(accountId: string, email: string): Promise<void>`.
   - Factor `adopt(accountId, email)` (`reset(); id = accountId; email = …; storage.write(id); return renew()`) and use it in `signIn` after `client.login` and in `continueAs`.
   - `continueAs` posts no `signedOut` and calls no `/logout` for any earlier id.
   - Cross-tab: messages are keyed by `accountId` (`onMessage`, `tokenStore.ts:204-205`), so no other change.
   - The shared `mm_account_id` becomes the chosen id. That is the same as `signIn` today and is what the contract describes ("Switching only changes the app's own `localStorage.mm_account_id`").
2. **Client (`identityClient.ts`).** `get(path, signal?)` passes `signal`. `accounts()` uses `AbortSignal.timeout(5000)`. Nothing else changes: the parsing still drops `email_verified` and `display_name`.
3. **AuthGate: the list.**
   - State `accounts: AccountChoice[] | "loading" | null`, plus a `listSeq` ref.
   - `loadAccounts()`:
     - bumps `listSeq` and sets `"loading"`;
     - calls `client.accounts()` inside a `try` that also catches a synchronous throw;
     - drops the answer if `listSeq` moved;
     - dedupes by lowercased `accountId`, keeps server order and caps at `MAX_LISTED_ACCOUNTS = 5`;
     - sets `null` on an empty list or any rejection (no banner, no retry).
   - `clearAccounts()` bumps `listSeq` and sets `null`.
   - Initial state: `"loading"` when there is no stored id and `initialScreen === "signIn"`, else `null`. A mount effect starts `loadAccounts()` in that case.
   - Load the list only (a) on that mount and (b) whenever the gate enters `signed_out` because of `session_invalid` (contract l.50). This covers restore, continue, join, the background refresh and resend.
   - `clearAccounts()` on own sign-out (`onSignOut`), remote sign-out, `onAuthLost`, and "Dùng tài khoản khác" on the join and unverified screens.
   - `goto()` keeps the current list and never refetches.
   - Render: while `view.kind === "signed_out" && screen === "signIn" && accounts === "loading"`, render the existing checking layout (`AuthLayout` + `AuthNotice busy` + `AUTH_COPY.gate.checking`). Otherwise pass `accounts ?? []` to `SignInScreen`.
4. **AuthGate: continue.**
   - `continueAs(a)`: guard with a `continuing` ref (one in flight), then `signOutSeq += 1`, `setStatus("submitting")`, `setContinuingId(a.accountId)` and `lastEmail.current = a.email`. Then `await store.continueAs(a.accountId, a.email)`.
   - On success, mirror `signIn`: `if (store.accountId() !== null) enterReady()`.
   - On error: `canJoin(err)` → `offerJoin()` (the email is already seeded, so there is no `/accounts` call; T-028.2 G1 stays valid). Anything else goes to `failTo(err)`.
   - Always clear `continuing`, `continuingId` and `status` in `finally`.
   - A remote sign-out during the call is covered by the store epoch (`reset()` → the renew resolves `null` → `accountId()` is null → no App).
5. **AuthGate: `email_unverified` routing (one place).**
   - New view `{ kind: "unverified"; email: string | null; still?: boolean }`.
   - `failTo(err)` first checks `err.code === "email_unverified" && store.accountId() !== null` → `setResend({status:"idle"})` and the unverified view with `lastEmail.current`.
   - Next, `session_invalid` → `signed_out` + error + `loadAccounts()`. Then the existing branches.
   - `signIn`'s catch routes `email_unverified` through `failTo`. It sets `lastEmail.current = v.email` before the call.
   - The background `subscribe` handler's non-join branch calls `failTo(err)`. Only `NOTIFY_CODES` reach it, so the retry branch is unreachable there.
   - Restore already uses `failTo`.
   - `lastEmail` is cleared wherever `setEmail("")` runs today.
   - `still: true` when the re-check comes back `email_unverified`. A ref `rechecking` is set by the button and consumed in `failTo`.
6. **AuthGate: the unverified view handlers.**
   - `onResend` = the existing `resendVerification`. Add one branch: on `session_invalid`, call `store.forget()` and `failTo(err)` (→ form + error + re-list).
   - `onCheckAgain` = `setView({kind:"checking"}); setAttempt(n => n + 1)` (contract l.92: fetch a new `/token`).
   - `onUseOtherAccount` = `store.forget(); lastEmail = null; setEmail(""); clearAccounts(); setScreen("signIn"); setView({kind:"signed_out"})`. This mirrors the join screen. No `/logout`, so other mmlabs apps stay signed in.
7. **`SignInScreen.tsx`.**
   - After the notices and errors, when `accounts?.length`, render `<section aria-label={copy.signIn.accountsLabel} className="flex flex-col gap-2">` with one `Btn type="button"` per account (`key={accountId}`). The first is `kind="primary"`; the rest use the default secondary.
   - The label is `<span className="whitespace-normal break-all">{continuingId === a.accountId ? copy.signIn.continuing : copy.signIn.continueAs(a.email)}</span>`, as in `JoinScreen.tsx:16`.
   - Every list button is `disabled={submitting}`.
   - Then `<p className="text-center text-sm" style={{color:"var(--muted)"}}>{copy.signIn.otherAccount}</p>`, then the unchanged form.
   - The existing `email_unverified` banner + resend stays as a fallback (R7).
   - Theme variables only (`boundary.test.ts`).
8. **`UnverifiedScreen.tsx`.**
   - Built from `AuthLayout` (title `copy.unverified.title`) and an info `AuthNotice` holding the body. The body has `style={{overflowWrap:"anywhere"}}` so a long email wraps at 390 px.
   - Below it: `still` → error notice `errors.email_unverified`; `resend.status === "sent"` → `actions.resendSent`; `resend.error` → `authErrorMessage`.
   - Buttons: primary "Tôi đã xác minh email", then secondary resend (`resend`/`resending`, hidden once sent). Then `LinkButton` "Dùng tài khoản khác".
   - No Turnstile: resend does not need it (contract).
9. **Copy (`copy.ts`, R6).** Exact strings:
   - `signIn.continueAs: (email) => \`Tiếp tục với ${email}\``
   - `signIn.continuing: "Đang đăng nhập…"`
   - `signIn.otherAccount: "hoặc đăng nhập bằng tài khoản khác"` (ticket wording)
   - `signIn.accountsLabel: "Tài khoản đã đăng nhập trên trình duyệt này"`
   - `unverified.title: "Xác minh email"`
   - `unverified.body: (email: string | null) => email ? \`Email ${email} chưa được xác minh. Mở link trong email chúng tôi đã gửi, rồi quay lại đây.\` : "Email của bạn chưa được xác minh. Mở link trong email chúng tôi đã gửi, rồi quay lại đây."`
   - `unverified.checkAgain: "Tôi đã xác minh email"`
   - `unverified.otherAccount: "Dùng tài khoản khác"`
   - `preview.unverified: "Chưa xác minh"`
   - Existing keys (`join.continue`, `actions.resend*`, `errors.*`) are reused, not changed.
10. **Preview (`AuthPreview.tsx`).**
    - `STATES.signIn` adds `accounts` (3 accounts), `accounts_long` (one ~60-character email with no spaces, such as `nguyen.thi.thu.trang.dangky.taikhoan.moi.2026@example-dài.com`, plus a normal one) and `continuing` (status submitting, `continuingId` = the first).
    - New `Screen` `unverified` with `idle`, `sending`, `sent` and `still`. It uses the long email in `idle` so wrapping is visible.
    - The checking loader is the existing layout, so it needs no new state.
11. **One-off Playwright (D42, R9).**
    - Not a repo dependency. Script outside the repo against `pnpm dev`'s `/auth-preview.html`, with "Khung 390px" on and a 390 px viewport, in light and dark (the preview's dark toggle).
    - States: signIn `accounts`, `accounts_long`, `continuing`; unverified `idle`, `sent`, `still`.
    - Assert `scrollWidth <= 390`, the long email fully visible (wrapped), disabled buttons and a readable dark background.
    - Record the results in impl-log.
12. **Rules.**
    - R1: no new `fetch` outside `identityClient.ts` (boundary test).
    - R3: nothing secret. The access token stays in memory; only `mm_account_id` is written.
    - R6: copy only in `copy.ts`.
    - R7: follow-ups below, not in the diff.
    - R8: the tests above.
    - R9: the Playwright check.
    - D8: continue never calls join.

**Privacy note (for Ming at the gate).**
- The sign-in page lists the email of every mmlabs account signed in on this browser, including accounts signed in through other mmlabs apps. On a shared computer, the next person sees those emails and can enter TuDoCuaTui as any of them with one click, as long as that account's device session is still alive. This is the contract's design and what D50 adopts.
- Mitigations in this plan:
  - no list right after an own sign-out, a remote sign-out, "Dùng tài khoản khác" or a lost session in this tab (A2);
  - the list is capped at 5;
  - the token never leaves memory.
- What ends the exposure: a real `/logout` per account (from any app), or clearing cookies. That is the existing `logoutUnconfirmed` advice.
- A cold reload of the sign-in page after a sign-out still lists the other accounts.

## Specialist input used
From `consult-frontend-developer.md`:
- §1 store `continueAs` + shared adopt tail, seeding email, no `signedOut`: **adopted**. The "conditional `storage.clear()`" hazard goes to follow-ups. No test documents the current hazard (not cheap to make meaningful; the tabs test covers the safe direction).
- §2 accounts state, `listSeq`, errors → `null`, dedupe, cap 5, loader instead of a form flash, `goto` keeps the list: **adopted**.
  - "Load after the remote sign-out handler": **rejected**. It has the same race as an own sign-out (the other tab's `/logout` may not have finished, so the just-signed-out account could be offered and fail with `session_invalid`), and it keeps the rule simple: no list after any sign-out.
  - The `exclude` parameter: **rejected** as unnecessary once no list is loaded after "Dùng tài khoản khác".
  - Timeout ~8 s: **adopted at 5 s** (same as `LOGOUT_TIMEOUT_MS`), because the loader blocks the cold sign-in page.
- §3 continue handler: **adopted**, with one simplification. Success mirrors `signIn` (`store.accountId() !== null` → ready) instead of extra `listSeq`/`signOutSeq`/view checks, because the store epoch already drops results after a sign-out. Covered by the test "remote sign-out during a continue". G1 note: **adopted** (email seeded, `accountEmail()` fallback kept for restore).
- §4 new `UnverifiedScreen` instead of `VerifyEmailScreen`: **adopted**. `VerifyEmailScreen` is the link-token state machine, and its `invalid` state prints `token_invalid` copy.
  - Route in `failTo`: **adopted**. Also route `signIn`'s catch and the background subscriber through it.
  - Resend `session_invalid` → forget + sign-in: **adopted**, with a re-list per contract.
  - Keep the `SignInScreen` banner fallback: **adopted**.
  - Re-check button: **adopted** (A3).
- §5 list inside `SignInScreen`, `break-all`, first primary, disabled while submitting, divider `<p>`, stable keys, no `display_name`/`email_verified`: **adopted**. `<section aria-label>` is chosen over `role="group" aria-labelledby` (one label string, no extra id).
- §6 copy: **adopted** with the exact strings above. The `unverified.body` wording is mine.
- §7 preview states + Playwright: **adopted**, plus an unverified `still` state.
- §8 tests: **adopted**, as listed (the remote sign-out case is changed to "no list after remote sign-out").
- Risks / privacy: **adopted** into the privacy note and A2.

## Assumptions
Assumptions for Ming's approval at the gate:
- **A1 — cap 5.** At most 5 accounts are listed, oldest first (server order). The form covers the rest.
- **A2 — when the list shows.**
  - It shows only on a cold sign-in page with no stored account, and after an Identity `session_invalid` (contract: "re-list the accounts").
  - It never shows right after an own sign-out, a sign-out from another tab, "Dùng tài khoản khác" or a lost session (`onAuthLost`). In those cases only the form shows.
  - Reloading the page shows the list again for the accounts still signed in on the browser.
- **A3 — re-check button.** The verify screen has "Tôi đã xác minh email" (fetches a token again, contract l.92), resend, and "Dùng tài khoản khác". If the account is still unverified, the screen shows the existing `email_unverified` message.
- **A4 — loader.** While `/accounts` loads (at most 5 s), the sign-in page shows the existing "Đang kiểm tra phiên đăng nhập…" notice instead of the form, so the page does not jump.
- **A5 — label wording.** The list buttons read "Tiếp tục với {email}", the same words as the join screen's button.
- **A6 — unverified accounts are listed too.** The client drops `email_verified`. Clicking an unverified account opens the verify screen.
- **A7 — privacy** as in the note above (D50 intent).

Other non-blocking assumptions:
- No hotspot: no other ticket is `IN_PROGRESS`/`REVIEW`/`DONE` (T-028.4 is BACKLOG and server-side).
- Size: about 280 product lines and about 400 test lines. It stays one cycle because the tests are most of the diff, so no split.
- The `SignInScreen` `email_unverified` banner becomes unreachable from AuthGate's main paths but is kept (R7); its removal is a follow-up.

## Blocking questions
None.

## Split proposal
None.

## Follow-ups (R7, not in this diff)
- Clear `mm_account_id` on sign-out/remote sign-out only if it still holds the account that left (`storage.read() === gone`). Today, tab A signing out X wipes tab B's stored Y (T-028.2 review nit; consult §1).
- Broadcast `signedOut` on `forget`/`session_invalid`/`onAuthLost` (T-028.2 F1).
- A "Thử đăng xuất lại" action on `logout_unconfirmed` (T-028.2 security follow-up).
- `display_name` and an "unverified" badge in the list; an account switcher inside the app.
- Remove the now-unreachable `SignInScreen` `email_unverified` banner and its tests.
- An option to hide or remove a listed account from the sign-in page ("không phải tôi") without a full `/logout` (privacy on shared computers).
- Show `Retry-After` for a resend 429 as a countdown (today it is the generic `rate_limited` copy).
