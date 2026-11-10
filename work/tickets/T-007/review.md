## Attempt 1 — 2026-11-10
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`) exit 0, no output.
- format:check: "All matched files use the correct format." (92 files).
- test: `pnpm test` → Test Files 25 passed (25), Tests 385 passed (385).
- test:coverage: 385 passed; All files 99.82 / 99.08 / 100 / 99.79.
- build: `pnpm build` ok (`dist/assets/index-ZWPGytNv.js` 242.17 kB).
- `bash scripts/check-public-supabase-env.test.sh`: 16/16 passed, exit 0.
- Extra (reviewer): `VITE_SUPABASE_URL=https://ci-dummy.invalid VITE_SUPABASE_ANON_KEY=sb_publishable_ci_dummy pnpm exec vite build --outDir <scratch>/dist2`
  → `https://ci-dummy.invalid` is in `assets/index-*.js` (good), **and `sb_secret_` is also in it** (see Issue 1).
  The no-arg `dist/` has no `sb_secret_`, no `ci-dummy`, no `*.map`; `dist/index.html` has `id="root"`.
- Docker Hub tags `nginxinc/nginx-unprivileged:1.30-alpine` and `node:22-bookworm-slim` exist (Hub API 200).
- No Docker daemon here: `docker build` and `scripts/check-image.sh` not run. ACs that depend on the image are
  **to be confirmed by CI on the PR** (`ci.yml` job `image`).
- impl-log vs reviewer run: typecheck/format/test/coverage/build/guard-test numbers match. The claim "no `sb_secret_`
  … in dist" is true only for the no-arg build; the Supabase-mode build was not checked (Issue 1).

### Acceptance criteria
- [ ] AC1 no-arg image serves on :3000 in local mode, SPA fallback, `wget --spider` health check — design looks
  correct, **to be confirmed by CI on the PR**: `Dockerfile:7-24` (bookworm-slim build, `corepack enable` with
  `packageManager: pnpm@10.34.3`, frozen lockfile, runtime `nginx-unprivileged:1.30-alpine`, `EXPOSE 3000`,
  `HEALTHCHECK wget -q --spider http://127.0.0.1:3000/`); `docker/nginx.conf:3` `listen 3000`, `:17-18`
  `try_files $uri /index.html`, `:29-30` `/assets/` → `=404`; `.dockerignore:13` `.env*`, `:18-20` keeps
  `.figma/make/site.json` (the only `.figma` file `vite.config.ts` imports). The `ci-local` half of
  `check-image.sh` should pass. Not yet green because the same CI job also fails on Issue 1.
- [ ] AC2 `VITE_*` build args used; nothing else secret baked in — FAILED, see Issue 1. The bundle does use the args
  (reviewer's dummy build); ARG-only, no ENV (`Dockerfile:15-16`); guard `scripts/check-public-supabase-env.sh`
  + 16 tests; diff secret grep finds only pattern literals and the test's `sb_secret_abc123`. But
  `scripts/check-image.sh:31` fails every Supabase-mode image.
- [x] AC3 release.yml mirrors stoktok — evidence: `diff` vs `/home/user/stoktok/.github/workflows/release.yml` shows
  only the planned changes: same guards (`release.yml:52-75` merge-base on `origin/main`, already-tagged, strict
  `vX.Y.Z` regex, tag exists, `sort -V` higher, `DH_USER/DH_TOKEN/DEPLOY_TOKEN`), plus the VITE guard
  (`:76-79`); tag before build (`:82-88`); one push `mingming21400/tudocuatui:<tag>`, `linux/amd64`,
  `provenance/sbom: false`; digest pull + `check-image.sh` (`:115-122`); PR writes only
  `apps/tudocuatui/release.env` with the only-file assert (`:130-153`). The written
  `TUDOCUATUI_IMAGE=mingming21400/tudocuatui:vX.Y.Z@sha256:<64hex>` matches the deploy draft regex. (Releases with
  the `VITE_*` secrets set will fail at `verify pushed digest` because of Issue 1, after the tag is reserved;
  fixing Issue 1 fixes that.) actionlint not available (not run).
- [x] AC4 deployment drafts follow site/stoktok and pass pr-scope — evidence: `diff` of
  `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` vs `/home/user/deployment/.github/workflows/deploy-site.yml`
  shows only the substitutions in plan step 8 (name/concurrency, paths, APP_DIR/PROJECT, runner
  `[self-hosted, macbook-runner]` (A1), var `TUDOCUATUI_IMAGE`, strict pattern, messages) plus a 3-line header.
  `compose.yml`: service `tudocuatui`, `${TUDOCUATUI_IMAGE:?…}`, healthcheck on 127.0.0.1:3000, external `web`,
  no ports/env, `cap_drop`/`no-new-privileges`/log limits (C6). pr-scope regex `^release/([a-z0-9-]+)-v[0-9]` →
  app `tudocuatui`; the release PR touches only `apps/tudocuatui/release.env`.
- [x] AC5 README flow + one-time setup; D20 recorded — evidence: `README.md` "Deploy (home server, Cloudflare
  Tunnel)" (setup, release, Supabase values, rollback, local run, troubleshooting; Pages text removed);
  `work/decisions.md` D20 added, D5 marked superseded; `work/ming-todo.md` M-4 rewritten, M-9 added.
