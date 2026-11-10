# Security review — T-007

## Attempt 1 — 2026-11-10 (security-ai-generated-code-auditor, commit 353be57)

**Verdict: no 🔴 blockers. Three 🟡 hardening items (plus one 🟡 on risk tiers), each a one-line fix.** Read-only review: nothing built, run or edited.

### GitHub Actions
- 🟢 No `${{ }}` injection in any `run:` script: the branch name is read as `$GITHUB_REF_NAME` via env; the tag comes from a strict regex (`release.yml:58-61`); secrets referenced by name only; `ci.yml:13` uses `${{ github.ref }}` only in the concurrency group.
- 🟢 Triggers: `ci.yml` uses `pull_request` (not `_target`) with `contents: read`; the `image` job has no login, no secrets, `push: false` (`ci.yml:41-60`). `release` runs only on `release/v*` and refuses commits not on `origin/main` (`release.yml:52`).
- 🟢 Permissions: only `contents: write` for the tag push (`release.yml:22-23`); `persist-credentials: false` (`:41`); `DEPLOY_REPO_TOKEN` used in one step only (`:127`), never given to a third-party action; the build runs in BuildKit with no token mounted.
- 🟢 Shared GHA cache scope `image`: PR caches are scoped to `refs/pull/N/merge`, so PRs cannot poison release builds.
- 🟢 Follow-up: `DEPLOY_REPO_TOKEN` is embedded in the clone URL (`release.yml:134`) on the ephemeral runner (same as stoktok; masked).
- 🟢 Follow-up: actions pinned by tag, not SHA (same as stoktok).

### R3: what gets baked into the image
- 🟢 The guard rejects `sb_secret_*`, any `sb_*` other than `sb_publishable_`, non-3-segment JWTs, and JWTs without `"role":"anon"` (`scripts/check-public-supabase-env.sh:23-36`); never prints a value (`.test.sh:23-28`); no real key literals in the repo.
- 🟡 **`sb_publishable_*` is matched as a glob with no charset check** (`check-public-supabase-env.sh:25`). A pasted value with an embedded newline passes and reaches the multi-line `build-args` block (`release.yml:106-108`), where an extra `VITE_SUPABASE_URL=…` line would override the validated URL. Fix: `[[ "$key" =~ ^sb_publishable_[A-Za-z0-9_-]+$ ]] || fail …`, plus a test case with an embedded newline.
- 🟢 Build args stay out of the pushed image: `ARG`s only in the build stage, no `ENV` (`Dockerfile:15-17`); `provenance: false`, `sbom: false` (`release.yml:110-111`); `check-image.sh:17-26` checks `VITE_` absent from config and history; no sourcemaps in production.
- 🟢 `check-image.sh:39` puts `$EXPECTED_URL` inside `sh -c '…'`; safe only because the guard restricts the URL. Passing it as a positional argument would be safer (follow-up).
- 🟢 Local-mode release check only proves `ci-dummy.invalid` is absent (`check-image.sh:43`); a broader absence check is optional.

### `.dockerignore`
- 🟡 **`.env*` only excludes `.env` files at the context root** (`.dockerignore:13`); Docker patterns are not recursive. Fix: add `**/.env*`.
- 🟢 `.git`, `.github`, `.claude`, `work`, `deploy`, `scripts`, `supabase` excluded; `.figma/make/*` excluded except `site.json`.

### nginx (`docker/nginx.conf`)
- 🟢 Non-root (`nginx-unprivileged`, asserted in `check-image.sh:27-28`); listens on 3000; `server_tokens off`, `absolute_redirect off`; no autoindex; missing asset is a real 404; headers repeated per location (`:22-34`).
- 🟡 **No anti-framing header**, and there is a login form. Add `add_header X-Frame-Options DENY always;` (or CSP `frame-ancestors 'none'`) in all three places. Full CSP stays a follow-up.
- 🟢 Dotfiles in `dist` are served (`/.gitattributes`); harmless; `location ~ /\.(?!well-known) { return 404; }` optional follow-up.

