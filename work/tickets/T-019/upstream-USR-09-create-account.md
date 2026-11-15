# USR-09: Create a staff-vouched account from the CLI (bootstrap for TuDo)

> Draft written in TuDoCuaTui for org-admin-api (Ming, 2026-11-15: "chọn B. Xin org-admin-api thêm lệnh CLI tạo tài khoản cho staff"). File it in `mmlabs-online/org-admin-api` `work/tickets/USR-09/ticket.md` with a backlog row; the ID is the next free USR number at the time of writing.

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | auth, security, db |
| Attempts | 0 |
| Created | 2026-11-15 |
| PR | — |

## Goal
An operator can create one verified account from the command line, so that the first user of a new app can exist before any app that hosts sign-up is live. First consumer: TuDoCuaTui. Its next release cannot start without the owner's `sub` (`TUDO_OWNER_SUB`, needed by its ownership migration). Its sign-up page only ships in that release. No other registered app runs sign-up in production yet.

## Spec reference
`docs/spec-v1.md` §5.8 (users, passwords); `docs/deploy.md` "Bootstrap the first super-admin" (USR-02f CLI pattern); `docs/identity-architecture.md` D16 (verified email before any token), D19 (origins).

## Scope (proposal; owner decides)
- **New subcommand.** `python -m app.cli create-account --email <e> [--join <app_key>]`.
- **Password.**
  - Read twice from the TTY with `getpass` and checked against the sign-up password policy.
  - Never taken from argv, env or a workflow input.
  - Refuse when stdin is not a TTY.
  - Consequence: the command runs from a shell on the Mac (the `migrate` one-shot service, like the `grant-super-admin` fallback), not from the `ops-org-admin-api` workflow.
- **Email verification.** The account is created with `email_verified = true`. The operator vouches for the address. This is the one deliberate exception to "the CLI never marks an email verified", and it is recorded in an ADR.
  - Alternative the owner may prefer: create it unverified and send the normal verification email. That only works once some app origin hosts `/verify-email`, so it does not solve the bootstrap.
- **Existing email.** If the email already exists, exit 1 with a fixed message. Never change an existing account's password or verification state; that prevents account takeover.
- **`--join <app_key>`.** Assigns the app's default member role, the same as the join endpoint. The app must exist and allow joining, or the role is assigned at app scope like a staff assignment.
- **Audit.** Write an audit entry with actor `cli`. Never log or print the password.
- **Output.**
  ```
  created account
  user_id: <uuid>
  joined: <app_key>|-
  ```
  The email is masked, as in `grant-super-admin`.
- **Docs.** `docs/deploy.md` gets a section "Create an account from the CLI (bootstrap only)" with the shell command (leading space / `fc -p`, `--rm --no-deps`, never `DB_ECHO`).

## Acceptance criteria
- [ ] It creates a verified user that can log in at once and obtain an app token (after `--join`, a token for that app).
- [ ] An existing email gives exit 1, and nothing about the existing user changes.
- [ ] A weak password is refused with the same rules as sign-up. Non-TTY stdin is refused.
- [ ] The password never appears in output, logs, audit or the process list. Tests check stdout, stderr and the log records.
- [ ] `--join` with an unknown app exits 1 and creates nothing (one transaction).
- [ ] An audit entry is written. The docs are updated. All checks pass.

## Out of scope
- Bulk import, staff-facing HTTP endpoints, setting passwords for existing users (use forgot/reset), org assignment (USR-06).

## Notes
- TuDo flow afterwards (TuDo M-17 → M-18):
  1. M-19: register app `tudocuatui`, origin `https://tudocuatui.mmlabs.online`, join `open`.
  2. Run `create-account --email <Ming> --join tudocuatui` and copy the `user_id`.
  3. Put it in TuDo's compose as `TUDO_OWNER_SUB` (M-18).
  4. Release TuDo, then run M-21.
- Security notes for review: this is a root-equivalent operator action on the DB host, the same trust level as `grant-super-admin`. Pre-registration hijack does not apply, because the operator chooses the password. The verified flag is the main policy decision.
