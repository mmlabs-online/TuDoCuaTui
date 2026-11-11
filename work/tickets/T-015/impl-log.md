# Implementation log — T-015

## Attempt 1 — 2026-11-11

Ming's answers: A1 option A (keep `VITE_SUPABASE_*` build args until T-016), A2 manual M-14, A3 T-014 may run in
parallel, A4 DB-backed in-image CI smoke = yes, A5-A15 as written.

### Files touched
| File | Required because |
|---|---|
| `Dockerfile` | Node runtime image, `prod-deps` stage, non-root, healthcheck, `CMD` (plan step 1) |
| `.dockerignore` | keep `server/test` and `*.test.ts` out of the image |
| `docker/nginx.conf` | deleted, nginx is gone |
| `scripts/check-image.sh` | rewritten for the Node image (config, layout, start exits, smoke, optional DB smoke) |
| `.github/workflows/ci.yml` | `image` job: postgres service, `CHECK_IMAGE_DATABASE_URL` on the first check, comment |
| `.github/workflows/release.yml` | header comment and PR body only (A1 option A) |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | `environment:` (NODE_ENV, Access values), healthcheck timeout, header |
| `deploy/deployment-repo/README.md` | M-14 pointer, first release and rollback paragraph |
| `README.md` | Deploy rewrite, code map |
| `server/README.md` | "Image (T-015)" paragraph |
| `work/ming-todo.md` | M-14 added; M-4 steps 5-7 and M-10 marked superseded |
| `work/decisions.md` | D26 added; D20 row prefixed |

### Tests added / changed
- None (no pure logic). The tests are the new `check-image.sh` sections.

### Checks (actual output summary)
- Docker: daemon started with `dockerd`. The sandbox proxy CA is not trusted inside build containers, so the image
  was built with a scratch copy of the Dockerfile (outside the repo) that only adds the CA and proxy to the build
  stages, built with `--network host`. The runtime stage is identical to the repo Dockerfile.
  `docker build` succeeded (BuildKit warning only: `SecretsUsedInArgOrEnv` for the existing public anon-key ARG).
- `bash scripts/check-image.sh tudo:t` -> `image ok` (all sections incl. `== start checks`, `== smoke`).
- `CHECK_IMAGE_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bash scripts/check-image.sh tudo:t`
  (local Postgres 16) -> `== db smoke` ran: migration applied, `/readyz` 200, `image ok`.
- Not run locally: the Supabase-mode URL argument path (needs a second build); CI covers it.
- `bash -n scripts/check-image.sh` ok; shellcheck not installed. Workflow and compose YAML parse OK.
- typecheck: green. format:check: "All matched files use the correct format". test: 51 files passed, 4 skipped;
  585 passed, 42 skipped (DB tests skip without `DATABASE_URL`). build: green.
- `grep DATABASE_URL Dockerfile release.yml` and `grep TUDO_ACCESS_DISABLED Dockerfile deploy release.yml`: only comments.

### Out-of-plan files
None. Note: the compose network is named `tunnel` (external name `web`), kept as drafted; the new header says so.
The `.env*` find in `check-image.sh` stays whole-image and needed no narrowing (no hits).
A12: live deployment files not compared (not read).

### Follow-ups (noticed, not done)
- As in the plan: release.yml compose automation, move SPA packages to devDependencies, risk-tiers additions,
  CLAUDE.md Hosting line, T-016 removal of `VITE_SUPABASE_*`.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +330 / -95 lines (see `git diff --stat`).