### Compose and deploy draft
- 🟢 Compose hardened (`compose.yml:13-36`): `cap_drop: [ALL]`, `no-new-privileges`, log limits, no ports, no env; only on external `web`.
- 🟢 The deploy draft does not widen what the self-hosted runner executes vs `deploy-site.yml`: only names, paths, runner label (narrower), variable name and a stricter image regex (`:53`) differ.

### Risk tiers
- 🟡 **The R3 guard scripts are not High tier.** Add `scripts/check-public-supabase-env*.sh` and `scripts/check-image.sh` to `high:` in `.github/risk-tiers.yml:17-22`.

### Risks
- `DEPLOY_REPO_TOKEN` (Contents + PR write) is the bridge to the self-hosted runner; a stolen token could propose a malicious `apps/tudocuatui/compose.yml`, stopped only by deployment `main`'s branch protection + CODEOWNERS. Keep both on and the PAT scoped to the deployment repo.
- Anyone with write access to TuDoCuaTui can cut a release from a commit on `main` (acceptable while Ming is the only owner).
- Docker Hub repo public by decision (A2).

### Open questions
- Is deployment `main` protected so the PAT cannot push to it directly? Not verifiable here.

## Attempt 2 — 2026-11-10 (security-ai-generated-code-auditor, re-review of 93384e5)

**Verdict: no 🔴 and no 🟡.** All four attempt-1 🟡 items and the review 🔴 are fixed; no regressions or new issues. Read-only; runtime claims rest on code reading until the CI `image` job runs.

### Fixes confirmed
- 🟢 Review 🔴 — `scripts/check-image.sh:31` now greps `sb_secret_[A-Za-z0-9_-]{8,}`: still catches a real key (Vite inlines whole strings), no longer flags supabase-js's bare prefix literal; quoting safe; BusyBox `grep -rqE` supports `{8,}`; the CI dummy key `sb_publishable_ci_dummy` (`ci.yml:59`) does not match.
- 🟢 B1 — `scripts/check-public-supabase-env.sh:25-29` requires `^sb_publishable_[A-Za-z0-9_-]+$`; embedded/trailing newline or `=` fail, closing the extra-line override in `release.yml:106-108`. The guard runs at `release.yml:77`, before the tag push (`:82-88`) and the build (`:97`), under `-e`.
- 🟢 B1 test — `scripts/check-public-supabase-env.test.sh:50-51` expects exit 1 and that neither checked string is printed; CI runs the test (`ci.yml:31`).
- 🟢 B2 — `.dockerignore:13-14` adds `**/.env*` (also matches the root); `!.figma/make/site.json` (`:19-21`) unaffected; `check-image.sh:29-30` still checks for `.env*` at runtime.
- 🟢 B3 — `X-Frame-Options DENY always` in the server block and both locations with their own `add_header` (`docker/nginx.conf:16, 27, 36`); `location /` inherits it; deep paths go through `location = /index.html`.
- 🟢 B4 — `.github/risk-tiers.yml:23-24` adds `scripts/check-public-supabase-env*.sh` and `scripts/check-image.sh` to `high:`.

### No regressions
- 🟢 `case` order unchanged (`check-public-supabase-env.sh:23-41`); all earlier tests still assert values are never printed (`.test.sh:44-59`).
- 🟢 Dockerfile unchanged; `provenance`/`sbom` off (`release.yml:110-111`).

### Risks (unchanged)
- The pushed-image check (`release.yml:116-123`) runs after the push to the public repo; the guard at `:77` is the real gate, `check-image.sh` a second net.
- `check-image.sh` only looks for `sb_secret_` values; a legacy `service_role` JWT is caught only by the guard (High tier now).
- `DEPLOY_REPO_TOKEN` / deployment-repo branch protection risks from attempt 1.

### Still to prove in CI
- `check-image.sh` end to end under real Docker: live nginx headers and `.dockerignore` behaviour.
