# Security review — F-602.2

## Attempt 1 — 2026-11-17

**Verdict: PASS from security, with 2 🟡 non-blocking items.** No secret or token can reach the backup file or any log. The bearer handling hasn't changed. All untrusted text is rendered as React text, so there is no XSS path. Pre-checks run before the file is read.

Branch check: `.git/HEAD` points to `refs/heads/ticket/F-602.2`.

### Findings

**🟡 1. A crafted `exportedAt` value crashes the whole app (only the user's own browser, fixed by reloading).**
- `src/features/import-export/ImportJsonTab.tsx:13,76` calls `dmy(checked.backup.exportedAt)`, which calls `toLocalDate` (`src/lib/dates.ts:13-17`). That code turns the value into a string with no type check.
- `precheckBackup` (`src/data/backup.ts:108`) casts the parsed JSON to `Backup` without checking `exportedAt`. A file containing `"exportedAt": {"toString": 0}` makes that string conversion throw a TypeError during render.
- There is no ErrorBoundary anywhere in `src/`, so the whole SPA goes blank until reload. Nothing is sent to the server and no data is touched.
- How it happens: someone hands Ming a "backup" file, or a file gets corrupted.
- Fix (one line): in `ImportJsonTab.tsx:76`, guard it, e.g. `typeof checked.backup.exportedAt === "string" ? dmy(...) : ""`. Or normalise `exportedAt` to a string inside `precheckBackup`, which is better because the guard then lives in pure, tested code (R8). This is a tiny in-scope fix. Rule: untrusted input stays data.

**🟡 2. The pretty-printed export can be larger than the client's own 8 MiB pre-check, even though the server would accept the data (availability, related to N8).**
- `src/features/import-export/download.ts:18` writes the file with `JSON.stringify(backup, null, 2)`.
- `precheckBackupSize(f.size)` (`useJsonRestore.ts:79`) and `precheckBackup` (`backup.ts:90`) measure the bytes of that pretty text. But `repo.http.ts:41` sends the parsed object re-serialised in compact form.
- Rough sizes: one pretty wear log is about 150 bytes, against about 90 compact. At the 50,000 wear-log cap that is about 7.5 MB for wear logs alone, plus about 2 MB of items. So an account near the caps exports a file the client rejects as too large, while the compact body would fit.
- The plan's assumption at `plan.md:233` ("never larger than the pre-checked input") holds in the opposite direction, so the server cap is safe. The user-facing check is just stricter than it needs to be.
- Fix (either one): (a) allow a larger raw file (e.g. 16 MiB) and apply the 8 MiB cap to the compact re-serialised size; (b) export compact JSON, which loses the readable diff the plan wanted.
- Not a security bug. It belongs on the follow-ups list (R7) unless the reviewer wants it fixed now.

**🟢 3. No secrets in the backup file.** The server builds every exported field explicitly (`server/backup.js:84-118`): no `user_id`, no tokens, no photo URLs. `downloadBackup` saves the server response unchanged. `photo_id` is not a capability, because photos load through the authed fetch with a Bearer header (`src/data/useWardrobe.test.tsx:378`). There is no `console.*` in any non-test file under `src/`.

**🟢 4. Bearer handling is unchanged.** `exportAll` and `restore` (`src/data/repo.http.ts:116-122`) only use the existing `call()`: same-origin path guard (`authFetch.ts:13,41`), `credentials: "same-origin"`, `redirect: "manual"`, `cache: "no-store"`. A 401 retry resends the restore POST, which is safe because restore is idempotent (D49). No new `fetch` was added, so R1 holds.

**🟢 5. No XSS from file or server content.** Everything is rendered as JSX text nodes (file name `ImportJsonTab.tsx:47`, counts, error `<p>` `:69`, summary). Summary lines only use fixed keys (`backup.ts:124-140`, `ImportJsonTab.tsx:102`). `describeBackupField` (`apiErrors.ts:116-122`) can echo a field path from the user's own file, still as a text node and only for known reasons (`apiErrors.ts:136`). No `dangerouslySetInnerHTML` in any `.tsx`. A `__proto__` key from `JSON.parse` is an ordinary property; nothing spreads or merges it.

**🟢 6. Error messages don't leak server internals.** `restoreErrorMessage` (`apiErrors.ts:125-137`) maps codes and reasons to fixed Vietnamese text; `internal` shows only the `requestId`; non-`ApiError` becomes the generic text. Export errors go through `wardrobe.message(e)` (`App.tsx:287`).

**🟢 7. Large files on phones.** `File.size` is checked before reading (`useJsonRestore.ts:79-84`); the file text never goes into the textarea. Peak memory ≈ 8 MiB text + `TextEncoder` buffer (`backup.ts:90`) + parsed object + one compact stringify. Pasted text has no limit until "Kiểm tra" runs; acceptable since the user pastes it.

**🟢 8. Object URL cleanup.** `download.ts:24-31` revokes the URL right after `click()`, same as CSV export. On older Safari/Firefox immediate revoke can occasionally cancel a large download; iOS is in Ming's phone check.

**🟢 9. Concurrent requests.** Export guarded by `exportingRef` + `busy` (`App.tsx:280-291`, `ExportModal.tsx:30,38`). Restore sets phase "running" and disables the button; the server allows one restore in flight (`restore_busy`). Restore is not aborted on unmount, as planned (`useJsonRestore.ts:109,114`).

### Recommendations
- Fix 🟡1 in this ticket with a test in `backup.test.ts` (a non-string `exportedAt` must not throw).
- Log 🟡2 as a follow-up or `debt` issue, linked to N8 and AC1.

### Risks
- No ErrorBoundary in the app: any render-time throw blanks the whole SPA. General gap outside this ticket; candidate `debt` issue.

### Open questions
- Should the export stay pretty-printed, given 🟡2?
