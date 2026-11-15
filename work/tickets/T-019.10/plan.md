Status: READY

# Plan — T-019.10: Join flow UX

## Feature summary
T-019.10 is a `T-` ticket. It is not in `docs/feature-list.md`. Its scope comes from the umbrella plan and the decisions below.

- Umbrella plan `work/tickets/T-019/plan.md`, *Split proposal*: "**T-019.10 — Join UX.** ACs: `not_member` with
  `join_available` shows "Tiếp tục với <email>"; join then token; join refused shows Vietnamese copy."
- Umbrella *Files to create / modify*, T-019.10 row: "`src/features/auth/identityClient.ts`, `JoinScreen.tsx` (+ tests) |
  "Tiếp tục với <email>" → `POST /api/v1/auth/apps/tudocuatui/join` | `not_member` + `join_available`".
- Umbrella A9: "other users can join only after T-019.10". Umbrella A10: in-repo Identity client shaped like `@mmlabs/auth-client`.
- D31: "app `tudocuatui`, join policy `open`".
- D38: "photos of every user stay in Ming's Drive (D27) with per-user quotas (T-019.14) and a privacy notice (T-019.10)
  before M-22."
- T-019.13 plan A2: "It goes on the join screen before "Tiếp tục với <email>", with the same copy in Settings or near the
  photo picker if T-019.10's plan finds that cheap."
- Upstream contract (`org-admin-api/docs/consumers.md`, "Accounts and joining an app", v0.1.3):
  - Sequence: "`/token` → 403 `not_member` with `details.join_available: true` → show "Continue as <email>" → on the
    user's click, join → call `/token` again."
  - Join: `POST https://api.mmlabs.online/api/v1/auth/apps/<app>/join`, `credentials: "include"`, headers
    `Content-Type: application/json` and `X-MM-App: <app>`, body `{account_id}` (only that field is allowed). The answer
    is `200 {"status":"member"}`, also for an existing member (idempotent).
  - "**The click is the consent** (D8): only call join after the user chose the account on a "Continue as" screen,
    never automatically."
  - Join errors: 401 `session_invalid`, 403 `email_unverified`, 403 `join_closed`, 403 `join_approval_unavailable`,
    403 `join_unavailable`, 403 `app_mismatch` (bug), 403 `app_header_required` / `origin_not_allowed` (bug), 422
    `validation_error` (bug), 429 `rate_limited`.
  - Accounts: `GET /api/v1/auth/accounts` with `credentials: "include"` and `X-MM-App` returns
    `200 {"items": [{"account_id", "email", "email_verified", "display_name"}]}`. It has the same 401/403/429 errors as `/token`.
  - The `not_member` details are `{"join_available": bool}` and nothing else (`app/modules/tokens/errors.py`,
    `tests/test_auth_join.py:130`). **No email comes with it.**

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `not_member` with `join_available` shows "Tiếp tục với <email>"; join, then token. | `AuthGate.test.tsx` › "sign-in: not_member + join_available → join screen with Tiếp tục với <login email>, no join call before the click", "restore: not_member + join_available → accounts lookup → join screen with the account's email", "click → one join(ID) → one token → App rendered", "not_member without join_available → sign-in with the not_member copy (unchanged)", "double click sends one join". `tokenStore.test.ts` › "join calls client.join then /token; no token before join resolves". `identityClient.test.ts` › "join request shape", "accounts request shape". |
| 2 | A refused join shows Vietnamese copy. | `AuthGate.test.tsx` › "join_closed / join_approval_unavailable / join_unavailable / email_unverified / rate_limited / network stay on the join screen with AUTH_COPY text", "join session_invalid → sign-in, id cleared". `copy.test.ts` › "every AuthErrorCode has a message" (extended with the three join codes). `errors.test.ts` › "join codes accepted; app_mismatch → unknown". In `pnpm dev`, open `/auth-preview.html` (the existing auth preview), pick screen "Tham gia" and each join error. |
| 3 | The join screen shows the photo privacy notice before "Tiếp tục với <email>" (D38). It also appears near the photo picker if cheap. | `JoinScreen.test.tsx` › "privacy notice is rendered and precedes the continue button in DOM order" (uses `compareDocumentPosition`). `Editor.test.tsx` › "photoById shows the photo privacy notice; local mode does not". Both texts equal `PHOTO_PRIVACY_NOTICE` from `src/constants/privacy.ts`, the one source. |
| 4 | All checks pass; 390px and dark mode. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all green. `boundary.test.ts` passes unchanged: no new `fetch(` outside `identityClient.ts`, no hex colours, no width over 390px. In the auth preview, use "Khung 390px" + "Chế độ tối" on the join screen. A long email such as `nguyễn.thị.phương.thảo.rất.dài@example.com` wraps inside the button and does not scroll horizontally. Check the editor notice in dark mode in `pnpm dev`. Local mode shows no notice, so to see it, mount `Editor` with `photoById` the way the test does. |

