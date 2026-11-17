Status: READY

# Plan — T-023: Lower the password minimum to 6 characters

## Feature summary
No `docs/feature-list.md` section sets a password length. The ticket (Feature reference):
> 12 came from org-admin-api `password_min_length` (T-019.11 plan, `src/features/auth/validation.ts:3`).
> Ming, 2026-11-16: "thêm 1 thay đổi password chỉ yêu cầu tối thiểu 6 kí tự". Needs a new decision row when planned.

Ticket scope:
> - `PASSWORD_MIN` 12 → 6 in `src/features/auth/validation.ts` (sign-up and reset/new-password validation).
> - Vietnamese copy in `src/features/auth/copy.ts`: `signUp.passwordHint`, `fieldErrors.tooShort`, `errors.weak_too_short` say 6.
> - Update the tests that use 12 as the boundary.

(The ticket says `errors.weak_too_short`; in the code the key is `actions.weak_too_short`, `copy.ts:103`.)

**The ticket's open risk is resolved.** The ticket's note "a setting declared `ge=8`" is out of date: org-admin-api commit
`87026db` ("solo: password minimum length 6 (was 12)") on `origin/main` sets
`app/core/config.py`: `password_min_length: int = Field(default=6, ge=6)  # owner, 2026-11-16: minimum 6 (was 12)`.
(The local checkout's working branch `claude/magical-cori-2ssw8l` still shows `default=12, ge=8`; `main` is what releases.)
The API therefore accepts a 6-character minimum by default; whether production runs that build is a Ming check below,
not a blocker. The server's `too_common` list is loaded "lower-cased, length >= 8" (`app/modules/auth/passwords.py`),
so 6–7 character passwords are never rejected as `too_common` — a weaker policy, which Ming has accepted.

**Decision row for /run to add to `work/decisions.md`** (next free number is **D43**; D42 is the last row):

| D43 | 2026-11-16 | Password minimum 6 characters | New passwords (sign-up and reset) need at least 6 characters (code points after NFKC), down from 12; maximum 128 and the server's "too common" check are unchanged. Matches org-admin-api `password_min_length` default 6 (`ge=6`, commit 87026db, in release/v0.1.6). Security note: 6 is a weak minimum, and the server's common-password list only holds entries of 8+ characters, so 6–7 character passwords get no common-password check; accepted by Ming. Sign-in validation is unchanged. | Ming 2026-11-16: "thêm 1 thay đổi password chỉ yêu cầu tối thiểu 6 kí tự" | T-023 |

(Match the column layout D42 uses: number, date, title, decision, source, affects.)

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Sign-up and reset-password accept a 6-character password and reject a 5-character one (code points after NFKC, as today). | `validation.test.ts` › `passwordError (sign-up)` › "5 → tooShort, 6 → ok"; › `validateNewPassword` › "5 chars -> tooShort, 6 -> ok"; NFKC test (see Tests); `SignUpScreen.test.tsx` "short password" uses 5 chars and the valid-submit test uses 6; `ResetPasswordScreen.test.tsx` 5-char rejection and 6-char acceptance. |
| 2 | Hint and error texts say "6 ký tự"; no "12 ký tự" left in `src/`. | `grep -rn "12 ký tự" src/` returns nothing; `grep -rn "6 ký tự" src/features/auth/copy.ts` shows `passwordHint`, `fieldErrors.tooShort`, `actions.weak_too_short`. `copy.test.ts` new assertion (see Tests). |
| 3 | Sign-in validation is unchanged. | `git diff` shows no change to `signInPasswordError` / `validateSignIn`; existing sign-in tests pass unchanged. |
| 4 | Unit tests cover the 5/6 boundary; all checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green. |
| 5 | Decision recorded. | D43 row present in `work/decisions.md` (added by /run on `main` per D16 conventions, text above). |

## Ming verification after merge
- **Production API minimum.** Confirm that api.mmlabs.online runs org-admin-api with commit `87026db` (release v0.1.6 or later) and that production does **not** set `PASSWORD_MIN_LENGTH` to a larger value (or sets it to 6). Check: on the deployed TuDo, sign up with a fresh email and a 6–11 character password that is not common (e.g. `tudo7x`): the account is created and the verification email is sent; no "Mật khẩu cần ít nhất 6 ký tự." / `weak_password` `too_short` error. If the API still answers `too_short`, TuDo's form shows the server message "Mật khẩu cần ít nhất 6 ký tự." for a 6+ character password — misleading until the API is updated, so deploy TuDo only after this check passes (or accept the window).
- Same check on reset password (forgot → link → 6-character new password succeeds).
- 390px + dark mode: the sign-up hint reads "Ít nhất 6 ký tự." (text-only change; layout unaffected).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/validation.ts` | `PASSWORD_MIN = 6`; comment updated to "org-admin-api `password_min_length` (default 6, ge=6 since 87026db; D43)". | Scope item 1. |
| `src/features/auth/copy.ts` | `signUp.passwordHint` → "Ít nhất 6 ký tự."; `fieldErrors.tooShort` → "Mật khẩu cần ít nhất 6 ký tự."; `actions.weak_too_short` → "Mật khẩu cần ít nhất 6 ký tự." | Scope item 2; R6 (copy stays in the one copy file). |
| `src/features/auth/validation.test.ts` | Move boundary tests from 11/12 to 5/6; fix the NFKC test whose inputs become valid at 6 (details below). | Scope item 3; R8. |
| `src/features/auth/SignUpScreen.test.tsx` | "short password" case uses `"a".repeat(5)`; default `fill` password `"a".repeat(6)` (so the valid-submit test proves 6 is accepted at screen level). | AC 1 at screen level (ticket Test plan: "screens accept 6 characters"). |
| `src/features/auth/ResetPasswordScreen.test.tsx` | Rename/adjust the "11 chars and mismatch" test to 5 chars; mismatch step and a valid step use 6 chars. | AC 1 at screen level. |
| `src/features/auth/copy.test.ts` | One assertion that the three password-length strings contain `${PASSWORD_MIN} ký tự` (import `PASSWORD_MIN`). | AC 2; guards copy ↔ constant drift. |

No other file. `work/decisions.md` (D43) is written by /run, not by the implementer's product diff.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `validation.test.ts` › `passwordError (sign-up)` › "5 → tooShort, 6 → ok" | `"a".repeat(5)` → `tooShort`; `"a".repeat(6)` → null. Replaces "11 → tooShort, 12 → ok". |
| `validation.test.ts` › `passwordError (sign-up)` › "does not trim" | Change to `" " + "a".repeat(4) + " "` → null (6 incl. spaces) and add `" aaa "` (5) → `tooShort`, so it still proves spaces count. |
| `validation.test.ts` › `passwordError (sign-up)` › "measures after NFKC" | Replace inputs that become valid at 6: `"é".repeat(5)` → `tooShort`; `"mật k".normalize("NFD")` (7 code points raw, 5 after NFKC) → `tooShort`; `"mật kh".normalize("NFD")` (6 after NFKC) → null; `"ｍａｔｋｈ"` (5 full-width) → `tooShort`, `"ｍａｔｋｈａ"` → null. Vietnamese diacritics edge case. |
| `validation.test.ts` › `validateNewPassword` › "5 chars -> tooShort, 6 -> ok" | Reset policy boundary. Replaces "11 chars -> tooShort, 12 -> ok". |
| `validation.test.ts` › NFKC full-width test | `"１".repeat(6)` → null and `"１".repeat(5)` → `tooShort`. |
| `validation.test.ts` › `validateSignUp` cases using `"a".repeat(12)` | Unchanged (still valid); leave as is. |
| `SignUpScreen.test.tsx` › "short password shows error…" | 5 chars → `fieldErrors.tooShort`. |
| `SignUpScreen.test.tsx` › "valid submit omits the confirm value" | 6-char password reaches `onSignUp`. |
| `ResetPasswordScreen.test.tsx` › "5 chars and mismatch focus the first invalid field and do not call onReset" | 5-char rejection; mismatch at 6 chars. |
| `copy.test.ts` › "password length copy matches PASSWORD_MIN" | `signUp.passwordHint`, `fieldErrors.tooShort`, `actions.weak_too_short` contain `"6 ký tự"` via `PASSWORD_MIN`. |

## Approach
1. `validation.ts`: set `PASSWORD_MIN = 6`, update the comment. `passwordError` logic unchanged (NFKC, no trim, max 128); `signInPasswordError` untouched (AC 3).
2. `copy.ts`: change the three strings to "6 ký tự". Keep them literal strings (no template), matching the file's style.
3. Update tests as listed; run `grep -rn "12 ký tự" src/` → empty.
4. Run checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`.

Rules: R1/R2/R4/R5 not touched (no data access, schema or storage). R3: no secrets. R6: Vietnamese copy only in `copy.ts`. R7: only the files above; the max length, `too_common`, server-side behaviour stay out. R8: boundary tests updated. R9: text-only change; Ming checks 390px/dark. R10: no Figma files.

Security note (areas: security): a 6-character minimum is weak against online guessing and offline cracking; mitigations stay on the server (Argon2id, per-email backoff, per-IP limit, Turnstile — org-admin-api R11). The reviewer should record the note; the decision is Ming's (given 2026-11-16, D43).

## Specialist input used
None (no consults). The orchestrator's org-admin-api facts were checked: `origin/main` and commit `87026db` show `Field(default=6, ge=6)`; its presence in release/v0.1.6 is taken from the orchestrator (no local ref for that branch).

## Assumptions
- A1: org-admin-api `main` (and release/v0.1.6) enforce minimum 6; TuDo's client check equals the server default. If production overrides `PASSWORD_MIN_LENGTH`, the server message would be wrong — covered by Ming verification.
- A2: The ticket's "`errors.weak_too_short`" means `actions.weak_too_short` in `copy.ts`.
- A3: Tests that use 12-character passwords as *valid* input (sign-up validate cases, ResetPasswordScreen mismatch) may keep 12 except where listed; only boundary semantics change.
- A4: Hotspots: `src/features/auth/copy.ts` and its tests; no other open ticket (`IN_PROGRESS`/`REVIEW`/`DONE`) in `work/backlog.md` is planned to edit them (T-019.9 DONE leaves auth UI untouched). `src/App.tsx` not touched.
- A5: `work/decisions.md` D43 is added by /run (D16: board/decision changes on `main`), not part of the implementer's file list.

## Blocking questions
None. (Gate: plan-approval — Ming approves this plan before IMPLEMENT.)

## Split proposal
None (≈30 changed lines).
