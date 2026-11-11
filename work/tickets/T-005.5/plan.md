Status: READY

# Plan — T-005.5: Drive connect script and deploy secrets for TuDo photos

Gate: **plan-approval** (High tier: production deploy config and secrets). Ming confirms or changes A1–A14 below.
Second slice of T-005.1. The design was approved there: T-005.1 assumptions A1, A2, A3, A6 and A14 (Ming, 2026-11-11:
"A1–A17 as written (… GitHub environment secrets, Mac+Windows connect script)"). This plan only adds the details.

## Feature summary
- D27 (work/decisions.md, 2026-11-11): "Item photos are stored in Ming's Google Drive folder `TuDoCuaTui/` (Ricotdin's
  Google Cloud project and account, OAuth client "TuDoCuaTui", scope `drive.file` …) and handled only by the TuDo Node
  server: OAuth refresh token and client secret in the server's runtime env only (R3)".
- Ticket goal: "Ming can connect Google Drive once and the deploy puts the four Drive values into the server's env file
  without them ever touching the TuDo repo or the image."
- T-005.1 plan, A2 (approved): "GitHub environment `tudocuatui` in `mmlabs-online/deployment`, restricted to `main` (Ming
  creates it first). Secrets `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`,
  `TUDOCUATUI_GOOGLE_REFRESH_TOKEN` and `TUDOCUATUI_DRIVE_FOLDER_ID`. `deploy-tudocuatui`'s existing `envfile` step writes
  them into `/Users/mingming/.config/tudocuatui/tudocuatui.env` next to `DATABASE_URL`, unprefixed".
- T-005.1 A1 (approved): the connect script finds or creates the `TuDoCuaTui` folder (with `drive.file`, a folder made by
  hand is invisible to the app). A6 (approved): the script runs on macOS and Windows, plain Node 22, no dependencies.
- Runtime contract (server/README.md, T-005.1): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
  `DRIVE_FOLDER_ID`; "all-or-nothing … a partial or malformed set exits 2"; smoke
  `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js`.
- Deployment repo README, "Secrets": "App secrets that aren't Postgres stay … `/Users/mingming/.config/<app>/<app>.env`,
  written by each app's deploy workflow from its GitHub environment secrets (see `deploy-stoktok.yml`)."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1a | "The connect script never prints or logs the refresh token or client secret" | `scripts/drive-connect.test.ts › full run against a fake Google: stdout and stderr contain none of the fake client secret, refresh token, access token or auth code`, and the same check on every failure path (`token error`, `no refresh_token`, `wrong state`, `folder create fails`). Reviewer reads the script: no `console.*` takes a token response, the client JSON or an error object. Only fixed messages and allowlisted OAuth `error` codes are printed. |
