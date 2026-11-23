Status: READY

# Plan — T-031: Auth and server tidy-ups from T-028

## Scope summary
Ticket `## Scope` (quoted):
- "`identityClient.accounts()`: cap the email length (~320 chars); drop longer entries."
- "Remove the now-unreachable `email_unverified` banner + resend from `SignInScreen` (and its tests)."
- "`server/README.md`: list 401 `unauthorized` and 503 `auth_unavailable` in the error-code paragraph."
- "`server/me.js` / `api.js`: narrow the `ownerSub` JSDoc to `UserId | null`; braces on the new `match()` entry."
- "`server/app.test.ts`: move `vi.restoreAllMocks()` in the log test to `afterEach`."
- "`jwks.js`: `isUsableKey` typed instead of `any`; the single-flight test on a warm cache."

Out of scope (ticket): "Behaviour changes beyond the list; SPA use of `/api/auth/me` (no screen needs it yet)."

Sources for each item:
- Email cap: T-028.3 `security-review.md` attempt 1 note 1: "The email has no length cap ... Optional hardening: cap the email at ~320 characters in the parser." The same item is repeated in attempt 2's follow-ups.
- Banner: T-028.3 `plan.md:249`: "The `SignInScreen` `email_unverified` banner becomes unreachable from AuthGate's main paths but is kept (R7); its removal is a follow-up." Also `plan.md:262` and `review.md` › Follow-ups: "removing the unreachable SignInScreen `email_unverified` banner".
- README: T-028.4 `review.md` › Follow-ups: "`server/README.md` error-code paragraph does not list 401 `unauthorized` / 503 `auth_unavailable`."
- `ownerSub` / braces: T-028.4 `review.md` › Nits: "`server/api.js:39-40` — braceless `if` ... the neighbouring wrapped entries in `match()` use braces" and "`server/me.js:5` — `ownerSub` JSDoc is `UserId | string | null`; `UserId | null` would be tighter".
- `restoreAllMocks`: T-028.4 `security-review.md` item 1: "`server/app.test.ts:559`: `vi.restoreAllMocks()` sits at the end of the test body. If an earlier `expect` fails, the `console` spies leak into later tests. Fix: move it to `afterEach(...)`".
- jwks: T-028.1 `review.md` attempt 2 › Nits: "single-flight test ... still runs on an empty cache (not a stale set) and `Promise.all([a, b])` is not asserted truthy. Either drop 'stale' from the name or seed a set and advance the clock past `FRESH_MS` first." and "`isUsableKey` takes `any`".
- D50 (`work/decisions.md`) covers the adopted sign-in contract: "Continue as {email}" list from `GET /accounts`, verifier hardening and 503 when no keys. None of the items changes what D50 decided.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `accounts()` drops entries whose email is longer than 320 UTF-16 code units and keeps one of exactly 320. A dropped entry does not take one of the 5 list slots, because the parser runs before AuthGate's cap. | `identityClient.test.ts › accounts: an email of 320 chars is kept, 321 is dropped; other entries survive` |
| 2 | `SignInScreen` no longer has a resend action or resend notices. `email_unverified` still renders its error message, because that path is reachable when no account id is held. | `SignInScreen.test.tsx › email_unverified shows the message only: no resend button, no status notice`; the existing `renders error $code` row for `email_unverified` still passes; `SignInScreenProps` has no `onResend`/`resend` (typecheck) |
| 3 | After a remote sign-out, a resend that was sent on the unverified screen no longer leaks a "resend sent" notice onto the sign-in page. This is the one observable effect of the removal. | `AuthGate.test.tsx › cross-tab… › unverified -> resend sent -> remote sign-out -> sign-in shows only the signed-out notice` (fails before the change: `resendSent` text is present) |
| 4 | README error-code paragraph lists 401 `unauthorized` and 503 `auth_unavailable` (`Retry-After: 30`). | Read `server/README.md` "Errors are ..." paragraph (currently line 64) |
| 5 | `ownerSub` is typed `UserId \| null` in `me.js`, and the types it passes through are narrowed to match (see Approach 4). There is no runtime change. | `pnpm typecheck` green; `git diff` on the server `.js` files shows only JSDoc lines, plus the braces in `match()` |
| 6 | The `/api/auth/me` entry in `match()` uses braces like its neighbours. | `git diff server/api.js` |
| 7 | `vi.restoreAllMocks()` runs in an `afterEach`, not at the end of the log test. | `git diff server/app.test.ts`; the test still passes |
| 8 | `isUsableKey` takes `unknown` (no `any`) and is a type guard. Filter behaviour is unchanged. | `git diff server/jwks.js`; the existing `key filter` tests pass unchanged |
| 9 | Single-flight is tested on a warm (stale) cache: the set is seeded, the clock is moved past `FRESH_MS`, two concurrent lookups make 1 extra fetch, and both resolve truthy. The cold case is kept and named "cold". | `jwks.test.ts › concurrent requests on a stale set share one refetch and both resolve a key`; `› concurrent cold requests share one fetch …` |
| 10 | No other behaviour change; all checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green; the existing auth and server suites unchanged except the tests named here |

