# BUG-010: Chrome autofills the saved account password into the AI "API key" field

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S1 |
| Priority | P0 |
| Size | XS |
| Areas | ui, security |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.2.6 (T-010, commit 0438350) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | — |

## Report
Found during the UAT of production v0.3.1 that Ming asked for (2026-11-20, report
`work/uat/2026-11-20-uat-v0.3.1.md`, UAT-1). The tester typed nothing, yet on open the AI settings modal showed
the "API key" field filled and the error "Key không đúng định dạng (20–256 ký tự, không có khoảng trắng)".
In the DOM, `input.matches(':autofill')` was `true`: Chrome's password manager had put the saved login password for
`tudocuatui.mmlabs.online` into the field. The value was not read. Only its length band (< 20) was checked.

## Environment
- Production v0.3.1, Chrome (Edge profile) on Windows 11, desktop, with a saved password for the site.

## Steps to reproduce
1. Sign in with email and password and let Chrome save the password.
2. Click the "AI" button (Cài đặt) in the top bar.

## Expected
- The API key field is empty. The hint "Đã lưu: ••••XXXX. Để trống nếu giữ key cũ." stays true.
- The browser does not fill or offer the account password in this field.

## Actual
- The field holds the autofilled account password and shows a format error straight away.
- Here the password is under 20 characters, so validation blocks saving. A password of 20 or more characters with no
  spaces would pass validation. "Lưu" would then store the account password as the AI key, replacing the real key, and
  send it to Claude/Gemini as an API key. That leaks the credential to a third party.

## Root cause
**Confirmed** (reproduced in production): `src/features/settings/AiSettingsModal.tsx:164-165` renders
`<input type="password" autoComplete="off">`. Chrome ignores `autocomplete="off"` on password inputs and autofills the
saved login.

## Scope
- Stop the password manager from treating the API key input as the login password, e.g. `autoComplete="new-password"`
  plus a distinct `name` such as `ai-api-key`, or a text input with CSS masking.
- Optional hardening inside the same file: do not treat an untouched autofilled value as a new key.

## Out of scope
- The server-side key storage and the key test endpoint.
- Other password inputs (sign-in, sign-up, reset), which are correct as login fields.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `AiSettingsModal.test.tsx` › "API key input is not a login password field" asserting
      `autocomplete="new-password"` and a non-login `name`).
- [ ] With a saved site password in Chrome, opening the modal leaves the key field empty and shows no error
      (one-off Playwright or manual check recorded in impl-log: jsdom cannot see autofill).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/settings/AiSettingsModal.tsx`, its test.
- Test level: unit (jsdom) for the attributes, plus a one-off browser check in impl-log.

## Notes / answers from Ming

## Handoff