| 1b | "it refuses to write inside a git work tree" | `drive-connect.test.ts › isInsideGitWorkTree: .git dir → true; .git file (worktree/submodule) → true; plain temp dir → false` and `› writeSecretsFile: --out inside a git tree → throws, nothing written`. CLI test: `--out <repo>/x.env` exits 2 before any network call. |
| 1c | Scope details: loopback + PKCE + state, `access_type=offline`, `prompt=consent`, scope `drive.file`, shows the account, find-or-create folder, mode-600 file, prints path + folder id + `gh secret set … --env tudocuatui -R mmlabs-online/deployment` | `drive-connect.test.ts` cases listed under *Tests* (auth URL params, S256 challenge, state mismatch, 127.0.0.1 bind, 5-minute timeout injected short, folder found → no create, folder absent → one create, mode 600 on POSIX, printed command text). |
| 2a | "The workflow draft writes the Drive values only when all four are set" | `scripts/deploy-envfile.test.ts` runs the **real** `envfile` `run:` block, extracted from the draft YAML, in bash with a temp `HOME`/`ENV_FILE`/fake password file: none set → only the `DATABASE_URL` line; all four → 5 lines with unprefixed names; each 1-, 2- and 3-of-4 combination → exit 1, the error names the missing secrets, the old file is byte-identical, no temp file is left. |
| 2b | "rejects bad characters" | Same test file: a newline (`…\nTUDO_ACCESS_DISABLED=1`), space, `"`, `$`, `=` and `#` in each value → exit 1, file unchanged, and the value does not appear in stdout/stderr. Client id without `.apps.googleusercontent.com` and a folder id outside `^[A-Za-z0-9_-]{10,200}$` → exit 1 (mirrors `loadDriveConfig`, so a value the server would refuse never reaches it). |
| 2c | "stays compatible with the live release" | (i) `deploy-envfile.test.ts › no Drive secrets: output is byte-identical to the current live envfile step` (the expected line is the `printf 'DATABASE_URL=…'` format of the live workflow) and `changed=false` on a second run, so the deploy step adds no `--force-recreate`. (ii) Static checks in the same file: job `deploy` has `environment: tudocuatui`; the `envfile` step `env:` maps exactly the four `secrets.TUDOCUATUI_*`; no `run:` block contains `${{`; the `deploy` step adds `--force-recreate` only when `steps.envfile.outputs.changed == 'true'`; all other steps are unchanged. (iii) Reviewer diffs the draft against the live `deploy-tudocuatui.yml` (same as the pre-change draft): only the header comment, `environment:`, the `envfile` step and the `deploy` step differ. (iv) After merge: the setup-PR merge run (see *Ming verification*). |
| 3 | "M-15 lists the exact steps, including recovery" | `work/ming-todo.md` M-15 contains numbered steps in this order: OAuth client "In production" (Desktop app) → environment `tudocuatui` restricted to `main` → setup PR merged and a zero-secret run → connect script → `gh secret set` → delete the secrets file and the client JSON → deploy (dispatch, or a release if the live image predates T-005.1) → smoke → **Recovery** (token dead / secret reset) → **Turn off** (delete the four secrets + dispatch). |
| — | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green; CI `image` job unchanged and green. |

## Ming verification after merge
- The setup PR on `mmlabs-online/deployment` (below) is merged by Ming after the environment exists. The merge triggers
  one `deploy-tudocuatui` run with **no** Drive secrets: expect `deployed`, the run page shows environment
  `tudocuatui`, and the container is not recreated (`envfile` reports `changed=false`).
- M-15 with real Google credentials: `drive-smoke.js` exits 0 and the server log shows `drive configured`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `scripts/drive-connect.mjs` (new) | The connect script (Approach §1). Exports pure helpers plus `run({argv, fetch, out, err, endpoints, timeoutMs, homedir})`; CLI only when it is the entry point. | Scope item 1 / AC1 |
| `scripts/drive-connect.test.ts` (new) | Unit tests plus an in-process end-to-end run against an injected fake `fetch` (Google token, about, files). | AC1, R8 |
| `scripts/deploy-envfile.test.ts` (new) | Extracts the `envfile` `run:` block from the draft workflow and runs it in bash; static YAML assertions. Skipped on win32 or without bash. | AC2, R8 (no CI workflow change needed: `pnpm test` picks it up) |
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | Header comment; job `environment: tudocuatui`; `envfile` step gets the four secrets via step `env:`, the all-or-none check, per-value validation, writes them after `DATABASE_URL`, outputs `changed`; `deploy` step adds `--force-recreate` when changed. | Scope item 2 / AC2 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Comments only: the env file now also holds the four Drive values from environment `tudocuatui`; `migrate` shares the env file but is only on `db` (no egress). No YAML change. | Scope item 2 ("compose comment") |
| `deploy/deployment-repo/README.md` | Table row for the workflow change (setup PR, after the environment exists); new "Google Drive secrets (T-005.5)" section: environment, names, all-or-none, rotation = `gh secret set` + dispatch, link to M-15. Replace "After a password rotation…" sentence only where it now also covers Drive. | Scope item 2 ("Deployment README") |
| `work/ming-todo.md` | Replace M-15 with the full runbook (text below). Nothing else. | AC3 |
| `server/README.md` | One line under the env table: in production the four values come from `deploy-tudocuatui` (environment `tudocuatui`), see M-15. | Keeps the runtime contract doc pointing at the source of the values |
| `tsconfig.server.json` | `include` adds `scripts/drive-connect.mjs` and `scripts/*.test.ts`, so `@ts-check` is enforced by `pnpm typecheck`. | `@ts-check` is otherwise not checked by any tsconfig |
| `vitest.config.ts` | Coverage `include` and `thresholds` add `scripts/drive-connect.mjs` (same 80/75 thresholds). | R8, same rule as `server/drive.js` |

