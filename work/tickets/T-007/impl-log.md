## Attempt 1 — 2026-11-10

### Files touched
| File | Required because |
|---|---|
| `Dockerfile` | Multi-stage build (node 22 bookworm-slim, pnpm frozen lockfile, VITE_* build args in the build stage only, no ENV) and `nginxinc/nginx-unprivileged:1.30-alpine` runtime on :3000 with the `wget --spider` HEALTHCHECK. Tag `1.30-alpine` confirmed to exist on Docker Hub (stable line; 1.31 is mainline). |
| `.dockerignore` | Keeps `.env*` and repo noise out of the context; keeps `.figma/make/site.json` (imported by vite.config.ts) |
| `docker/nginx.conf` | SPA fallback, `/assets/` 404 + immutable cache, no-cache index.html, gzip, 2 security headers |
| `scripts/check-image.sh` | Image checks shared by ci.yml and release.yml |
| `scripts/check-public-supabase-env.sh` | R3 release guard (anon/publishable key only, all-or-none, https URL) |
| `scripts/check-public-supabase-env.test.sh` | Tests for the guard (16 cases) |
| `.github/workflows/release.yml` | stoktok's release.yml adapted for one image |
| `.github/workflows/ci.yml` | Test step for the guard + `image` job (build twice, never push) |
| `deploy/deployment-repo/README.md`, `apps/tudocuatui/compose.yml`, `.github/workflows/deploy-tudocuatui.yml` | Drafts for the deployment repo (deploy-site.yml with substitutions) |
| `README.md` | Deploy section rewritten; Code map rows |
| `work/decisions.md` | D20 added, D5 marked superseded |
| `work/ming-todo.md` | M-4 rewritten, M-9 (tunnel token) added |
| `.github/risk-tiers.yml` | New High paths; Pages entries relabelled legacy |

### Tests added / changed
- `scripts/check-public-supabase-env.test.sh`: both empty/unset (local mode), only URL, only key, http URL, URL with path, URL with space, https + sb_publishable (0), sb_secret (1), sb_other (1), anon JWT (0, also with spaces in the JSON), service_role JWT (1), malformed key (3 cases); asserts no key or URL value appears in output. JWTs are built at runtime from fake payloads.
- `scripts/check-image.sh` is exercised by the CI `image` job (not runnable here).

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean.
- format:check: "All matched files use the correct format." (drafts under `deploy/` need no `.prettierignore` entry; not touched)
- test: 25 files, 385 tests passed. test:coverage: statements 99.82%, branches 99.08%, functions 100%, lines 99.79%.
- build: `vite build` ok (`dist/assets/index-*.js` 242 kB); no `sb_secret_` and no `ci-dummy` in dist.
- `bash scripts/check-public-supabase-env.test.sh`: 16/16 passed.
- `bash -n` on every script ok; all workflow and compose YAML parsed with PyYAML ok.
- Secret grep (`eyJ…`, `sb_secret_`, `sb_publishable_<20+ chars>`) over the repo: only pattern literals in the guard, check-image and the test; no values.
- Deploy draft vs `deploy-site.yml`: only the planned substitutions plus a draft header comment; image pattern is strict `vX.Y.Z` and matches `mingming21400/tudocuatui:v0.1.0@sha256:<64 hex>`, rejects `:latest`.

### Not run here (prove in the CI `image` job on the PR)
- No Docker daemon: `docker build`, `scripts/check-image.sh` end to end (health check, deep path, 404, no `.env*`, non-root, no `VITE_`/`sb_secret_`/`.map`, dummy URL present/absent), `.dockerignore` re-include of `.figma/make/site.json` under real Docker, the `corepack enable` + pnpm version resolution in the image.
- actionlint and shellcheck not installed: workflows only YAML-parsed, scripts only `bash -n`.
- `release.yml` and `deploy-tudocuatui.yml` cannot run until Ming does the setup steps (first real proof = release v0.1.0).

### Deviations from the plan
- `.dockerignore` uses `.figma/README.md` + `.figma/make/*` + `!.figma/make/site.json` instead of `.figma/*` + `!…`, so the single-file re-include does not depend on re-including through an excluded directory.
- `check-image.sh` local-mode check greps only `ci-dummy.invalid` (not `.supabase.co`, which library code may contain).
- Deploy workflow draft has an extra 3-line header comment naming the differences from deploy-site.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Rotate the tunnel token committed in `mmlabs-online/deployment` `proxy/compose.yml` (M-9).
- CLAUDE.md Hosting / Risk-tier wording (A7); `docs/plan-M1.md` and `docs/feature-list.md` F-007 still say Pages / previews.
- CSP header, compose `read_only`, `dist/version.txt`.

### Scope self-check
- Could the diff be smaller? No: mostly copies of stoktok/deployment files.
- Diff size: ~+850 lines across 17 files (mostly new files).
