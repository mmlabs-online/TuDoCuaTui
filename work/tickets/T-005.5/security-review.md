# Security review — T-005.5

## Attempt 1 (2026-11-11) — security-ai-generated-code-auditor

No 🔴. Three 🟡, several 🟢. Static read-only; no .env / secrets read.

Sound: loopback on 127.0.0.1, one request, `done()` cleanup (`scripts/drive-connect.mjs:175,181`); PKCE S256 + constant-time state (`:80-84,147-149`); no secret in the auth URL (`:89-103`); OAuth error printed only if `^[a-z_]+$` (`:160,217`); output limited to URL/email/folder id/path/gh command, other errors "unexpected failure" (`:369`); secrets file via `wx` 0o600 temp + chmod + rename (`:273-302`); git-tree refusal before network and at write time, `realpathSync` on nearest ancestor (`:116,282,323`). Workflow envfile (`deploy-tudocuatui.yml:91-145`): secrets only via step `env:`, no `${{` in run blocks (static test), no `set -x`, names not values in errors, umask/mktemp/trap/chmod/atomic mv, all-or-none + charset before any write (old file byte-identical on failure), classes exclude newline `=` `"` `$` space `#`; `cmp` missing file → changed=true. `--force-recreate` touches only `tudocuatui` (no depends_on; migrate profile-gated). PR workflows run on ubuntu-latest, not the Mac runner. Fixtures obviously fake.

### 🟡 Should fix
1. **Runbook has no leaked-secret path** — `work/ming-todo.md:182-188`. Add "If a secret leaked": Google Account → Security → Third-party connections → remove TuDoCuaTui (revokes the refresh token); reset the client secret (or delete the client) in the Cloud console; then steps 1 (Credentials), 4, 5, 6 and dispatch. In "Turn off": deleting the GitHub secrets does not revoke the token — revoke at Google too when turning photos off for good.
2. **`changed` lost if a run fails after envfile** — `deploy-tudocuatui.yml:142-145,185-191`: new env written, pull/backup/migrate fails, next dispatch sees an identical file → no `--force-recreate`. Compose probably recreates on env change anyway (medium confidence). Fix: always `--force-recreate` on `workflow_dispatch`, or document that `drive configured` in the logs (M-15 step 7) is the real check; README currently promises "a changed env file recreates the app".
3. **No symlink cases in git-tree tests** — `scripts/drive-connect.test.ts:282-293`. Add (skipped on win32): `--out` under a dir symlinked into a git tree → refused; `--out` that is a symlink to a file inside a repo → refused.

### 🟢 Notes
- If the setup PR merges before the environment exists, GitHub auto-creates it without a branch rule; the job's `if: github.ref == 'refs/heads/main'` (`:48`) still protects it; M-15 step 2 creates it first.
- Anyone who can merge to deployment `main` could read environment secrets; Mac-runner jobs share the user that can read the env file (same model as stoktok).
- Script writes the file / may create a folder before Ming checks "Signed in as" (`:353-357`); optional y/N confirm.
- Recovery's "the id does not change" (`ming-todo.md:185`) relies on the same Cloud project; record the folder id and compare on recovery.
- Do step 6 (delete client JSON) right away (Time Machine/iCloud).
- No timeout on Google API fetches after the callback (usability).
- `--out` pointing at a directory fails late with "unexpected failure" (cosmetic).

Open: always `--force-recreate` on `workflow_dispatch`? Is a re-created OAuth client always in Ricotdin's project?

## Attempt 2 (2026-11-11) — security-ai-generated-code-auditor (commit f1554b8)

No 🔴, no 🟡. All three attempt-1 🟡 and follow-ups 1–5 fixed. Static, read-only.

- Leaked-secret path `work/ming-todo.md:196-199` (revoke at Google, reset client secret, redo steps 4–6 + dispatch, delete copies); turn-off revocation note `:194-195`; Recovery "In production" reminder `:187-188`.
- No `~`, absolute macOS/Windows paths; only the file path on argv; hidden-prompt fallback `:166-173`; "Never print the env file" `:179`.
- `--force-recreate` on dispatch `deploy-tudocuatui.yml:184-193`: `github.event_name` and `changed` via step `env:` (`EVENT`, `CHANGED`), quoted comparisons, bash-3.2-safe array expansion, only `tudocuatui` recreated; no new injection surface.
- Static test `scripts/deploy-envfile.test.ts:213-236` (deploy in the no-`${{` list, exact env mappings/condition, `secrets.` still exactly 4).
- README `:36-37,46` and workflow header `:23-24` match.
- Symlink tests `scripts/drive-connect.test.ts:295-308,337-355` (skipped on win32; nothing written; existing file untouched).

### 🟢 Notes
- `ming-todo.md:189-190` wording could say "a manual run always recreates the app".
- Every dispatch restarts the app (few seconds; fine).
- Leak path (d): one line that history rewrite is optional once (a)+(b) are done.
- Attempt-1 notes still open by design: same-Cloud-project folder assumption, no y/N confirm, no fetch timeouts.