Not touched: `server/**` code, `Dockerfile`, `.dockerignore` (`scripts/` is already excluded, so the script never ships),
`scripts/check-image.sh`, `package.json` (no dependency, no new script), `.github/workflows/**` of TuDo,
`AGENTS.md`/`.figma/`/Figma plugins in `vite.config.ts` (R10), `work/backlog.md` (D16).

### Setup PR on the live deployment repo (orchestrator, after this ticket is DONE and merged, and after M-15 step 2)
- Branch `setup/tudocuatui-drive-secrets` in `mmlabs-online/deployment` (must **not** start with `release/`, so
  `pr-scope` does not apply), from a freshly fetched `origin/main`. Same route as deployment#38/#40.
- Before copying, the orchestrator checks that live `origin/main` equals the pre-T-005.5 drafts:
  `.github/workflows/deploy-tudocuatui.yml` byte-identical to the draft as it was before this ticket, and
  `apps/tudocuatui/compose.yml` byte-identical to the pre-change draft (Node compose from #40). If either differs, stop and
  report; never overwrite live changes. Note: the local clone `/home/user/deployment` is stale (its compose is still the
  nginx one, pre-#40; its workflow matches the draft), so `git fetch` first.
- Copy the two files verbatim from TuDo `main`. `git diff --name-only origin/main...HEAD` must show exactly those two.
  Commit `tudocuatui: Drive secrets from environment tudocuatui (T-005.5)`, push, open the PR, link it in the ticket
  Handoff. Never touch `postgres/secrets/`, `release.env` or any other app.
- Ming merges it **only after** the environment `tudocuatui` exists with the `main` branch rule (M-15 step 2). Reason:
  GitHub auto-creates an environment the first time a job references it, with no branch rule. The job's
  `if: github.ref == 'refs/heads/main'` still guards it, but the rule is the intended second layer.
- Because the compose file is under `apps/tudocuatui/`, the merge triggers one deploy run. With no secrets set it takes
  the all-none path: env file unchanged, no recreate, backup + migrate re-run (idempotent), `deployed`. This is the live
  compatibility check (A9).

### M-15 new text (implementer copies it verbatim into `work/ming-todo.md`, replacing the current M-15)
```
- [ ] **M-15 — Connect Google Drive for TuDo photos** (D27; after T-005.1 and T-005.5 are merged). Never paste a
      client secret or token into chat, a ticket, the TuDo repo or a command line.
      1. Google Cloud console, Ricotdin's project: APIs & Services → enable **Google Drive API** (if not on).
         OAuth consent screen → Publishing status **In production** (in "Testing" the token dies after 7 days).
         Credentials → Create credentials → OAuth client ID → type **Desktop app**, name `TuDoCuaTui` →
         Download JSON (`client_secret_….json`).
      2. GitHub → `mmlabs-online/deployment` → Settings → Environments → New environment `tudocuatui`.
         Deployment branches and tags → **Selected branches and tags** → add `main`. No required reviewers, no wait
         timer (release merges deploy unattended). No secrets yet. Do this before step 3.
      3. Merge the setup PR the orchestrator opened (`setup/tudocuatui-drive-secrets`, two files). Its merge runs
         `deploy-tudocuatui` once: expect `deployed`, environment `tudocuatui` on the run page, and the app not
         restarted (no secrets yet, photos stay off).
      4. On your computer (Node 22, Mac or Windows), in an up-to-date TuDo checkout:
         `node scripts/drive-connect.mjs --client-file <path to client_secret_….json>`.
         Open the printed URL, sign in with **Ricotdin's** Google account, allow. Check the printed account email.
         The script finds or creates the `TuDoCuaTui` folder (do not create it by hand), prints its id, and writes
         `~/.config/tudocuatui/drive-secrets.env` (mode 600; outside any git folder).
      5. `gh auth status` (an account with admin on `mmlabs-online/deployment`), then run the command the script
         printed: `gh secret set -f ~/.config/tudocuatui/drive-secrets.env --env tudocuatui -R mmlabs-online/deployment`.
         Check `gh secret list --env tudocuatui -R mmlabs-online/deployment` shows exactly
         `TUDOCUATUI_DRIVE_FOLDER_ID`, `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`,
         `TUDOCUATUI_GOOGLE_REFRESH_TOKEN`. If `gh` rejects `-f` with `--env`, set each one with
         `gh secret set <NAME> --env tudocuatui -R mmlabs-online/deployment` and paste the value at the hidden prompt.
      6. Delete `~/.config/tudocuatui/drive-secrets.env` and the downloaded `client_secret_….json`
         (Windows: also empty the Recycle Bin).
      7. Deploy. Check `https://tudocuatui.mmlabs.online/version.txt`. If that release is older than the first release
         that contains T-005.1, cut one: `git push origin main:release/vX.Y.Z`, then merge its deployment PR. Otherwise:
         Actions → `deploy-tudocuatui` → Run workflow from `main`. Expect `deployed`. On the Mac:
         `docker compose -p tudocuatui logs --tail 20 tudocuatui` shows `drive configured`. Never print the env file.
      8. Smoke, on the Mac in a clone of `mmlabs-online/deployment` on an up-to-date `main`:
         `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js`.
         Expect every step `ok` and exit 0. Exit 2 = not configured (secrets missing, or the image predates T-005.1).
         `FAIL drive_auth` → Recovery. `FAIL drive_folder_not_found` → the folder id is wrong: re-run steps 4–7.
      9. In Ricotdin's Drive: the folder `TuDoCuaTui` exists and holds no `tudo-smoke-…` file.
      Recovery (photos fail with `drive_auth`: token revoked, 6 months unused, consent screen back in Testing, client
      secret reset or client deleted): if the client is gone or its secret was reset, do step 1's Credentials part again.
      Then steps 4, 5 (overwrites all four), 6, then Run workflow `deploy-tudocuatui` from `main` (the changed env file
      restarts the app), then step 8. The script finds the same folder, so the id does not change.
      Turn photos off (or undo a bad deploy): `gh secret delete <NAME> --env tudocuatui -R mmlabs-online/deployment`
      for all four names, then Run workflow from `main`: the env file goes back to `DATABASE_URL` only and the app
      restarts with `drive not configured`. A manual run has no automatic restore, so this is the way back.
```

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `drive-connect.test.ts › parseArgs: --client-file required; unknown flag, missing value → usage error (exit 2)` | CLI contract |
| `drive-connect.test.ts › readClient: "installed" client → {clientId, clientSecret}; "web" client, missing fields, client id without .apps.googleusercontent.com, unreadable JSON → error that names no value` | Desktop client only; no secret in errors |
| `drive-connect.test.ts › pkce: verifier is 43+ base64url chars; challenge = base64url(sha256(verifier))` | PKCE S256 |
| `drive-connect.test.ts › buildAuthUrl: response_type=code, client_id, redirect_uri http://127.0.0.1:<port>/, scope=https://www.googleapis.com/auth/drive.file, access_type=offline, prompt=consent, code_challenge_method=S256, state; no client_secret` | Scope item 1 |
| `drive-connect.test.ts › callback server: binds 127.0.0.1 only; wrong state → rejects; ?error=access_denied → rejects with that code; other paths → 404 and keeps waiting; timeout (injected short) → rejects; closes after one valid callback` | Loopback + state + timeout |
| `drive-connect.test.ts › token exchange: form POST with code, code_verifier, redirect_uri, grant_type=authorization_code; no refresh_token → error, nothing written; scope without drive.file → error` | Offline token, scope check |
| `drive-connect.test.ts › folder: query is the fixed name/mimeType/trashed=false with orderBy=createdTime; found → no create; several found → oldest used + warning with the count; none → one POST creating a folder; returned id not matching ^[A-Za-z0-9_-]{10,200}$ → error` | Find-or-create (T-005.1 A1), A6 here |
| `drive-connect.test.ts › isInsideGitWorkTree: .git dir → true; .git file → true; plain temp dir → false; nonexistent out path checks its nearest existing ancestor` | AC1b |
| `drive-connect.test.ts › writeSecretsFile: exact 4 dotenv lines TUDOCUATUI_GOOGLE_CLIENT_ID=…, …_CLIENT_SECRET, …_REFRESH_TOKEN, TUDOCUATUI_DRIVE_FOLDER_ID, LF endings; mode 600 and parent 700 (skipped on win32); overwrite is atomic (temp + rename); inside a git tree → throws, nothing written` | Scope item 1, AC1b |
| `drive-connect.test.ts › full run (fake fetch): prints auth URL, account email, folder id, file path and the exact gh secret set -f … --env tudocuatui -R mmlabs-online/deployment command; exit 0` | Scope item 1 |
| `drive-connect.test.ts › redaction: on success and on every failure path, captured stdout/stderr contain none of the fake client secret, refresh token, access token or auth code` | AC1a |
| `drive-connect.test.ts › values outside [A-Za-z0-9._/-] from Google (token, secret) → error before writing (the deploy would reject them anyway)` | Fails early, matches A4 |
| `drive-connect.test.ts › CLI: no args exits 2; --out inside this repo exits 2 before any network call` | AC1b |
| `deploy-envfile.test.ts › no Drive secrets: only DATABASE_URL, same bytes as the live step; changed=true first, false on re-run` | AC2a, AC2c |
| `deploy-envfile.test.ts › all four: DATABASE_URL then GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID; file mode 600; changed=true; then changed=false on re-run` | AC2a |
| `deploy-envfile.test.ts › every 1/2/3-of-4 subset → exit 1, error lists the missing TUDOCUATUI_* names, old file unchanged, no .env.* temp left` | All-or-none |
| `deploy-envfile.test.ts › bad characters in each value (newline injection, space, ", $, =, #) → exit 1, file unchanged, value not in output` | AC2b |
| `deploy-envfile.test.ts › client id without suffix, folder id too short / bad chars → exit 1` | Mirrors `loadDriveConfig` |
| `deploy-envfile.test.ts › malformed password file → exit 1 (existing behaviour kept)` | Compatibility |
| `deploy-envfile.test.ts › static: environment: tudocuatui on job deploy; envfile env maps exactly the 4 secrets; no ${{ inside run blocks; deploy step adds --force-recreate only from steps.envfile.outputs.changed` | AC2c |

## Approach
1. **`scripts/drive-connect.mjs`** (`// @ts-check`, Node 22 built-ins only: `node:http`, `node:crypto`, `node:fs`,
   `node:os`, `node:path`, `node:url`; ~200 lines):
   - Args: `--client-file <path>` (required), `--out <path>` (optional; default
     `~/.config/tudocuatui/drive-secrets.env` via `os.homedir()`). Secrets never come from argv or env.
   - Read the client JSON; accept only the `installed` (Desktop app) shape; validate the client id suffix.
   - Check the output path **before** any network call: resolve it, walk up from the nearest existing ancestor
     (`realpath`) looking for a `.git` entry (directory or file). Inside a work tree → exit 2. No `git` binary needed.
   - Start `http.createServer` on `127.0.0.1:0`. Redirect URI `http://127.0.0.1:<port>/`. PKCE S256 (32 random
     bytes), `state` (16 random bytes, constant-time compare), 5-minute timeout. Accept one valid GET on `/`. Answer with a
     fixed "Done, you can close this tab" page. Close the server.
   - Print the auth URL. The script does not open a browser (T-005.1 A6).
   - Token exchange: `POST https://oauth2.googleapis.com/token` (form body). Require `refresh_token` and `drive.file` in
     `scope`. On error, print only the OAuth `error` field when it matches `^[a-z_]+$`, never the body.
   - `GET https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)` → print the email.
   - Find-or-create the folder: `GET files?q=name='TuDoCuaTui' and mimeType='application/vnd.google-apps.folder' and
     trashed=false&orderBy=createdTime&fields=files(id)&spaces=drive`. If there are none, `POST files?fields=id` with
     `{name:"TuDoCuaTui", mimeType:"application/vnd.google-apps.folder"}`. Validate the id.
   - Validate every value against the same rules the workflow applies (A4). Write the dotenv file: `mkdir -p` with mode
     700, a temp file in the same dir with `flag:"wx", mode:0o600`, `chmod 600`, `rename`. On win32, print a warning that
     the mode is not enforced and the file must be deleted after step 6.
   - Print: account, folder id, file path, the `gh secret set -f … --env tudocuatui -R mmlabs-online/deployment` command,
     the `gh secret list` check and "delete this file and the client JSON afterwards".
   - Endpoints are constants. Tests pass overrides **only** through `run({endpoints})`, never through env (same rule as
     T-005.1 A11). Exit codes: 0 ok, 1 OAuth/Drive failure, 2 usage or unsafe output path.
2. **Workflow draft** (`deploy-tudocuatui.yml`):
   - Job `deploy`: add `environment: tudocuatui` (after `if:`).
   - `envfile` step: `env:` adds `GOOGLE_CLIENT_ID: ${{ secrets.TUDOCUATUI_GOOGLE_CLIENT_ID }}`, `GOOGLE_CLIENT_SECRET`,
     `GOOGLE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID` (same pattern as `deploy-stoktok.yml`'s `secrets` step). In `run:`, after
     the password check and **before** any write: count the set values. 1–3 set → `::error::` listing the missing
     `TUDOCUATUI_*` names plus "Nothing was started; $ENV_FILE was not changed.", exit 1. All four set → check each value
     with regexes held in variables (macOS bash 3.2): client id `^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$`, client
     secret `^[A-Za-z0-9._-]+$`, refresh token `^[A-Za-z0-9._/-]+$`, folder id `^[A-Za-z0-9_-]{10,200}$`. On failure,
     name the secret and never echo the value. Then the existing `printf 'DATABASE_URL=…'` line is unchanged, followed (all
     four only) by one `printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\nGOOGLE_REFRESH_TOKEN=%s\nDRIVE_FOLDER_ID=%s\n'
     … >> "$tmp"`. `chmod 600`, then `if cmp -s "$tmp" "$ENV_FILE"; then changed=false; else changed=true; fi`, `mv`, and
     `echo "changed=$changed" >> "$GITHUB_OUTPUT"`. The step stays Linux-portable (no `stat -f`) so the test can run it.
   - `deploy` step: `env: CHANGED: ${{ steps.envfile.outputs.changed }}`; `recreate=()`; `--force-recreate` when
     `true`; `up -d --wait --wait-timeout 120 ${recreate[@]+"${recreate[@]}"} tudocuatui` (stoktok idiom).
   - `rollback`, `pull`, `backup`, `migrate`, `notify` unchanged. Header: replace "No GitHub secrets…" with: the
     Postgres password still comes from `postgres/secrets/`, the four Drive values come from environment `tudocuatui`
     (main only), all-or-none, never printed; workflow_dispatch after a secret change recreates the app.
3. **Docs**: compose comment, deployment README section and table row, server/README line, the M-15 rewrite.
4. **Tests** as listed. `deploy-envfile.test.ts` extracts the block under `- name: envfile` → `run: |` by indentation,
   writes it to a temp script, runs `bash -e` with `cwd` = temp dir holding `postgres/secrets/apps/tudocuatui.password`
   (a generated fake), `HOME`, `ENV_FILE=$HOME/.config/tudocuatui/tudocuatui.env`, `DB_APP`, `GITHUB_OUTPUT`.

Rules:
- R3: no secret enters the TuDo repo, the image or a `VITE_*`. The script writes outside any git work tree; `scripts/` is
  not in the image (`.dockerignore`); the workflow reads the values from environment secrets and writes them only to the
  host env file (mode 600, dir 700). The charset check blocks env-file line injection.
- R7: no server change; the deployment repo changes go through the setup PR above, not this diff.
- R8: tests for the script and for the real workflow block; coverage threshold for the script.
- R10: no Figma files. R1, R2, R4–R6, R9 do not apply (no data layer, schema, UI).
- Security auditor runs at REVIEW (areas `security`, deploy config, secrets).

## Specialist input used
`work/tickets/T-005.1/consult-software-architect.md`:
- **Adopted:** environment `tudocuatui` + `TUDOCUATUI_` prefix ("Where the secrets live"); same `envfile` step,
  all-or-none, mandatory charset check, `changed` → `--force-recreate`, header update (Finding 1, 2); connect script:
  `--client-file`, loopback on 127.0.0.1 with one request, PKCE S256, `state`, 5-minute timeout,
  `access_type=offline`, `prompt=consent`, `drive.file`, print the URL, show the account, find-or-create the folder via
  the API, mode-600 file outside the repo, refuse a git work tree, print the `gh secret set` command; runbook deletes the
  client JSON and the token file (Risks); recovery path for dead refresh tokens (Risks); "create the environment first"
  because GitHub auto-creates it without branch rules (Risks); smoke via `exec tudocuatui`, not `migrate` (Finding 3).
- **Changed:** one dotenv file + `gh secret set -f` instead of `gh secret set … < file` per secret (A2: Windows
  PowerShell has no `<` redirection, and `-f` sets all four in one command).
- **Rejected:** none new (the committed-file and hand-made env-file alternatives were rejected in T-005.1).

## Assumptions
Numbered so Ming can confirm or change each at plan approval. Defaults are what the plan implements.

- **A1 — Runbook location.** The full runbook is M-15 in `work/ming-todo.md` (like M-12/M-14). The deployment draft
  README gets a short section that points to it.
- **A2 — One secrets file, one `gh` command.** The script writes all four values as a dotenv file
  (`~/.config/tudocuatui/drive-secrets.env`, mode 600) and prints
  `gh secret set -f <file> --env tudocuatui -R mmlabs-online/deployment`. It works the same in bash, zsh, cmd and
  PowerShell. Fallback in M-15: one `gh secret set <NAME>` per secret, value pasted at the hidden prompt. Alternative:
  a token-only file and `< file` commands (bash/zsh only).
- **A3 — The file holds the client secret too.** The client secret is copied from the client JSON into the same file, so
  Ming never copies it by hand. Both files are deleted in step 6.
- **A4 — Validation mirrors the server.** The workflow and the script use the same rules as `loadDriveConfig` plus the
  charset `^[A-Za-z0-9._/-]+$` (client id suffix; folder id `^[A-Za-z0-9_-]{10,200}$`). So a value the server would
  refuse (exit 2 → unhealthy) is stopped before the env file is written.
- **A5 — `--force-recreate` only when the env file changed** (`cmp`), as in stoktok. With no secrets the file is
  unchanged, so the first run after the setup PR does not restart the app.
- **A6 — Several `TuDoCuaTui` folders.** If the app already created more than one, the script uses the oldest and
  prints a warning with the count. It never deletes folders.
- **A7 — Setup PR content and route.** Branch `setup/tudocuatui-drive-secrets`, opened by the orchestrator, exactly
  two files (workflow + compose, comment-only compose diff). Ming merges it after M-15 step 2. Its merge triggers one
  zero-secret deploy run, which is the live compatibility check. Alternative: the workflow alone (no run on merge; Ming
  dispatches once to check), with the compose comment shipped in a later release PR.
- **A8 — Order.** TuDo PR merged → environment created (main only) → setup PR merged (zero-secret run green) → connect
  script → secrets → deploy → smoke. The workflow is all-or-none, so it can land before the secrets exist.
- **A9 — Compatibility.** The live workflow equals the pre-change draft. The live compose is the Node one from #40
  (`env_file` present). With no secrets the env file is byte-identical to today. v0.2.0 ignores the Google variables;
  any image with T-005.1 validates them with the same rules.
- **A10 — Release for smoke.** If the running release predates T-005.1, M-15 step 7 cuts a release instead of
  dispatching (the old image has no `drive-smoke.js`).
- **A11 — `migrate` sees the values.** It shares `env_file` with the app (`x-app` anchor). It is on the internal `db`
  network only (no egress) and never reads them. Splitting the env file is a follow-up, not this ticket.
- **A12 — No required reviewers on the environment.** Release merges deploy unattended. The branch rule (`main`) plus the
  job's `if:` are the protection.
- **A13 — No browser auto-open.** The script prints the URL (T-005.1 A6).
- **A14 — Hotspots.** `vitest.config.ts` and `tsconfig.server.json` may also be edited by T-005.2/T-016. `work/ming-todo.md`
  changes only M-15. The deployment drafts are not touched by any other open ticket.

## Blocking questions
None. The gate is plan approval: Ming confirms or changes A1–A14 (A2, A3 and A7 are the real choices).

## Split proposal
None. This is already the second slice of T-005.1. Estimate: about 200 lines of script, 45 lines of workflow, 60 lines
of docs, plus about 350 lines of tests.