- [ ] AC6 existing CI still passes; checks green — local checks green (above), but the `image` job added to
  `ci.yml` will fail on `ci.yml:62` because of Issue 1. To be confirmed by CI on the PR after the fix.

### Issues
#### Issue 1 — 🔴 blocker — check-image fails every Supabase-mode image (CI `image` job, release verify)
- **Where**: `scripts/check-image.sh:31-33`; reached from `.github/workflows/ci.yml:62` and
  `.github/workflows/release.yml:122`.
- **Expected**: `check-image.sh tudocuatui:ci-supabase https://ci-dummy.invalid` passes for an image built with the
  public URL + publishable key, and still fails if a real secret key were baked in.
- **Actual**: `grep -rqF sb_secret_ /usr/share/nginx/html` matches supabase-js's own key-type check, which is
  bundled as soon as `VITE_SUPABASE_URL` is set: ``ja=e=>e.startsWith(`sb_publishable_`)||e.startsWith(`sb_secret_`)``
  (reviewer's dummy build, `assets/index-*.js`). The no-arg build tree-shakes supabase-js, which is why the
  impl-log check saw nothing. Result: the CI `image` job fails on every PR, and any release with the `VITE_*`
  secrets fails at "verify pushed digest" after the tag `vX.Y.Z` has been pushed (burns the version).
- **Fix instruction**: in `scripts/check-image.sh:31` look for a key *value*, not the prefix, e.g.
  `grep -rqE 'sb_secret_[A-Za-z0-9_-]{8,}' $ROOT` (busybox grep supports `-E` and `{n,}`; the reviewer checked
  this pattern has 0 matches in the dummy-arg bundle) and update the `::error::` text to match. Verify without
  Docker by building with the dummy args into a temp outDir (command above) and running the same grep, both the
  new pattern (no match) and against a file containing `sb_secret_abcdefghij` (match). Record both in impl-log,
  and correct the impl-log line that said no `sb_secret_` is in dist (only true for the no-arg build).

### Rules R1–R10 (CLAUDE.md)
- R1: no `src/` change; the no-arg image is local mode (supabase-js not even bundled). OK.
- R3: only ARGs in the build stage, no ENV; guard script refuses secret/non-anon keys; `.env*` docker-ignored.
  Issue 1 is a broken check, not a leak. Security details are left to the parallel security review.
- R7: every changed file is in the plan's file list; no `.prettierignore` needed (format:check clean); no
  out-of-plan files. Deviations judged: (1) `.dockerignore` `.figma/README.md` + `.figma/make/*` +
  `!.figma/make/site.json` instead of `.figma/*` — acceptable and more robust; (2) local-mode check greps only
  `ci-dummy.invalid` — matches plan step 4(e); (3) extra header comment in the deploy draft — acceptable;
  (4) no `.prettierignore` — correct per plan's "only if".
- R8: guard has 16 shell tests; checks green locally, but the CI `image` job would be red (Issue 1).
- R9: no UI change. R10: `AGENTS.md`, `.figma/`, `vite.config.ts` untouched; `FIGMA_PUBLIC_URL` never set.
- R2/R4/R5/R6: not touched.

### Not verifiable here (impl-log list, judged)
- `docker build`, `check-image.sh` end to end, `.dockerignore` re-include, corepack/pnpm in the image: to be
  confirmed by CI on the PR. Reading them: `packageManager` is pinned, there is no `pnpm-workspace.yaml`/`.npmrc`
  that the deps layer would miss, nginx-unprivileged runs as 101 with `--cap-drop ALL`, and the default
  `default.conf` is replaced, so the entrypoint IPv6 script skips it. Expected to pass once Issue 1 is fixed.
- actionlint/shellcheck absent: accepted; the workflows are near-verbatim copies of stoktok/deployment files.
- release/deploy workflows only provable by Ming's first release (v0.1.0): accepted.

### Nits (do not block)
- `scripts/check-image.sh:29` `found=$(docker run … ; true)`: if `docker run` itself fails, the `.env*` check
  passes silently (the smoke step later would still fail). Could check the exit status.
- `ci.yml:50-60`: the second build has `cache-from` only; fine, just noting it never warms the cache for its
  own layers.

### Follow-ups (out of scope)
- As in the plan: M-9 tunnel token rotation; CLAUDE.md Hosting / Risk-tier wording (A7); `docs/plan-M1.md` and
  feature-list F-007 text; CSP header; compose `read_only`; `dist/version.txt`.
- Consider moving `create version tag` after `verify pushed digest` in a later ticket so a failed verify does not
  burn a version (stoktok has the same order on purpose: "a failed run never reuses it").

## Attempt 2 — 2026-11-10
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (tsc --noEmit) exit 0.
- format:check: "All matched files use the correct format." (92 files).
- test: 25 files, 385 tests passed.
- test:coverage: statements 99.82%, branches 99.08%, functions 100%, lines 99.79% (matches impl-log).
- build: `pnpm build` ok (local mode, `dist/assets/index-*.js` 242 kB).
- `bash scripts/check-public-supabase-env.test.sh`: 17/17 passed (was 16; +1 newline case).
- Issue 1 reproduction: `VITE_SUPABASE_URL=https://ci-dummy.invalid VITE_SUPABASE_ANON_KEY=sb_publishable_ci_dummy`
  (the `ci.yml:58-59` args) `vite build --outDir <scratch>`: old `grep -rF sb_secret_` still matches
  (``sb_secret_`),Ma=`sb_…`` — supabase-js); new `grep -rqE 'sb_secret_[A-Za-z0-9_-]{8,}'` exit 1 (no match);
  `ci-dummy.invalid` is in the bundle (Supabase mode really built). Synthetic file with
  `sb_secret_abcdefghijklmnopqrst` → new pattern exit 0 (match). impl-log Attempt 2 matches these results.
- Not run (no Docker daemon): `docker build`, `check-image.sh` end to end, live nginx headers, `.dockerignore`
  under real Docker — to be confirmed by CI on the PR (`image` job).

### Rework items
- [x] Review Issue 1 🔴 — `scripts/check-image.sh:31` now `grep -rqE 'sb_secret_[A-Za-z0-9_-]{8,}' $ROOT`,
  `:32` error text updated. Runs in `nginx-unprivileged:1.30-alpine` (`Dockerfile:19`); busybox grep supports
  `-E` and `{n,}`. Reproduced above. impl-log's Attempt-1 "no `sb_secret_` in dist" claim is corrected.
- [x] Security 🟡 publishable-key charset — `scripts/check-public-supabase-env.sh:25-29`
  `^sb_publishable_[A-Za-z0-9_-]+$`; test `check-public-supabase-env.test.sh:50-51` (embedded newline → exit 1,
  neither line echoed). Reviewer also ran the guard directly with a newline key and with `sb_publishable_a b`:
  both exit 1 "unexpected characters".
- [x] Security 🟡 recursive `.env*` — `.dockerignore:14` `**/.env*` (root `:13` kept; `site.json` re-include
  unaffected).
- [x] Security 🟡 anti-framing — `docker/nginx.conf:16`, `:27`, `:36` `X-Frame-Options DENY always` in the server
  block and both locations that have their own `add_header` (no location left without it).
- [x] Security 🟡 risk tiers — `.github/risk-tiers.yml:23-24` adds `scripts/check-public-supabase-env*.sh` and
  `scripts/check-image.sh` under `high:`.

### Acceptance criteria
- [x] AC1 image builds/serves on :3000 as non-root — unchanged from Attempt 1 except the extra header; docker
  steps to be confirmed by CI on the PR.
- [x] AC2 `VITE_*` build args only, nothing secret baked in — Issue 1 fixed (reproduced); guard stricter.
  Image-level run to be confirmed by CI on the PR.
- [x] AC3 release.yml mirrors stoktok — untouched since Attempt 1 (`git diff 40519f9..HEAD` lists no workflow file).
- [x] AC4 deployment drafts — untouched since Attempt 1.
- [x] AC5 README + D20 — untouched since Attempt 1.
- [x] AC6 local checks green (above); CI `image` job no longer blocked by Issue 1 — to be confirmed by CI on the PR.

### Scope
`git diff 40519f9..HEAD --stat`: exactly `.dockerignore`, `.github/risk-tiers.yml`, `docker/nginx.conf`,
`scripts/check-image.sh`, `scripts/check-public-supabase-env.sh`, `scripts/check-public-supabase-env.test.sh`,
`impl-log.md`, plus the orchestrator's `ticket.md` state change. Each maps to one rework item; no other change.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R3 strengthened (guard charset, recursive `.env*`, working secret-value scan). R7: only the
five rework items changed. R10: `AGENTS.md`, `.figma/`, `vite.config.ts` untouched.

### Nits (do not block)
- Attempt-1 nits still open (`check-image.sh:29` ignores a failing `docker run`; `ci.yml` second build cache).

### Follow-ups (out of scope)
- As in Attempt 1 (CSP header incl. `frame-ancestors`, compose `read_only`, tag-after-verify ordering, M-9, etc.).
