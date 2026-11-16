# Security review — T-023

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-16

No 🔴 findings. Read-only (tests not run by the auditor).

### Findings
- 🟡 1. Deploy order, not a vulnerability: if production org-admin-api predates 87026db or sets `PASSWORD_MIN_LENGTH` > 6, the server still rejects 6–11 char passwords (stricter, safe); only UX confusion (server `too_short` message "Mật khẩu cần ít nhất 6 ký tự." for a 6+ char password). Covered by the plan's *Ming verification after merge*; keep it before deploy. (The local org-admin-api checkout is on an old branch showing `default=12, ge=8` at `app/core/config.py:98`; origin/main 87026db has `default=6, ge=6`, verified by the orchestrator.)
- 🟡 2. Context (D43, accepted): 6 is a weak minimum; the server's common-password list holds 8+ char entries only (`org-admin-api app/modules/auth/passwords.py:28`). Server-side mitigations remain (Argon2id, per-email backoff, per-IP limit, Turnstile).

### Confirmed
- Server enforces its own minimum (`PasswordPolicy`, NFKC, `passwords.py:21-23, 33-42`; `min_length` from settings, `deps.py:29`); client `PASSWORD_MIN` does not affect server acceptance.
- `PASSWORD_MAX = 128` unchanged (`validation.ts:6`); `passwordError` (`:32-37`) still NFKC code points, no trim, max before min; `confirmError` NFKC compare (`:47-49`). Only logic change: `validation.ts:4`.
- Sign-in unchanged (`signInPasswordError`, `validateSignIn`, `:40-44, 63-68`). Reset uses the same policy (`validateNewPassword`, `:79-84`).
- Copy at `copy.ts:46, 76, 103` says 6; `copy.test.ts:7-14` guards drift; no "12 ký tự" in `src/`.
- No password logging, no env/`VITE_*` changes (R3).
