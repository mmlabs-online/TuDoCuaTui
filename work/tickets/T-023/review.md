# Review — T-023

## Attempt 1 — 2026-11-16
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0
- format:check: `pnpm format:check` exit 0 (oxfmt, 258 files)
- test: `pnpm test`: Test Files 99 passed | 10 skipped (109); Tests 1232 passed | 205 skipped (1437). Matches impl-log.
  The four changed test files run verbose: 83/83 passed.
- build: `pnpm build`: built OK
- `grep -rn "12 ký tự" src/`: no matches (exit 1)

### Acceptance criteria
- [x] Sign-up and reset accept 6 and reject 5 (code points after NFKC). Evidence: `src/features/auth/validation.ts:4` `PASSWORD_MIN = 6`, used only at `:35` (`codePoints(value.normalize("NFKC")) < PASSWORD_MIN`).
  Tests passing: `validation.test.ts` › `passwordError (sign-up)` › "5 → tooShort, 6 → ok", "does not trim" (`" aaaa "` → null, `" aaa "` → tooShort), "measures after NFKC"; › `validateNewPassword` › "5 chars -> tooShort, 6 -> ok" and the full-width test (`"１".repeat(6)` → null, `"１".repeat(5)` → tooShort).
  At screen level: `SignUpScreen.test.tsx` › "short password…" (5 chars) and "valid submit omits the confirm value" (6 chars reach `onSignUp`); `ResetPasswordScreen.test.tsx` › "5 chars and mismatch…" and "6 chars are accepted" (`onReset("aaaaaa")`).
  The NFKC boundary test does tell the two counts apart. I checked with node: `"mật k".normalize("NFD")` is 7 code points raw and 5 after NFKC, so it is `tooShort` only if the code counts after NFKC. `"mật kh"` in NFD is 8 raw and 6 after NFKC, so it is accepted. A raw-length count would wrongly accept the 5-character case. `"é".repeat(5)` uses precomposed U+00E9 (bytes 303 251).
- [x] Hint and error texts say "6 ký tự", and no "12 ký tự" is left in `src/`. Evidence: `copy.ts:46` `signUp.passwordHint`, `:76` `fieldErrors.tooShort`, `:103` `errors.weak_too_short`. The grep above is empty. `copy.test.ts` › "password length copy › matches PASSWORD_MIN" ties all three strings to the constant.
- [x] Sign-in validation is unchanged. Evidence: the diff against `origin/main` does not touch `signInPasswordError` / `validateSignIn` (`validation.ts:40-44`) or any SignIn file. `validation.test.ts` › `signInPasswordError` › "no policy at sign-in" passes unchanged.
- [x] Unit tests cover the 5/6 boundary and all checks pass (see above).
- [x] Decision recorded: `work/decisions.md:52` D43 (merged from `main`). It matches the plan's text, including the security note.

### Scope (R7)
`git diff origin/main...HEAD` changes 6 `src/` files: `validation.ts`, `copy.ts`, `validation.test.ts`, `SignUpScreen.test.tsx`, `ResetPasswordScreen.test.tsx`, `copy.test.ts`. That is exactly the plan's file list. The only other changes are the workflow files under `work/tickets/T-023/` (ticket, plan, impl-log). There are no out-of-plan files.

### Deviations in impl-log (checked)
- **`weak_too_short` location**: this deviation is sound. The key is `AUTH_COPY.errors.weak_too_short` (`copy.ts:103`, inside the `errors` block that starts with `network` / `email_taken`). The plan's A2 ("`actions.weak_too_short`") was wrong and the ticket was right. Changing it in place and asserting `AUTH_COPY.errors.weak_too_short` is correct.
- **Separate 6-char reset test**: this deviation is sound. Keeping "5 chars and mismatch…" asserting `onReset` is never called, and proving acceptance in a new test, is stricter than putting both steps in one test. The plan's intent (screen-level 6-char acceptance) is met.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1/R2/R4/R5 do not apply (no data access, schema or storage changes). R3: no secrets. R6: Vietnamese copy only in `copy.ts`. R7: as planned. R8: boundary and NFKC tests updated, plus a copy/constant guard. R9: text-only change, and the 390px/dark check is in Ming's list below. R10: no Figma Make files touched.

### Security note (not a REWORK reason)
A 6-character minimum is weak against online guessing and offline cracking. The server's common-password list only holds entries of 8+ characters, so passwords of 6–7 characters get no "too common" check. Ming accepted this in D43 (2026-11-16). The mitigations stay server-side in org-admin-api: Argon2id, per-email backoff, per-IP limit and Turnstile.

### Ming verification after merge (carry into the PR)
- Production api.mmlabs.online runs org-admin-api with commit `87026db` (release v0.1.6+) and does not override `PASSWORD_MIN_LENGTH` above 6. Check: sign up with a fresh email and a non-common 6–11 character password (e.g. `tudo7x`). The account should be created, with no `too_short` error. Deploy TuDo only after this passes.
- Same check on reset password (forgot password → link → a 6-character new password succeeds).
- At 390px and in dark mode, the sign-up hint reads "Ít nhất 6 ký tự."

### Nits (do not block)
- Ticket table still shows `Attempts | 0`. The orchestrator updates it.

### Follow-ups (out of scope)
- None.
