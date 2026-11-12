
## Attempt 1 — 2026-11-11

### Files touched
| File | Required because |
|---|---|
| `scripts/drive-connect.mjs` (new) | Connect script (scope 1, AC1) |
| `scripts/drive-connect.test.ts` (new) | Unit and in-process end-to-end tests (AC1, R8) |
| `scripts/deploy-envfile.test.ts` (new) | Runs the real `envfile` block in bash plus static YAML checks (AC2, R8) |
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | Environment, four secrets, all-or-none and charset checks, `changed` output, conditional `--force-recreate` (AC2) |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Comment only |
| `deploy/deployment-repo/README.md` | Table row and "Google Drive secrets (T-005.5)" section |
| `work/ming-todo.md` | M-15 replaced verbatim from the plan (AC3) |
| `server/README.md` | One line pointing the Google env vars at the deploy and M-15 |
| `tsconfig.server.json` | `@ts-check` of the script and tests enforced by typecheck |
| `vitest.config.ts` | Coverage include and 80/75 threshold for the script |

### Tests added / changed
- `drive-connect.test.ts`: parseArgs, readClient, pkce, buildAuthUrl, callback server (state, error, timeout, 404, one-shot), findOrCreateFolder, isInsideGitWorkTree, writeSecretsFile (format, modes, atomic, git tree, charset, temp cleanup), full run against fake Google, redaction on 10 failure paths, CLI exit codes, default output path.
- `deploy-envfile.test.ts`: none / all four / all 14 partial subsets / bad characters per value / suffix and length rules / bad password file, run against the real block; static checks (environment, exactly 4 secrets, no `${{` in run blocks, `--force-recreate` only from `changed`).

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test: `pnpm test` 60 files passed, 4 skipped (DB tests, no DB); 706 passed, 42 skipped. `CI=true pnpm test:coverage` with local PostgreSQL 16 (stopped and deleted afterwards): 64 files, 748 tests passed; coverage thresholds met (all files 95.72% stmts / 94.99% branches).
- build: `vite build` ok.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The script does not check the git work tree on `--client-file`; the client JSON may live in a repo (Ming deletes it in M-15 step 6).
- Windows file mode is not enforced; the script prints a warning.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about 1000 lines including tests (script ~330, tests ~700), plus about 110 changed lines in existing files.

## Attempt 2 (REWORK: "Follow-ups to fix" 1-5 in review.md; Ming approved the M-15 wording changes)

### Files touched
- `work/ming-todo.md` (M-15): item 1 "If a secret leaked" paragraph; "Turn off" note that deleting secrets does not revoke the token (revoke at Google); item 2 Recovery reminder to set the consent screen to "In production" again; item 3 no `~` (steps 4-6 use the printed full path, Mac and Windows examples). Required because: follow-ups 1-3.
- `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`: `deploy` step gets `EVENT: ${{ github.event_name }}` and adds `--force-recreate` when `CHANGED=true` or on `workflow_dispatch`; header comment adjusted. Required because: follow-up 4.
- `deploy/deployment-repo/README.md`: "a manual run always recreates the app". Required because: README accuracy (follow-up 4).
- `scripts/deploy-envfile.test.ts`: static check updated for the new condition and `EVENT` env. Required because: follow-up 4.
- `scripts/drive-connect.test.ts`: two symlink tests (skipped on win32): dir symlink into a git tree and file symlink into a repo, for `isInsideGitWorkTree` and `writeSecretsFile` (refused, nothing written, target file untouched). Required because: follow-up 5.

### Checks (local PostgreSQL 16 for TEST_DATABASE_URL, stopped and deleted afterwards)
- pnpm typecheck: green. pnpm format:check: all matched files use the correct format.
- pnpm test: 64 files passed, 750 tests passed. CI=true pnpm test:coverage: 64 files, 750 tests passed, thresholds met. pnpm build: built.

### Out-of-plan files
None. Follow-ups: none new.
### Scope self-check
Only the five listed items. No script or server code changed.
