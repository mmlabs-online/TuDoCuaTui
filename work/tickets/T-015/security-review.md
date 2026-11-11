# Security review — T-015

## Attempt 1 (2026-11-11) — security-ai-generated-code-auditor

No 🔴, no 🟡. OK to PASS on security grounds. No .env / release.env / postgres/secrets read.

Verified: build-only `VITE_*` ARGs (`Dockerfile:17-19`; runtime 35-49 has none), enforced by `check-image.sh:29-37,54-58`; anon-key guard `release.yml:80`; `.env*` excluded (`.dockerignore:15-16`, `check-image.sh:41`); tests excluded (`.dockerignore:13-14`, `check-image.sh:70-71`). Root-owned files + `USER node` (`Dockerfile:39-44`), `--ignore-scripts` (`:33`), user check (`check-image.sh:39-40`). Fail-closed: `NODE_ENV=production` in image (`Dockerfile:37`) and compose (`compose.yml:37`); `CF_ACCESS_*` always set; negative test `check-image.sh:107` isolates the production refusal. Script uses explicit `exit 1` checks, correct exit capture (`:102-103`), cleanup trap (`:24`), nothing secret printed. CI `contents: read`, no push, throwaway service password. Compose: `DATABASE_URL` only via `env_file`; non-secret `environment:`; no ports; cap_drop/no-new-privileges on both services; `migrate` on internal `db` only, behind a profile. Rollback restores compose + release.env together (expand-only migrations). M-14: one push of exactly compose.yml + release.env; passes `pr-scope.yml:26-35`.

### 🟢 Notes / follow-ups
1. Some secret checks fail open if `docker run` itself errors (`check-image.sh:41,43,46`); capture exit codes, treat anything but 0/1 as error.
2. `expect_exit` timeout can orphan the unnamed container (`check-image.sh:102`); add `--name` + trap, or `--stop-timeout`.
3. Negative test could also assert stderr `not allowed in production`.
4. Bundle scan doesn't cover a legacy `service_role` JWT (`check-image.sh:43`); release guard covers input; goes away with T-016.
5. Compose hardening (R7 follow-up): `read_only: true` (+ `tmpfs: /tmp`), `pids_limit`, `mem_limit`.
6. `README.md:89-92` local-run uses `-e DATABASE_URL=...` (shell history/ps); suggest `--env-file` outside the repo.
7. Shared `web` network: neighbours reach the SPA and health endpoints without Access; `/api` still needs a JWT.
8. Shared `type=gha,scope=image` cache incl. the public anon key (existing; note only).
9. Actions pinned by tag, not SHA (existing).

Open: live JWKS egress / AUD only verifiable in M-14 step 6.
