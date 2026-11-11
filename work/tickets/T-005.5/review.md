## Attempt 1 — 2026-11-11
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0 (now also checks `scripts/drive-connect.mjs` and `scripts/*.test.ts`).
- format:check: "All matched files use the correct format." (174 files).
- test: `pnpm test` 706 passed, 42 skipped (DB tests, no DB). `CI=true pnpm test:coverage` against a throwaway local PostgreSQL 16 (port 54329, data dir under /tmp, scram password auth; stopped and deleted afterwards): 64 files, 748/748 passed, no threshold errors, all files 95.72 % stmts / 94.99 % branches. `scripts/` alone: 2 files, 36 tests passed. These match impl-log.md.
- build: `vite build` exit 0.
- Live deployment repo (`git -C /home/user/deployment fetch origin main`, HEAD 783aed6 = #40): `.github/workflows/deploy-tudocuatui.yml` and `apps/tudocuatui/compose.yml` are **byte-identical** to the pre-T-005.5 drafts on TuDo `origin/main`. Live vs new draft workflow differs only in the header comment, `environment:`, the `envfile` step and the `deploy` step (plan AC 2c iii).

### Acceptance criteria
- [x] Connect script never prints/logs the refresh token or client secret — evidence: only fixed messages, allowlisted OAuth `error` codes (`scripts/drive-connect.mjs:160,217`), and `"error: unexpected failure"` for non-`ConnectError` (`:369`); outputs limited to URL/email/folder id/path/gh command (`:329-366`). Test `drive-connect.test.ts:369` (10 failure paths + success, `expectNoSecrets`). Reviewer run: CLI to the point of printing the auth URL — URL has `client_id`, `redirect_uri=http://127.0.0.1:<port>/`, `scope=…/drive.file`, `access_type=offline`, `prompt=consent`, `code_challenge_method=S256`, `state`; the fake client secret appears 0 times in output.
- [x] Refuses to write inside a git work tree — evidence: check before any network (`:323-325`) and again at write (`:282-284`). Reviewer CLI runs (no network), all `error: refusing to write the secrets file inside a git work tree`, exit 2, nothing created: `--out <repo>/x.env`; `--out <repo>/a/b/c.env` (non-existent nested); `.git` *file* (worktree style); directory symlinked into the repo (realpath); default path with a `HOME` that is itself a git repo. Also: `--help`/no args → usage, exit 2; "web" client JSON and broken JSON → fixed messages, exit 2, no value echoed. Tests `drive-connect.test.ts:283,315,474`.
- [x] Workflow writes Drive values only when all four are set — evidence: `deploy-tudocuatui.yml:108-116,137-140`. Reviewer extracted the real `envfile` `run:` block and ran it with `bash --noprofile --norc -eo pipefail` (fake password, temp HOME): none → only `DATABASE_URL=…` (same printf line as live), `changed=true` then `changed=false`; all four → 5 lines, unprefixed, file 600 / dir 700, `changed=true` then `false`; 3-of-4 and 1-of-4 → exit 1, error names only the missing `TUDOCUATUI_*`; back to none → `DATABASE_URL` only, `changed=true` (turn-off path works). Tests `deploy-envfile.test.ts:98,110,128`.
- [x] Rejects bad characters — evidence: `deploy-tudocuatui.yml:117-130`. Reviewer runs: newline injection (`…\nTUDO_ACCESS_DISABLED=1`), trailing newline, whitespace-only, `$`, `*`, non-ASCII, folder id 9 and 201 chars → exit 1, error names only the secret, no value printed; env file sha256 unchanged after all failures; no `.env.*` temp left. Tests `deploy-envfile.test.ts:147,169`.
- [x] Stays compatible with the live release — evidence: live == pre-change draft (above); zero-secret output identical to the live step's bytes and `changed=false` on re-run, so no `--force-recreate` (`:142,188-191`); static tests `deploy-envfile.test.ts:194,199,213,227`. Live merge run remains Ming's post-merge check.
- [x] M-15 lists the exact steps, including recovery — evidence: `work/ming-todo.md:148-188` is the plan text verbatim (diffed). Order: OAuth client In production, Desktop app (`:150-153`) → environment restricted to `main` before the setup PR (`:154-156`) → setup PR, zero-secret run (`:157-159`) → script (`:160-164`) → `gh secret set -f` + list + per-secret fallback (`:165-170`) → delete file + client JSON (`:171-172`) → deploy, with A10 release path when the live release predates T-005.1 (`:173-176`, `release/vX.Y.Z` matches `release.yml`) → smoke (`:177-180`) → Recovery (`:182-185`) → Turn off (`:186-188`). Script commands work in PowerShell (no `<` redirection, the printed `gh` command uses a quoted absolute path, `drive-connect.mjs:364`); see Issue 1 for the literal example.

### Issues
#### Issue 1 — 🟡 should-fix — runbook (Windows)
- **Where**: `work/ming-todo.md:166`
- **Expected**: a command Ming can paste on Windows PowerShell 5.1 / cmd.
- **Actual**: the literal example `gh secret set -f ~/.config/tudocuatui/drive-secrets.env …` passes `~` unexpanded to `gh` on Windows PowerShell 5.1 and cmd, so it fails with "file not found". The script's own printed command (absolute, quoted) is correct, and the step says "run the command the script printed", so this does no harm. It is only misleading.
- **Fix instruction**: change it to "run the command the script printed (it has the full path, e.g. `gh secret set -f "<path>" --env tudocuatui -R mmlabs-online/deployment`)". Ming approved the text verbatim, so do this in the follow-up or with Ming's OK.

#### Issue 2 — 🟡 should-fix — runbook (recovery completeness)
- **Where**: `work/ming-todo.md:182-185`
- **Expected**: each listed cause has its fix.
- **Actual**: "consent screen back in Testing" is listed as a cause, but the recovery steps never say to set Publishing status back to **In production**, so the new token would die again after 7 days. There is also no leaked-secret path: revoke at Google Account → Third-party connections, then reset the client secret (security-review 🟡 1). "Turn off" also does not revoke the token at Google.
- **Fix instruction**: in Recovery add "if the consent screen is in Testing, set it back to In production (step 1)". Add one line "Secret leaked: remove TuDoCuaTui under Google Account → Security → Third-party connections, reset the client secret, then Recovery". Same Ming-approved-text caveat as Issue 1.

### Rules R1–R10 (CLAUDE.md)
No violations found. R3: secrets are only in step `env:` (no `${{` in any `run:`, static test), the host env file (600/700) and the local mode-600 file outside git; `scripts/` is in `.dockerignore:12`, so the script never ships; no `VITE_*`. R7: every changed file is in the plan's file list. The `ming-todo.md` approval line and the `ticket.md` edits are orchestrator bookkeeping; `security-review.md` is the auditor's. R8: tests for the script (coverage threshold added, `vitest.config.ts`) and for the real workflow block. R10: no Figma files touched. R1, R2, R4–R6, R9: not applicable (no data layer, schema or UI).

### Nits (do not block)
- `deploy-envfile.test.ts:74` runs the block with `bash -e`; Actions uses `bash --noprofile --norc -eo pipefail`. The block has no pipes, so the result is the same (I verified with the Actions flags).
- `--force-recreate` depends on `changed` from the same run (`deploy-tudocuatui.yml:142,190`). If pull/backup/migrate fails after the env file was rewritten, the next run sees an identical file. Compose v2 very likely recreates anyway, because `env_file` contents are part of the service config hash, and M-15 step 7 checks `drive configured`. Worth noting in the README (security-review 🟡 2).
- `drive-connect.mjs:374`: the entry-point check compares `import.meta.url` with `argv[1]`. If the script is run through a symlinked path it silently does nothing. The runbook runs it directly, so this is fine.
- `--out` pointing at an existing directory fails late with "unexpected failure", after the sign-in.

### Follow-ups (out of scope)
- Runbook edits from Issues 1–2 (needs Ming's OK, because the M-15 text was approved verbatim).
- Optional y/N confirm after "Signed in as" before creating the folder/writing the file. Timeouts on the Google API fetches after the callback.
- Symlink cases in `isInsideGitWorkTree` tests (security-review 🟡 3; the behaviour is correct, as verified manually above).
- Splitting the env file so `migrate` does not see the Drive values (plan A11).

### Follow-ups to fix (Ming, 2026-11-11: "Sửa hết rồi mở PR")
From review attempt 1 and security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request; Ming approves the M-15 wording changes):
1. M-15 (`work/ming-todo.md:182-188`): add "If a secret leaked" — Google Account → Security → Third-party connections → remove TuDoCuaTui (revokes the refresh token); reset the client secret (or delete the client) in the Cloud console; then redo Credentials, connect script, `gh secret set`, delete files, dispatch. In "Turn off": deleting the GitHub secrets does not revoke the token — revoke at Google too when turning photos off for good.
2. M-15 Recovery (`:182-185`): when the cause is the consent screen back in "Testing", set it to "In production" again before reconnecting (otherwise the new token dies in 7 days).
3. M-15 example command (`:166`): don't rely on `~` (PowerShell/cmd pass it unexpanded) — use the absolute path the script prints, or show both a macOS and a Windows example.
4. Workflow draft (`deploy-tudocuatui.yml:142-145,185-191`): always add `--force-recreate` on `workflow_dispatch` (in addition to `changed == true`), so a dispatch after a failed run still applies new secrets; keep the README statement accurate; extend `scripts/deploy-envfile.test.ts` static checks accordingly.
5. `scripts/drive-connect.test.ts` (`:282-293`): add symlink cases, skipped on win32 — `--out` under a directory symlinked into a git tree → refused; `--out` that is a symlink to a file inside a repo → refused.