## Ming verification after merge
- After a release with T-019.10, and with `TUDO_AUTH_MODE=identity` live (M-20): sign up a second, non-member account,
  verify its email, then sign in on a real phone. The join screen shows the privacy notice and "Tiếp tục với <email>".
  After the tap the app opens with an empty wardrobe. Closing the app before the tap and reopening shows the same screen
  again, without joining.
- Ming may edit the privacy copy (`src/constants/privacy.ts`, one string). M-22 stays gated on this release, as recorded
  by T-019.13 in `work/ming-todo.md`. No new Ming item.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/identityClient.ts` | Add `join(accountId)`: POST `/auth/apps/${encodeURIComponent(app)}/join` `{account_id}`, cookie class (`credentials: "include"`, `X-MM-App`). Reply must be `{status:"member"}`, else `unknown`. Add `accounts()`: a new private `get(path)` helper with `credentials: "include"`, `X-MM-App`, `cache: "no-store"`, no body and no Content-Type. It returns `{accountId, email}[]` and keeps only items whose `account_id` is a UUID and whose `email` is a non-empty string. | AC1. The join endpoint is required; the accounts call gives the email on the restore path. |
| `src/features/auth/types.ts` | Add `join_closed`, `join_approval_unavailable`, `join_unavailable` to `AuthErrorCode`. Add `joinAvailable?: boolean` to `AuthError`. Add `JoinScreenProps`. | AC1, AC2 |
| `src/features/auth/errors.ts` | Add the three join codes to `SERVER_AUTH_ERROR_CODES`. For `not_member`, set `joinAvailable: true` only when `details.join_available === true`. `app_mismatch` stays `unknown` (bug class, like `audience_mismatch`). | AC1, AC2 |
| `src/features/auth/tokenStore.ts` | Add an in-memory `email` (from `login`'s `r.email`, cleared together with the id). Add `accountEmail(): Promise<string \| null>` (memory first, then `client.accounts()` matched on the current id, with a generation guard). Add `join(): Promise<void>`: `client.join(id)`, then `fetchToken()`. A changed generation skips the token. `session_invalid` clears the id as `/token` does. Storage is unchanged: only `mm_account_id`. | AC1. The token is fetched only after a successful join. No new storage. |
| `src/features/auth/JoinScreen.tsx` (new) | Presentational. Title, short body, privacy notice (`AuthNotice kind="info"`), error notice, primary `Btn` "Tiếp tục với <email>" (disabled while joining, label `break-all`), `LinkButton` "Dùng tài khoản khác". | AC1–AC4 |
| `src/features/auth/AuthGate.tsx` | New view `{kind:"join"; email; error?}` plus a `joinStatus`. One helper `onTokenError(err)` is used by the sign-in catch, the restore (`failTo`) and the background `subscribe`. With `not_member && joinAvailable && store.accountId()`, the gate shows `checking`, then calls `store.accountEmail()`. An email leads to the join view; `null` leads to sign-in with the `not_member` copy; an error goes through `failTo`. The join click calls `store.join()`, then `enterReady()`. Refused or failed joins stay on the join view with the error; `session_invalid` leads to sign-in. "Dùng tài khoản khác" calls `store.forget()` and goes to sign-in (no `/logout`, so other mmlabs apps stay signed in, like `onAuthLost`). | AC1, AC2 |
| `src/features/auth/copy.ts` | Add an `AUTH_COPY.join` block (title, body, `continue(email)`, `joining`, `otherAccount`, `privacy` = `PHOTO_PRIVACY_NOTICE`) and `errors.join_closed`, `errors.join_approval_unavailable`, `errors.join_unavailable`. Add a preview label `join`. | AC2, AC3, R6 |
| `src/constants/privacy.ts` (new) | `export const PHOTO_PRIVACY_NOTICE = "…"` (the ticket's copy, verbatim). | AC3. The one source of the text for two features (R6). Auth must not be imported from outside (`boundary.test.ts`), so the shared string lives in `src/constants/`. |
| `src/features/auth/preview/AuthPreview.tsx` | Add screen `join` (states `idle`, `submitting`) rendering `JoinScreen` with `an@example.com`. Error options come from `AUTH_COPY.errors` already. | AC4: lets the reviewer check 390px and dark mode |
| `src/features/items/copy.ts` | `EDITOR_COPY.photo.privacy = PHOTO_PRIVACY_NOTICE` | AC3 "near the photo picker if cheap" |
| `src/features/items/Editor.tsx` | Only when `photoById` (API mode): render `<p className="text-xs" style={{ color: "var(--muted)" }}>{EDITOR_COPY.photo.privacy}</p>` right after `.photo-source-actions`. | AC3. In local mode the photos stay in the browser, so the notice would be false there. |
| `src/features/auth/identityClient.test.ts` | New cases (see Tests) | R8 |
| `src/features/auth/errors.test.ts` | New cases | R8 |
| `src/features/auth/tokenStore.test.ts` | New cases. The fake client gets `join` and `accounts`. | R8 |
| `src/features/auth/copy.test.ts` | Extend the `Record<AuthErrorCode, true>` with the three join codes | R8 |
| `src/features/auth/JoinScreen.test.tsx` (new) | Screen tests | R8 |
| `src/features/auth/AuthGate.test.tsx` | Flow tests. The fake client gets `join` and `accounts`. | R8 |
| `src/features/items/Editor.test.tsx` | Notice shown only with `photoById` | R8 |

Settings: not touched. `AiSettingsModal` covers AI provider settings only, so a photo notice there would be out of place, and the editor sits at the moment of upload.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `identityClient.test.ts` › "join: POST {BASE}/auth/apps/tudocuatui/join, credentials include, Content-Type + X-MM-App, body {account_id} only" | Request shape, security |
| `identityClient.test.ts` › "join: 200 {status:'member'} resolves; other bodies (missing status, 'pending', non-JSON) → unknown" | Response validation |
| `identityClient.test.ts` › "join errors: join_closed / join_approval_unavailable / join_unavailable / email_unverified / session_invalid mapped; app_mismatch → unknown; fetch throw → network" | AC2 |
| `identityClient.test.ts` › "accounts: GET {BASE}/auth/accounts, credentials include, X-MM-App, no body, no-store" | Request shape |
| `identityClient.test.ts` › "accounts: drops items with a non-UUID account_id or a non-string/empty email; non-array items → []; Vietnamese/IDN email kept as-is" | Validation, diacritics edge case |
| `errors.test.ts` › "not_member joinAvailable only for details.join_available === true ('true', 1, missing, null → absent)" | Strict parsing |
| `errors.test.ts` › "join codes are accepted; app_mismatch → unknown" | AC2 |
| `tokenStore.test.ts` › "join calls client.join(id) then /token; no token before join resolves; getToken returns the new token" | AC1 order |
| `tokenStore.test.ts` › "join rejection (join_closed) does not call /token; session_invalid clears the id" | AC2 |
| `tokenStore.test.ts` › "join without an id makes no call" | Guard |
| `tokenStore.test.ts` › "a forget() during join discards the late token" | Generation guard |
| `tokenStore.test.ts` › "accountEmail: login email kept in memory, no accounts call; after restore it reads accounts and matches the id; no match → null; forget clears it" | Email source |
| `tokenStore.test.ts` › "never writes anything but mm_account_id" (extend the existing test to run a join) | No new storage |
| `JoinScreen.test.tsx` › "shows Tiếp tục với <email>; click calls onJoin once" | AC1 |
| `JoinScreen.test.tsx` › "privacy notice is rendered and precedes the continue button in DOM order" | AC3 |
| `JoinScreen.test.tsx` › "submitting disables the button and shows the joining label" | Double submit |
| `JoinScreen.test.tsx` › "error notice uses authErrorMessage; other-account link calls onUseOtherAccount" | AC2 |
| `JoinScreen.test.tsx` › "an email with markup is rendered as text" (`<b>x</b>@a.co`) | No HTML injection |
| `AuthGate.test.tsx` › "sign-in: not_member + join_available → join screen with the login email; no join call before the click" | AC1, D8 consent |
| `AuthGate.test.tsx` › "restore: not_member + join_available → accounts lookup → join screen; no join call" | AC1, D8 |
| `AuthGate.test.tsx` › "restore: accounts has no match → sign-in with not_member copy" | Fallback |
| `AuthGate.test.tsx` › "not_member without join_available → sign-in with not_member copy, no accounts/join call" | Unchanged path |
| `AuthGate.test.tsx` › "click → one join(ID) → one token → App rendered" | AC1 |
| `AuthGate.test.tsx` › "it.each join_closed / join_approval_unavailable / join_unavailable / email_unverified / rate_limited / network → stays on join with AUTH_COPY text; a second click retries" | AC2 |
| `AuthGate.test.tsx` › "join session_invalid → sign-in, id cleared" | AC2 |
| `AuthGate.test.tsx` › "Dùng tài khoản khác → sign-in, id cleared, logout not called" | Account switch |
| `AuthGate.test.tsx` › "background refresh not_member + join_available while ready → App unmounted → join screen" | Removed member rejoin |
| `copy.test.ts` › "every AuthErrorCode has a message" (extended) | R6 |
| `Editor.test.tsx` › "photoById shows the photo privacy notice; without it there is no notice" | AC3, R1 |

## Approach
1. **Types and errors.** Add the three join codes and `joinAvailable`. `toAuthError` reads `details.join_available` for
   `not_member` with a strict `=== true`. Server text is still never echoed.
2. **Client.** Add a private `get(path)` next to `post`. Both cookie-class helpers send `credentials: "include"` and
   `X-MM-App` (R3; same headers as `/token`). `join` and `accounts` validate the reply shapes and reject with plain
   `AuthError`s. No token is ever handled by these two calls.
3. **Store.** Keep `email` in the closure only (from `login`), and clear it with the id in every path that clears the
   id. `accountEmail()` and `join()` are as in the Files table. The access token is still fetched only through
   `fetchToken()`. `join()` calls it only after `client.join` resolved and the generation is unchanged. Storage is
   unchanged (only `mm_account_id`, D7).
4. **Copy.** Add `src/constants/privacy.ts` with the ticket's copy verbatim. `AUTH_COPY.join` and `EDITOR_COPY.photo`
   reference it, so each feature keeps its copy in its own `copy.ts` (R6) and the text exists once. Proposed strings
   (Ming may edit):
   - title "Tham gia Tủ đồ của tôi"
   - body "Tài khoản của bạn chưa dùng Tủ đồ của tôi. Nhấn nút bên dưới để bắt đầu."
   - continue `` (e) => `Tiếp tục với ${e}` ``
   - joining "Đang tham gia…"
   - otherAccount "Dùng tài khoản khác"
   - `join_closed` "Tủ đồ của tôi hiện không nhận thành viên mới."
   - `join_approval_unavailable` "Tủ đồ của tôi chưa mở cho thành viên mới. Vui lòng thử lại sau."
   - `join_unavailable` "Chưa thể tham gia Tủ đồ của tôi lúc này. Vui lòng liên hệ người vận hành."
5. **JoinScreen.** Built from `AuthLayout`, `AuthNotice`, `Btn` and `LinkButton`. It uses theme variables only, no
   fixed widths, and `break-all` on the email label (R9, `boundary.test.ts`). The privacy notice comes first, then any
   error, then the button. The email is rendered as React text.
6. **AuthGate wiring.** Add the `join` view and the `onTokenError` helper. **No path calls `store.join()` except the
   button's `onClick`** (D8: the click is the consent). `joinStatus` blocks a second request while one is in flight.
   On success, `enterReady()` mounts a new App generation, as sign-in does.
7. **Preview and editor.** Add the preview screen. In the editor, show the notice only when `photoById`.
8. **Checks.** Run typecheck, format:check, test and build.

Rules: R1 holds. Local mode never mounts `AuthGate`, and the editor notice is gated by `photoById`. Identity calls stay
in `identityClient.ts`, and `boundary.test.ts` is unchanged. R3 holds: there are no secrets, the token stays in
memory, and the join uses cookie + `X-MM-App` only. R6 is met by the copy setup in step 4. R7: Settings is not
touched, and there is no `@mmlabs/auth-client` swap (A10 follow-up). R8: see the tests above. R9: see step 5 and the
preview. R10 holds: no Figma files are touched. R2, R4 and R5 do not apply (no schema or storage changes).

## Specialist input used
None. There are no consult files in the ticket folder. The security constraints from the orchestrator's brief are
adopted in full:
- same credentials and headers as the other Identity calls;
- the token only after a successful join;
- no new token storage;
- no auto-join.

## Assumptions
- **A1. The email for the restore path comes from `GET /auth/accounts`.** `not_member` carries no email
  (`details = {join_available}` only), and storing the email on the device would be new storage. After a sign-in, the
  email that `login` returned is in memory. After a reload, one `accounts` call finds it. If no item matches, the gate
  falls back to sign-in with the existing `not_member` copy, so the user never sees a join button without the account
  it acts for.
- **A2. "Dùng tài khoản khác" uses `forget()`, not `signOut()`.** This leaves the shared device session for other
  mmlabs apps intact, the same choice as `onAuthLost` in T-019.7.
- **A3. A background `not_member` with `join_available` (a member that staff removed, policy `open`) also leads to the
  join screen.** consumers.md: "A member that staff removed can join again." The App unmounts first, as with every other
  auth loss.
- **A4. The editor notice shows in API mode under either auth kind.** Under `access` (today's production) it is
  equally true: the photos are in Ming's Drive.
- **A5. The privacy text is the ticket's proposed copy, verbatim.** Ming may change it in one file after merge.
- **A6. The CSP already allows `connect-src https://api.mmlabs.online`** (T-019.8, used by `/token`), and the CORS
  preflight for a GET with `X-MM-App` is expected (consumers.md). No server or CSP change.
- **Hotspots.** `src/App.tsx` is not edited. No open ticket (`IN_PROGRESS` / `REVIEW` / `DONE`) edits these files.
  T-019.12 (BACKLOG, forgot-password) will edit `AuthGate.tsx`, `copy.ts`, `identityClient.ts`, `types.ts` and
  `AuthPreview.tsx`, so whichever runs second rebases.
- **Size.** About 260 changed source lines and about 280 test lines. That fits one implement/review cycle, and a split
  would separate the client from its only caller.

## Blocking questions
None.

## Split proposal
None.
