Status: READY

# Plan — T-030: Decide whether a 403 from the API signs the user out

## Scope summary
- Ticket goal: "`authFetch` treats a 403 from the Node API the way Ming decides, and the behaviour is pinned by tests."
- Ticket scope: "Apply Ming's decision in `src/data/authFetch.ts` and document it."
- Ticket scope reference: "D50; T-028.1 follow-up (PR #89): the T-028.1 ticket text said 'only 401/403 sign out', but `authFetch` signs out only on a repeated 401."
- Ming's decision (ticket, Notes / answers from Ming, 2026-11-23): "option (a), the recommendation — a 403 passes through as an error, test-pinned; it does not sign the user out."
- Technical notes, option (a): "keep — a 403 passes through as an error (current; `forbidden_origin` is a config problem, signing out would not help)".
- `work/decisions.md` D50 adopts the mmlabs sign-in work as T-028.1–T-028.4 but does not say how a 403 is handled. This ticket adds that as a new decision row (D55).
- `docs/feature-list.md` has nothing on this. It is a T-ticket follow-up, not feature-list scope.

Current behaviour already matches (a). `src/data/authFetch.ts:44` returns every non-401 response as is (`if (res.status !== 401) return res;`), and `src/data/repo.http.ts:56-67` turns it into `ApiError(403, <code>)`. `onAuthLost` is only called at `authFetch.ts:48`, after a second 401. So no logic changes. The ticket adds the decision record, a doc comment and tests that pin the behaviour.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Ming's decision is recorded in `work/decisions.md`. | A new row `D55` (date 2026-11-23) in `work/decisions.md` says that a 403 from the Node API (e.g. `forbidden_origin`) is passed through as an error, does not call `onAuthLost` and does not trigger the token-refresh retry. It amends the T-028.1 ticket wording "only 401/403 sign out", cites Ming 2026-11-23 ("duyệt tất cả", option a) and applies to T-030. |
| 2 | Tests cover a 403 (e.g. `forbidden_origin`) per that decision; 401 and 503 behaviour unchanged. | New tests in `src/data/authFetch.test.ts` and `src/data/repo.http.test.ts` (listed below) pass. All existing 401/503 tests in `authFetch.test.ts` (`503 is passed through…`, `401 then 503 on the retry…`, `401 -> one retry…`, `second 401 -> onAuthLost once…`, `getToken null…`) still pass and their bodies are unchanged (`git diff` shows only additions in the test files). |
| 3 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green. |

Extra check (from the scope "document it"): the doc comments on `AuthOptions.onAuthLost` and `createAuthedFetch` in `src/data/authFetch.ts` say that only a repeated 401 signs out, and that 403 and other statuses are returned to the caller (D55). The diff of `authFetch.ts` contains comment changes only, no change to runtime code.

## Ming verification after merge
None.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `work/decisions.md` | Append row D55 (403 is passed through, no sign-out, no retry) | AC 1 | No |
| `src/data/authFetch.ts` | Doc comments only: `onAuthLost` and `createAuthedFetch` say that 403/other statuses are returned untouched and only a repeated 401 signs out (D55) | Scope: "document it" | No |
| `src/data/authFetch.test.ts` | Add 403 tests | AC 2 | No |
| `src/data/repo.http.test.ts` | Add one test in `describe("identity mode (getToken)")`: a 403 `forbidden_origin` becomes `ApiError(403, "forbidden_origin")` with no `onAuthLost` | AC 2: pins the end-to-end behaviour ("passes through as an error") at the repo level, where the error is created | No |

No High paths. The security review trigger does not fire: `src/data/repo.http.ts` is not changed, only its test file.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/data/authFetch.test.ts › createAuthedFetch › 403 is passed through: no retry, no onAuthLost` | `setup([403], getToken, { onAuthLost })`: the response status is 403, `getToken` is called once, `fetchFn` is called once, `onAuthLost` is not called. |
| `src/data/authFetch.test.ts › createAuthedFetch › 401 then 403 on the retry -> 403 returned, no onAuthLost` | tokens `["t","t2"]`, `setup([401, 403])`: status 403, `fetchFn` called twice, `onAuthLost` not called, the promise resolves (no throw). |
| `src/data/repo.http.test.ts › identity mode (getToken) › 403 forbidden_origin → ApiError(403, forbidden_origin); no onAuthLost` | `fetchFn` returns `json({ error: { code: "forbidden_origin" } }, 403)` (use the file's existing `json` helper with a status). `repo.locations()` rejects with `{ status: 403, code: "forbidden_origin" }`, `onAuthLost` is not called, and `fetchFn` is called once. Build `fetchFn` inline: `withAuth` maps every non-401 status to a 200 body. |

Domain focus items (diacritics, dates, batch partial failure, 390px/dark mode) do not apply: this ticket has no UI, no data mapping and no batch work.

## Approach
1. Add the three tests above. They pass against the current code, which is intended: the ticket pins existing behaviour (option a), so there is no failing-first step. This is not a BUG ticket.
2. Update the doc comments in `src/data/authFetch.ts`:
   - On `onAuthLost`: "A request got 401 again with a freshly fetched token. Called once per failing request. A 403 (e.g. `forbidden_origin`) or any other status never calls it (D55)."
   - On `createAuthedFetch`: add "Every non-401 response, including 403, is returned to the caller unchanged, with no retry."
   Do not change runtime code.
3. Append D55 to `work/decisions.md`, using the same columns as D50–D54. Suggested text: "403 from the API does not sign out | A 403 from the Node API (e.g. `forbidden_origin`) is returned to the caller as an error (`ApiError(403, code)`); `authFetch` does not retry it with a refreshed token and does not call `onAuthLost`. Only a 401 repeated after a token refresh signs the user out. This amends the T-028.1 ticket wording 'only 401/403 sign out'. | `forbidden_origin` is a configuration problem; a new token or signing out would not fix it | Ming 2026-11-23: option (a), 'duyệt tất cả' | T-030, T-028.1".
4. Run `pnpm format`, then all checks.

Rules: R1 holds (no new data access, `WardrobeRepo` unchanged). R7 holds (only the files listed). R8 holds (tests pin the repo/auth behaviour). R3/R4: no secrets or photos involved. The new tests use literal token strings like the existing tests do; they contain no real values.

## Specialist input used
None. The `security` area has no consult agent in `loop.config.md`.

## Assumptions
- The next free decision ID is D55 (the last row is D54, 2026-11-22).
- The historical T-028.1 ticket text is not edited. D55 records the correction.
- Hotspots: no other open ticket edits `src/data/authFetch.ts`, its test, `repo.http.test.ts` or `work/decisions.md`. The only other non-merged ticket is T-029 (DONE), and its files do not include these. If T-029's PR adds a decision row first, rebase and renumber to the next free ID.
- Auth-layer 403s from the Identity service (`not_member`, `email_unverified`, `origin_not_allowed`, …) go through `src/features/auth/**` (`identityClient`/`errors`), not `authFetch`. They are out of scope and unchanged.

## Blocking questions
None.

## Split proposal
None. The change is about 40 lines of tests, comments and one decision row.