## Ming verification after merge
None. This is hardening and cleanup only; nothing differs on production in normal use.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/identityClient.ts` | `ACCOUNT_EMAIL_MAX = 320`; `accounts()` drops items with `email.length > 320`. | Item 1 | Yes (CLAUDE.md: `src/features/auth/**`) |
| `src/features/auth/identityClient.test.ts` | New cap test (AC1). | Item 1, R8 | Yes (CLAUDE.md) |
| `src/features/auth/SignInScreen.tsx` | Remove `onResend`/`resend` from destructuring, the error notice `action`, and the two `resend` notices (`:67-81`). Keep the plain error notice. | Item 2 | Yes (CLAUDE.md) |
| `src/features/auth/SignInScreen.test.tsx` | Replace the test `email_unverified offers resend only when onResend is given` (`:86-116`) with the AC2 test; drop the `AuthErrorCode` import if it becomes unused. | Item 2 | Yes (CLAUDE.md) |
| `src/features/auth/types.ts` | Remove `onResend`/`resend` (and their comment) from `SignInScreenProps`. `ResendState` stays, because other screens use it. | Item 2 (props no longer exist) | Yes (CLAUDE.md) |
| `src/features/auth/AuthGate.tsx` | Stop passing `onResend`/`resend` to `<SignInScreen>` (`:577-578`). `canResend` stays for `SignUpScreen`. | Item 2 (typecheck) | Yes (CLAUDE.md) |
| `src/features/auth/AuthGate.test.tsx` | New AC3 test in `cross-tab and sign-out warning`, using the existing `remoteSignOut` helper. | Item 2, "test where behaviour changes" | Yes (CLAUDE.md) |
| `src/features/auth/preview/AuthPreview.tsx` | Drop `onResend` from the `<SignInScreen>` element (`:129`). | Item 2 (typecheck; dev-only preview) | Yes (CLAUDE.md) |
| `server/README.md` | Add 401 `unauthorized` and 503 `auth_unavailable` (`Retry-After: 30`, see Identity tokens) to the "Errors are ..." paragraph. | Item 3 | Yes |
| `server/me.js` | JSDoc `ownerSub: UserId \| null`. | Item 4 | Yes |
| `server/api.js` | `handleApi` ctx JSDoc `ownerSub: import("./user.js").UserId \| null`; braces on the `auth`/`me` entry in `match()`. | Item 4 | Yes |
| `server/app.js` | `createApp` deps JSDoc `ownerSub?: import("./user.js").UserId \| null`. | Item 4: required so the narrowed `api.js` type still typechecks (Approach 4) | Yes |
| `server/app.test.ts` | Import `afterEach`; add `afterEach(() => vi.restoreAllMocks())` in `describe("identity auth")`; remove `:559`. Type `startIdentity`'s `ownerSub` as `UserId \| null`, and build `SUB`/`OTHER_OWNER` for it through `toUserId(...) as UserId` where they are passed as owner. | Items 4, 5 | Yes |
| `server/photoQuota.db.test.ts` | `extra.ownerSub?: UserId` (type only; callers already pass `OWNER_A`). | Item 4 (typecheck) | Yes |
| `server/ai/tagPhoto.test.ts` | `opts.ownerSub?: UserId \| null` (type only). | Item 4 (typecheck) | Yes |
| `server/ai/suggestOutfits.test.ts` | `opts.ownerSub?: UserId \| null` (type only). | Item 4 (typecheck) | Yes |
| `server/jwks.js` | `isUsableKey`: `@param {unknown} k`, `@returns {k is import("jose").JWK}`, a narrowed local cast for the field reads; same checks. | Item 6 | Yes |
| `server/jwks.test.ts` | Rename the existing single-flight test to "cold" and assert both results are truthy; add the warm/stale test (AC9). | Item 6 | Yes |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `identityClient.test.ts › accounts: an email of 320 chars is kept, 321 is dropped; other entries survive` (items `[{ID, 321-char}, {ID2, 320-char}, {ID3, "a@b.co"}]` give the last two, in order; the long email uses a Vietnamese local part such as `"ễ".repeat(n) + "@x.vn"` so the limit is counted in code units, not bytes) | AC1; Domain focus (diacritics) |
| `SignInScreen.test.tsx › email_unverified shows the message only: no resend button, no status notice` | AC2 |
| `AuthGate.test.tsx › cross-tab and sign-out warning › unverified -> resend sent -> remote sign-out -> sign-in shows only the signed-out notice` (setup `{ id: ID, firstTokenError: err("email_unverified") }`, click resend, see `resendSent`, `remoteSignOut(s.other)`, assert the sign-in form, `getByRole("status")` contains `signIn.signedOut`, `queryByText(AUTH_COPY.actions.resendSent)` is null). The implementer records in impl-log that it fails on the unchanged `SignInScreen`. | AC3 |
| `jwks.test.ts › concurrent requests on a stale set share one refetch and both resolve a key` (seed with one fetch, `state.t += FRESH_MS + 1_000`, deferred second response, two concurrent `getKey`, release; `fetchFn` called 2 times total, both truthy) | AC9 |
| `jwks.test.ts › concurrent cold requests share one fetch and both resolve a key (single-flight)` (rename of `:68`, plus truthy asserts) | AC9 |

No other test changes, apart from removing the old SignInScreen resend test.

## Approach
1. **Wait for T-029 to merge, then rebase** `ticket/T-031` onto `main` before IMPLEMENT (see Assumptions A1). The implementer re-reads `SignInScreen.tsx`, `types.ts`, `AuthGate.tsx` and the two test files on the rebased tree, and keeps every T-029 prop, handler and test (the retry sign-out props on `SignInScreen`, T19–T20) exactly as merged.
2. **Email cap** (`identityClient.ts:184-192`): add `it.email.length <= ACCOUNT_EMAIL_MAX` to the existing filter condition. Only the parser changes; AuthGate's dedupe and the cap of 5 are untouched.
3. **Banner removal**: change only the files listed. After this, `SignInScreen` renders `error` through `authErrorMessage` with no `action`. Why removal is safe:
   - `AuthGate.failTo` (`:131`) sends every `email_unverified` with an account id to `UnverifiedScreen`.
   - `canResend` requires an account id, so the resend action was unreachable.
   - The only reachable remnant was the stale `resend` notice after a remote sign-out (AC3). `onRemoteSignOut` does not reset `resend`, and removing the prop fixes that by construction. Do **not** add a `setResend` call in AuthGate; it is not needed (R7).
   - `copy.ts` is unchanged: `actions.resend*` are still used by `UnverifiedScreen`, `SignUpScreen` and `VerifyEmailScreen`.
4. **`ownerSub` typing**: `UserId` is a branded string (`server/user.js:4`). Narrowing only `me.js` fails typecheck, because `api.js:71` passes `string | null`. Narrowing `api.js` then fails at `app.js:138`. So the narrowing goes along the chain `me.js` → `api.js` ctx → `app.js` `createApp` deps. Notes on the chain:
   - Production already passes a `UserId`: `index.js:78` uses `ownerSubOf`, which returns `UserId`.
   - Downstream consumers (`createInFlight`, `createPhotoQuota`, `createLimiter`, `createWeather`, `handleAdminAiKeys`) take `string`, and a `UserId` is assignable to it, so they are unchanged.
   - Test helpers that declare `string` get the type-only edits listed above.
   - No runtime line changes.
   - Ming may choose the narrower alternative at the gate (Assumptions A3).
5. **`match()` braces** (`api.js:40-41`): wrap the entry in `{ }` like `:25-27`.
6. **`app.test.ts`**: add `afterEach(() => vi.restoreAllMocks())` inside `describe("identity auth")`. Only `:538` spies, so the scope is safe, and `fixedAuth`/other tests use no mocks that need to survive.
7. **jwks**: type the guard so `json.keys.filter(isUsableKey)` yields `JWK[]`. Then make the test changes above.
8. Run `pnpm format`, then all four checks.

Rules:
- R1: no new `fetch`; `boundary.test.ts` still passes.
- R3: nothing secret changes.
- R6: no new copy.
- R7: only listed files; anything else goes to follow-ups.
- R8: tests listed above.
- R9: the UI change is a pure removal of notices and a button, so no layout can widen. The reviewer may confirm at 390 px and in dark mode via `/auth-preview.html` (signIn `email_unverified` state); a one-off Playwright run is optional.

## Specialist input used
None (area `security` has no consult agent). Review-agent notes from T-028.1, T-028.3 and T-028.4 are the scope sources, cited above.

## Assumptions
- **A1 — Hotspot T-029 (DONE, PR not merged; branch `origin/ticket/T-029`). Recommendation: T-031 waits for T-029's merge before IMPLEMENT.**
  - I could not read `origin/ticket/T-029` (no shell in this run, so no `git show`). The overlap below comes from T-029's `ticket.md` › Technical notes ("`tokenStore.ts`, `authChannel.ts`, `AuthGate.tsx`, `SignInScreen.tsx`, `copy.ts`, tests") and the orchestrator's brief (SignInScreen props, retry sign-out, tests T19–T20).
  - The orchestrator should diff T-029's `plan.md`/`pr.md` against the list below before IMPLEMENT.
  - Overlapping files:
    - `src/features/auth/SignInScreen.tsx`: T-029 adds a "Thử đăng xuất lại" action on the `logout_unconfirmed` notice (`:52-62`), next to the error notice/`action` block that T-031 removes (`:63-81`). This is a textual conflict.
    - `src/features/auth/types.ts`: both edit `SignInScreenProps`. T-029 adds retry props; T-031 removes `onResend`/`resend`.
    - `src/features/auth/AuthGate.tsx`: both edit the `<SignInScreen>` element (`:566-583`). T-029 also edits `onRemoteSignOut`/`forget` paths, which AC3's test exercises.
    - `src/features/auth/SignInScreen.test.tsx` and `AuthGate.test.tsx`: T-029's T19–T20 live in these files.
    - `src/features/auth/preview/AuthPreview.tsx`: likely, if T-029 wires the retry action into the preview.
    - `copy.ts` and `tokenStore.ts`: T-029 only. T-031 does not edit them.
  - T-031 must keep T-029's retry props, handlers and tests unchanged.
  - The server items have no overlap, but splitting the ticket for that is not worth it at P3.
- **A2 — Hotspot T-030 (DONE, unmerged)**: its ticket names only `src/data/authFetch.ts` and its test (plus `work/decisions.md`). I expect no overlap. If it also touched `server/README.md`, a trivial rebase.
- **A3 — `ownerSub` narrowing goes through `app.js` and four test type annotations** (Approach 4). This goes beyond the ticket's literal "`me.js` / `api.js`", but it is the smallest change that typechecks.
  - Default: do it.
  - Alternative if Ming prefers: narrow only `me.js`, and keep `api.js`/`app.js` at `string | null` with a `/** @type {UserId | null} */` cast at `api.js:149`. That is smaller, but it is a cast, not a real narrowing.
- **A4 — The `email_unverified` error text stays on SignInScreen.** "Banner" is read as the resend action and the resend notices. The message is still reachable when `/auth/login` itself answers `email_unverified` (no id yet, `tokenStore.ts:243-245`). Removing it would be a behaviour change.
- **A5 — Length counted in UTF-16 code units** (`String.length`, about 320 = 64 + 1 + 255). Identity remains the authority; this is display hardening only.
- **A6 — BUG-008 security finding 3** (re-list depends on how the id was cleared): it applies only if new code calls `store.forget()` during the join lookup (`checking`). T-031 adds no `forget()` call and does not touch `offerJoin`/`failTo`, so it is **out of scope** here. It stays the `debt` follow-up named in BUG-008's security review. T-029 adds `signedOut` broadcasts on `forget()` but no same-tab `signOutSeq` bump (BroadcastChannel does not deliver to the sender), so finding 3 stays open after T-029 too.
- **A7 — Gate**: `.claude/loop.config.md` › High paths omits `src/features/auth/**`, which CLAUDE.md marks High (already noted in BUG-008). The ticket's plan-approval gate covers it either way, and `server/**` is High in both.

## Blocking questions
None.

## Split proposal
None (estimated about 120–170 changed lines across code, tests and docs).
