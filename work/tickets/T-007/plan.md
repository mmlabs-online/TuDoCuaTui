Status: READY

# Plan — T-007: Self-host on the home server via Cloudflare Tunnel, with the stoktok release/deploy CI/CD

Branch: `claude/loving-fermi-t90upb` (cloud session branch, from latest `main`). Gate: plan-approval (High tier:
production deploy config and `.github/workflows/`). Implementation starts only after Ming writes "Plan approved"
in ticket.md. Security review runs at REVIEW.

## Feature summary
`docs/feature-list.md` line 104–105:
> #### F-007 · Deploy · P0 · M1 · S
> - Deploy to Vercel or Cloudflare Pages (owner decides); preview deploy per PR; env vars configured.

`work/decisions.md`, replaced by this ticket:
> D5 | 2026-11-07 | Hosting and previews | **Cloudflare Pages** with Git integration. Only the production environment
> gets `VITE_SUPABASE_*`; previews run in local mode.

Scope authority: ticket "Notes / answers from Ming", 2026-11-09: Ming set up the Cloudflare published application
`tudocuatui.mmlabs.online` → `tudocuatui:3000` and asked for "setup CI CD tương tự stoktok"; Ming added the repo
secrets `DEPLOY_REPO_TOKEN`, `DOCKERHUB_TOKEN`, `DOCKERHUB_USERNAME`. The two `VITE_SUPABASE_*` secrets wait for M-1.

Also relied on:
> D18 … Running TuDo's migrations on stoktok (M-1) is deferred … until then Supabase mode has no `tudo_*` tables and
> only local mode works.
> D19 … Redirect URLs are not needed for login until Google sign-in (F-102).

**Conflict flagged (feature list vs ticket):** F-007 "preview deploy per PR" goes away; there are no Pages previews.
Per CLAUDE.md, the feature list wins unless `work/decisions.md` records the change. D20 (written by this ticket) is
that record. The feature-list text itself is not edited (not in the ticket's scope).

## Security summary (for Ming's plan approval)
- **What reaches the browser / Docker Hub:** only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, as Docker
  **build args** in the builder stage (no `ENV`, so they are not in the runtime image config or history). Both are
  public by design (R3). The image is the static `dist/` plus nginx; no server code and no other secret.
- **Wrong-key guard (R3):** before any build, `release.yml` runs `scripts/check-public-supabase-env.sh`. It fails if
  only one of the two values is set, if the URL is not `https://<host>`, if the key starts with `sb_secret_`, if a
  `sb_` key is not `sb_publishable_…`, or if a JWT key's payload does not say `"role":"anon"`. A pasted service_role
  key never gets built or pushed. The script never prints a value.
- **Build context:** `.dockerignore` excludes `.env*`, so a developer's `.env.local` can never turn a "no build
  args" image into a Supabase-mode image or leak into a layer. `scripts/check-image.sh` asserts that no `.env*`
  file, no secret-like env name, no `VITE_` in the image config/history, no `sb_secret_` and no `*.map` file is in
  the image.
- **Runtime:** `nginxinc/nginx-unprivileged` (uid 101, non-root), port 3000, no published ports; reached only by
  cloudflared on the external `web` network. Compose adds `cap_drop: [ALL]` and `no-new-privileges`.
- **Supply chain / pinning:** releases are immutable tags `vX.Y.Z`, pinned by digest in the deployment repo; no
  `:latest` is ever pushed; CI never pushes. `provenance: false`, `sbom: false` set deliberately (no build-arg
  metadata in attestations).
- **Workflow secrets** are referenced by name only. `DEPLOY_REPO_TOKEN` is used in one step only (clone + PR on
  `mmlabs-online/deployment`). Checkout uses `persist-credentials: false` (as stoktok).
- **Not changed:** Supabase, auth code, RLS, the tunnel (`proxy/`), Cloudflare dashboard.
- **Found, out of scope (follow-up for Ming):** a live Cloudflare tunnel token is committed in plaintext in
  `mmlabs-online/deployment` `proxy/compose.yml` (consult Finding 8). Rotate it and move it out of the repo.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `docker build` (no build args) produces an image that serves the app on :3000 in local mode, answers unknown paths with `index.html`, and passes the `wget --spider` health check. | CI `image` job on the PR is green: it builds with no build args and runs `bash scripts/check-image.sh <ref>`, which (a) waits for `wget -q --spider http://127.0.0.1:3000/` inside the container, (b) checks `/some/deep/path` returns a body containing `id="root"`, (c) checks `/assets/does-not-exist.js` is a 404. If Docker is available locally: `docker build -t tudo:test . && bash scripts/check-image.sh tudo:test`. Reviewer reads `Dockerfile`: no `ENV VITE_*`, no `FIGMA_PUBLIC_URL`, runtime `EXPOSE 3000`, `HEALTHCHECK` = compose probe. Local mode = no Supabase URL baked in (check-image step (e) below on the no-arg image). |
| 2 | With the two `VITE_*` build args the bundle uses them; nothing else secret is baked in, and no secret value appears in the repo (R3). | CI `image` job also builds with dummy args `VITE_SUPABASE_URL=https://ci-dummy.invalid`, `VITE_SUPABASE_ANON_KEY=sb_publishable_ci_dummy` and runs `check-image.sh <ref> https://ci-dummy.invalid` → (e) asserts that string is in `/usr/share/nginx/html/assets/*.js`; the no-arg run asserts it is absent. check-image also asserts no `VITE_` in `docker image inspect` Config.Env / `docker history --no-trunc`, no `.env*`, no `sb_secret_`, no `*.map`. `bash scripts/check-public-supabase-env.test.sh` passes (run in the `ci` job). `grep -rnE 'eyJ[A-Za-z0-9_-]{20,}\.|sb_secret_|sb_publishable_[A-Za-z0-9]{20,}' --exclude-dir=node_modules .` on the diff finds nothing but the test's self-built fake JWTs (built from `{"role":"anon"}` at runtime, not literals). |
| 3 | `release.yml` mirrors stoktok's guards (on `main`, new higher version, secrets present), tags, pushes, verifies the digest and opens a deployment-repo PR that changes only `apps/tudocuatui/release.env`. | Side-by-side read against `/home/user/stoktok/.github/workflows/release.yml`: same trigger `release/v*`, same guard block (merge-base on `origin/main`, already-tagged, branch regex, tag exists, `sort -V` higher, `DH_USER/DH_TOKEN/DEPLOY_TOKEN` non-empty) plus the VITE guard; tag step before build; one `build-push-action` step `mingming21400/tudocuatui:<tag>`, `linux/amd64`; `verify pushed digest` does `docker pull …@$DIGEST` + `check-image.sh`; PR step writes `apps/tudocuatui/release.env` with `TUDOCUATUI_IMAGE=mingming21400/tudocuatui:$TAG@$DIGEST` and `TUDOCUATUI_VERSION=$TAG`, `git add` + the "only release.env changed" assert, branch `release/tudocuatui-$TAG`. `actionlint .github/workflows/*.yml` clean if available (else `npx --yes actionlint` / note it was not run). The written `TUDOCUATUI_IMAGE` value matches the deploy draft's regex (reviewer checks the regex against a sample string). |
| 4 | The deployment-repo drafts follow the `site`/`stoktok` pattern (network `web`, service `tudocuatui`, port 3000, health check, rollback) and pass `pr-scope`. | `diff` of `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` against `/home/user/deployment/.github/workflows/deploy-site.yml` shows only the substitutions listed in Approach step 6. `compose.yml`: `name: tudocuatui`, service `tudocuatui`, `image: ${TUDOCUATUI_IMAGE:?…}`, healthcheck `wget -q --spider http://127.0.0.1:3000/`, `networks: [tunnel]` → external `web`, no `ports`, no `environment`/`env_file`. pr-scope: branch `release/tudocuatui-v0.1.0` matches `^release/([a-z0-9-]+)-v[0-9]` → app `tudocuatui`; the release PR only touches `apps/tudocuatui/release.env`. |
| 5 | README explains the full release → deploy flow and Ming's one-time setup; D20 is recorded. | README "Deploy" section has: architecture line, one-time setup (list in "Ming verification" below), how to release (`git push origin main:release/vX.Y.Z`), what happens, rollback, how to add the `VITE_*` values after M-1, troubleshooting. No Pages instructions remain. `work/decisions.md` has D20 and D5 is marked superseded. `work/ming-todo.md` M-4 is rewritten. |
| 6 | Existing CI still passes; typecheck, format, tests and build are green. | `pnpm typecheck && pnpm format:check && pnpm test && pnpm build` locally; `ci` and `image` jobs green on the PR. |

## Ming verification after merge
One-time setup (also written into README "Deploy" and M-4):
1. **Docker Hub:** create repo `mingming21400/tudocuatui` with the visibility you choose (A2, default public). Make
   sure the token in `DOCKERHUB_TOKEN` has Read & Write on it (a repo-scoped token from stoktok would not cover it).
2. **Repo secrets** (TuDoCuaTui → Settings → Secrets → Actions): `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`,
   `DEPLOY_REPO_TOKEN` — already done (2026-11-09). `DEPLOY_REPO_TOKEN` = fine-grained PAT on
   `mmlabs-online/deployment` only, Contents R/W + Pull requests R/W (same as stoktok's).
3. **Setup PR on `mmlabs-online/deployment`** (a non-`release/*` branch): copy
   `deploy/deployment-repo/apps/tudocuatui/compose.yml` and `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`
   to the same paths; add `/apps/tudocuatui/  @didi-code0980` to `.github/CODEOWNERS`. Merge it: `deploy-tudocuatui`
   runs and skips ("no release.env yet").
4. **Cloudflare:** the published application `tudocuatui.mmlabs.online` must point to service **`http://tudocuatui:3000`**
   (HTTP, not HTTPS). Optional: a Cloudflare Access policy in front (A4).
5. **First release:** from an up-to-date `main`, `git push origin main:release/v0.1.0`. The `release` workflow tags
   `v0.1.0`, pushes the image and opens PR `release/tudocuatui-v0.1.0` on the deployment repo. Review and merge it;
   `deploy-tudocuatui` deploys and comments the outcome on the PR.
6. **Check:** open `https://tudocuatui.mmlabs.online` on a phone: the app loads in local mode (demo items, no login)
   until step 7. A deep URL (e.g. `/x/y`) also loads the app.
7. **After M-1** (D18): add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (stoktok Project URL and
   **anon/publishable** key only), cut the next release (`release/v0.1.1`), merge its deployment PR, and log in on the
   phone with the stoktok email + password (F-007 AC "prod URL works with login on a phone", D19).
8. If a Cloudflare **Pages** project `tudocuatui` was ever created under the old M-4, delete it (Workers & Pages →
   project → Settings → Delete).
9. Follow-ups only you can do (not blocking this ticket): rotate the tunnel token committed in
   `deployment/proxy/compose.yml`; decide the CLAUDE.md "Hosting" / "Risk tiers" wording (A7).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `Dockerfile` | New. Multi-stage: `build` (node 22 bookworm-slim, corepack pnpm, frozen lockfile, build args → `pnpm build`) and runtime `nginxinc/nginx-unprivileged:<pinned>-alpine` serving `dist/` on :3000 | Ticket scope; AC1, AC2 |
| `.dockerignore` | New. Keeps the context small and `.env*` out; keeps `.figma/make/site.json` | AC1/AC2 (consult Finding 5) |
| `docker/nginx.conf` | New. `listen 3000`, SPA fallback, `/assets/` 404 + immutable cache, `no-cache` on index.html, gzip, two security headers | AC1; ticket "nginx config". In `docker/`, not `deploy/` (which is docker-ignored) |
| `scripts/check-image.sh` | New. Image checks shared by `ci.yml` and `release.yml`: `check-image.sh <image-ref> [expected-supabase-url]` | AC1, AC2, AC3 (stoktok pattern, consult) |
| `scripts/check-public-supabase-env.sh` | New. Validates `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env: both empty → "local mode" notice, exit 0; otherwise all-or-none, URL format, anon/publishable only. Never prints values | AC2 / R3 (consult: wrong-key guard); keeps the bash logic testable |
| `scripts/check-public-supabase-env.test.sh` | New. Plain-bash cases (see Tests) | R8 spirit: the only R3 guard gets tests |
| `.github/workflows/release.yml` | New. stoktok's release.yml adapted for one image | Ticket scope; AC3 |
| `.github/workflows/ci.yml` | Modify. Add a step `bash scripts/check-public-supabase-env.test.sh` to `ci`; add job `image` (`needs: ci`) that builds twice without pushing and runs `check-image.sh` | AC1/AC2/AC6 verification in CI (A5) |
| `deploy/deployment-repo/README.md` | New. Path mapping table, CODEOWNERS line, setup-PR steps, "release.env is not drafted", "no hostname in either repo", route must be `http://tudocuatui:3000`, branch-protection note on rollback | Ticket scope; AC4 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | New. Service `tudocuatui` on external `web`, health check, no ports/secrets | Ticket scope; AC4 |
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | New. `deploy-site.yml` with substitutions | Ticket scope; AC4 |
| `README.md` | Replace "## Deploy (Cloudflare Pages)" with "## Deploy (home server, Cloudflare Tunnel)"; add rows for the new files to "Code map" | Ticket scope; AC5 |
| `work/decisions.md` | Append D20; in D5's row add "**Superseded by D20 (2026-11-09).**" | Ticket scope; AC5 |
| `work/ming-todo.md` | Rewrite M-4 (steps from "Ming verification" above); add the tunnel-token follow-up as an unticked item under Setup (M-9) | Ticket scope "update M-4"; follow-up only Ming can do |
| `.github/risk-tiers.yml` | Add High entries: `Dockerfile`, `.dockerignore`, `docker/**`, `.github/workflows/release.yml`, `deploy/**`; relabel the Pages comments as "legacy (D5, superseded by D20)" but keep the two entries | Consult Finding 7 (A6) |
| `.prettierignore` | **Only if** `pnpm format:check` touches files under `deploy/deployment-repo/`: add `deploy/deployment-repo/` so the drafts stay byte-identical to their deployment-repo targets. Record in impl-log | AC6 |

Not touched: `CLAUDE.md` (Ming's call, A7), `AGENTS.md`, `.figma/`, `vite.config.ts` (R10), `docs/feature-list.md`,
`docs/plan-M1.md` (historical; follow-up), `.node-version`, `public/`, any `src/` file, `work/backlog.md` (D16).

## Tests to write
No TypeScript logic changes, so no Vitest tests. Shell checks:

| Test (file › name) | Covers |
|---|---|
| `scripts/check-public-supabase-env.test.sh` › both empty → exit 0, output mentions local mode | Local-mode release allowed (A3) |
| › only URL set / only key set → exit 1 | All-or-none |
| › URL `http://x.supabase.co`, URL with path, URL with spaces → exit 1; `https://abc.supabase.co` → ok | URL format `^https://[A-Za-z0-9.-]+$` |
| › `sb_publishable_xxx` → 0; `sb_secret_xxx` → 1; `sb_other_xxx` → 1 | New-style keys |
| › JWT built in the test from `{"role":"anon"}` → 0; from `{"role":"service_role"}` → 1; malformed (`abc`, two segments, non-base64 payload) → 1 | Legacy JWT keys; payload base64url with/without padding |
| › stdout/stderr never contains the key or URL value passed in | No value printed |
| `scripts/check-image.sh` (run by CI `image` job, both builds) | AC1 health/deep path/404; AC2 dummy URL present/absent, no `.env*`, no `VITE_` in config/history, no `sb_secret_`, no `.map`, non-root user |

## Approach
1. **`.dockerignore`**: `node_modules`, `dist`, `coverage`, `.git`, `.github`, `.claude`, `work`, `docs`, `supabase`,
   `deploy`, `scripts`, `.env*`, `*.log`, `.plugins`, `.opencode-skills`, `.figma/*`, `!.figma/make/site.json`.
   Do **not** re-include `.env.example`. (`vite.config.ts` imports `./.figma/make/site.json`; R10: read, not edited.)
2. **`Dockerfile`**:
   - `FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build`, `WORKDIR /app`, `RUN corepack enable`.
     (glibc to match CI for Vite 8 / rolldown native bindings; never emulated.)
   - `COPY package.json pnpm-lock.yaml ./` → `RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile`
     → `COPY . .`.
   - `ARG VITE_SUPABASE_URL` / `ARG VITE_SUPABASE_ANON_KEY` (default empty) in this stage only, no `ENV`;
     `RUN pnpm build`. No typecheck/tests in the image (CI does them). Never set `FIGMA_PUBLIC_URL`.
   - Runtime: `FROM nginxinc/nginx-unprivileged:<current stable minor>-alpine` (pin a minor tag, e.g. `1.28-alpine`;
     the implementer confirms the tag exists and records it). `COPY docker/nginx.conf /etc/nginx/conf.d/default.conf`,
     `COPY --from=build /app/dist /usr/share/nginx/html`, `EXPOSE 3000`,
     `HEALTHCHECK CMD wget -q --spider http://127.0.0.1:3000/ || exit 1`. User stays 101.
3. **`docker/nginx.conf`**: `server { listen 3000; server_tokens off; absolute_redirect off; root /usr/share/nginx/html;`
   `location / { try_files $uri /index.html; }`, `location = /index.html { add_header Cache-Control "no-cache"; … }`,
   `location /assets/ { try_files $uri =404; add_header Cache-Control "public, max-age=31536000, immutable"; }`,
   `gzip on` for js/css/svg/json, `add_header X-Content-Type-Options nosniff always;` and
   `add_header Referrer-Policy strict-origin-when-cross-origin always;` (repeat in each location that has its own
   `add_header`, since nginx does not inherit them). No CSP (follow-up). Health probe is always `127.0.0.1`, never `localhost`.
4. **`scripts/check-image.sh <ref> [expected-url]`** (`set -uo pipefail`, stoktok style, `::error::` messages):
   secret-like env names in Config.Env (copied); no `VITE_` in Config.Env or `docker history --no-trunc`; no `.env*`
   (copied `find`); `Config.User` not empty/`0`/`root`; run detached with `--cap-drop ALL --security-opt no-new-privileges`
   (same as compose), poll `docker exec … wget -q --spider http://127.0.0.1:3000/` up to 30 s; deep path contains
   `id="root"`; `/assets/does-not-exist.js` fails (404); no `sb_secret_` and no `*.map` under the html root;
   (e) with `expected-url`: `grep -rqF` it in `assets/*.js`, without it: the dummy `ci-dummy.invalid` must be absent.
   `trap` removes the container.
5. **`scripts/check-public-supabase-env.sh`** and its test (see Tests). JWT check: take segment 2, `tr '_-' '/+'`,
   pad to a multiple of 4, `base64 -d`, require `grep -Eq '"role"[[:space:]]*:[[:space:]]*"anon"'`. Pure bash +
   coreutils (no jq needed).
6. **`.github/workflows/release.yml`**: copy stoktok's line for line, then: header comment for T-007 (secrets list
   adds the two optional `VITE_*`); `APP: tudocuatui`; guard step adds
   `VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}`, `VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}`
   to `env` and runs `bash scripts/check-public-supabase-env.sh` after the existing checks (a `::warning::` that
   this release is local mode when both are empty); one `build and push` step (`id: image`, `file: Dockerfile`,
   `platforms: linux/amd64`, `tags: …/tudocuatui:<tag>`, `build-args` from the two secrets, `provenance: false`,
   `sbom: false`, gha cache scope `image`); `verify pushed digest` = `docker pull "$NAMESPACE/tudocuatui@$DIGEST"` +
   `bash scripts/check-image.sh "$ref"` (plus the secret URL as 2nd arg when set); PR step writes
   `TUDOCUATUI_IMAGE` and `TUDOCUATUI_VERSION`, keeps `mkdir -p` + `git add` + the only-release.env assert; PR body
   drops "Apply database migrations before merging" and says "Merging runs deploy-tudocuatui on macbook-runner." and
   whether the build is local mode or Supabase mode. `actions/checkout@v4`, `persist-credentials: false`, as stoktok.
7. **`ci.yml`**: in `ci`, add `- run: bash scripts/check-public-supabase-env.test.sh`. New job `image` (`needs: ci`,
   `ubuntu-latest`, `permissions` inherited read): checkout, `docker/setup-buildx-action@v3`, two
   `docker/build-push-action@v6` steps (`load: true`, `push: false`, tags `tudocuatui:ci-local` and
   `tudocuatui:ci-supabase` with the dummy args, gha cache scope `image`), then `check-image.sh` for each. No Docker
   Hub login, no push, no `:latest`.
8. **Deployment drafts**:
   - `compose.yml` = `apps/site/compose.yml` with `name: tudocuatui`, service `tudocuatui`,
     `image: ${TUDOCUATUI_IMAGE:?TUDOCUATUI_IMAGE is unset - pass --env-file apps/tudocuatui/release.env}`, same
     healthcheck, plus `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `logging` json-file
     `max-size: 10m`, `max-file: "3"`. Header comment rewritten for TuDo.
   - `deploy-tudocuatui.yml` = `deploy-site.yml` with only: name/concurrency `deploy-tudocuatui`; paths
     `apps/tudocuatui/**`; `APP_DIR: apps/tudocuatui`, `PROJECT: tudocuatui`; `runs-on: [self-hosted, macbook-runner]` (A1);
     var `TUDOCUATUI_IMAGE`; pattern `^mingming21400/tudocuatui:v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?@sha256:[0-9a-f]{64}$`;
     messages/commit text "tudocuatui"; summary heading `### deploy-tudocuatui`; header comment. Keep `actions/checkout@v7`
     as in the deployment repo.
   - README as listed in Files; mirror stoktok's draft README; note that with deployment `main` protected and no
     `github-actions` bypass, an automatic rollback ends `restore-unpushed` (server restored, Ming reverts the
     release PR by hand), as in stoktok's runbook D5.
9. **Docs**: README "Deploy" rewrite (flow: `release/vX.Y.Z` push → GitHub runner builds/pushes →
   deployment PR → merge → `deploy-tudocuatui` on the home server → health check → rollback); one-time setup = the
   9 steps above; "VITE_* are baked at build time: change them → cut a new release"; "never set `FIGMA_PUBLIC_URL`";
   local run: `docker build -t tudo . && docker run --rm -p 3000:3000 tudo`. Remove the `_redirects`/`404.html` Pages
   note (nginx does the fallback). D20 row: *Hosting: self-hosted on the home server behind the shared cloudflared
   tunnel; image `mingming21400/tudocuatui` built by `release.yml` on GitHub's runner, deployed by
   `deploy-tudocuatui` in `mmlabs-online/deployment`; route `http://tudocuatui:3000`. Replaces D5. F-007 "preview
   deploy per PR" is dropped (no previews). Releases without the `VITE_*` secrets run in local mode.* Why: Ming
   2026-11-09, same flow as stoktok, one place for all mmlabs apps. Tickets: T-007, F-007, M-4.
10. Run `pnpm format`, then the four checks; `actionlint` if obtainable; `bash scripts/check-public-supabase-env.test.sh`;
    Docker steps if Docker is available, otherwise say so in impl-log (CI `image` job is the evidence).

Rules: **R1** untouched (no-arg image = local mode, verified by check-image). **R3** build args only, guard script,
`.dockerignore`, check-image. **R7** only the files above. **R8** checks + shell tests. **R9** no UI change.
**R10** `.figma/make/site.json` read only, `vite.config.ts` and `AGENTS.md` untouched, `FIGMA_PUBLIC_URL` never set.

## Changes vs the ticket's scope (for Ming's approval)
- C1. nginx config lives at `docker/nginx.conf` (ticket: "nginx config", no path).
- C2. New `scripts/check-image.sh` (stoktok has one; used by CI and release).
- C3. New `scripts/check-public-supabase-env.sh` + test: release refuses a non-anon key, a half-set pair or a bad URL.
- C4. `ci.yml` gets an `image` job (build + check, never push) and one test step. Ticket only asked that CI stays green.
- C5. `provenance: false` / `sbom: false` on the release build (stoktok uses defaults).
- C6. Compose adds `cap_drop: [ALL]`, `no-new-privileges` and log limits (site has none); `read_only` left as follow-up.
- C7. Deploy draft uses `runs-on: [self-hosted, macbook-runner]`, not `deploy-site`'s bare `self-hosted`.
- C8. `.github/risk-tiers.yml` gains the new High paths.
- C9. `ming-todo.md` gets M-9 (tunnel token rotation) besides the M-4 rewrite; D5's row is marked superseded.
- C10. `CLAUDE.md` is **not** edited (its "Hosting: Cloudflare Pages (D5)" line and the Pages wording under "Risk
  tiers" become stale) — Ming's call.
- C11. Possibly `.prettierignore` (only if the formatter rewrites the drafts).

## Specialist input used
`consult-software-architect.md`:
- Adopted: Finding 1 (copy stoktok release.yml, deploy-site.yml), 2 (strict `vX.Y.Z` regex), 3 (pr-scope mapping),
  5 (keep `site.json`, exclude `.env*`, never set `FIGMA_PUBLIC_URL`), 6 (CI image job), 7 (risk-tiers), 8 (tunnel
  token → follow-up M-9). All Dockerfile/nginx/`.dockerignore` recommendations, health probe on `127.0.0.1`, the
  key guard, check-image contents, `provenance` set deliberately, compose `cap_drop`/`no-new-privileges`.
- Adapted: the key guard moves into a tested script (C3) instead of inline bash; check-image also runs the
  container with the compose hardening flags and gets the dummy-URL check for AC2.
- Rejected / deferred: optional `APP_VERSION` → `dist/version.txt` (not asked; follow-up); `read_only` + tmpfs
  (cannot be verified without Docker in review; follow-up); multi-arch image (ticket says `linux/amd64`; A1);
  CSP header (follow-up, needs signed-URL/blob/Supabase `connect-src` design).

## Assumptions
Defaults chosen for the consult's open questions; Ming confirms them when approving.
- **A1 — Runner:** `deploy-tudocuatui` runs on `[self-hosted, macbook-runner]`, the host where stoktok runs on the
  same `web` network and tunnel (deployment `deploy-stoktok.yml`, `runner-check.yml`). An explicit label fails
  visibly instead of landing on another host. Image stays `linux/amd64` as the ticket says (stoktok parity; nginx
  runs fine emulated on Apple Silicon/OrbStack). Change to bare `self-hosted` or add `linux/arm64` if you prefer.
- **A2 — Docker Hub visibility:** `mingming21400/tudocuatui` is **public**. It holds exactly what the website serves
  (the anon key is public by design). If you want it private, the runner host's Docker must be logged in to Docker
  Hub (none of the deploy workflows has a login step); the plan does not change otherwise.
- **A3 — Release before M-1:** releases **without** the `VITE_*` secrets are allowed and run in local mode (demo
  items, data only in each browser), with a `::warning::` in the run and "local mode" in the deployment PR body.
  Reason: D18 defers M-1, and with the secrets but no `tudo_*` tables Supabase mode would be broken anyway. Setting
  only one of the two fails the release.
- **A4 — Cloudflare Access:** not part of this ticket; the plan works with or without it. Default: no Access, the
  site is public with password login (once M-1 is done). Adding Access (as stoktok) is a dashboard step you can take
  any time; it does not affect Supabase calls (they go to `*.supabase.co` directly).
- **A5 — CI image job:** included (C4). It mirrors stoktok's `images` job but never pushes, and it is the only place
  the Docker build is proven on every PR. Adds ~1–2 min to CI. If `ci` is a required check (M-3), `image` is not
  required unless you add it.
- **A6 — risk-tiers.yml:** updated here (C8): adds `Dockerfile`, `.dockerignore`, `docker/**`,
  `.github/workflows/release.yml`, `deploy/**` as High; keeps `public/_redirects` and `wrangler.toml` (harmless,
  comments say legacy). The file is not enforced yet (D10).
- **A7 — CLAUDE.md:** not edited (Ming's call). Proposed text for you: Stack → "Hosting: home server behind the
  shared Cloudflare Tunnel; image released by `release.yml`, deployed by `mmlabs-online/deployment` (D20)"; Risk tiers
  → "production deploy config (`Dockerfile`, `docker/`, `.github/workflows/release.yml`, `deploy/**`)". Recorded as
  a follow-up.
- **A8 — No previews:** F-007 "preview deploy per PR" is dropped and recorded in D20 (ticket's own flag). The CI
  `image` job is the per-PR build check; there is no per-PR URL.
- **A9 — Version numbering:** first release `v0.1.0`; tags are only created by `release.yml`. If the repo already has
  `vX.Y.Z` tags, the next release must be higher (stoktok guard).
- **A10 — Rollback push:** if deployment `main` is protected without a `github-actions` bypass (as for stoktok), a
  failed health check restores the old container but cannot push the revert (`restore-unpushed`); you then revert
  the release PR by hand. Same as stoktok; documented in the drafts' README.
- **A11 — Size:** ~550–650 changed lines, most of them near-verbatim copies of stoktok/deployment files
  (`deploy-tudocuatui.yml` ~140, `release.yml` ~150). One feature (deploy), so no split.
- Hotspot files shared with other open tickets: `README.md`, `work/decisions.md`, `work/ming-todo.md`, `ci.yml`.
  Rebase on `main` before the PR.

## Blocking questions
None. (A1–A11 are defaults for Ming to confirm at plan approval; none changes the shape of the plan.)

## Split proposal
None. Above the ~400-line guide, but a single feature and mostly copied boilerplate (A11). If Ming wants it
smaller: slice 1 = Dockerfile, nginx, `.dockerignore`, check scripts, CI `image` job, README local-run note; slice 2 =
`release.yml`, deployment drafts, README Deploy, D20, M-4.

## Follow-ups (not in this diff)
- Rotate the cloudflared tunnel token committed in `mmlabs-online/deployment` `proxy/compose.yml` (M-9).
- CLAUDE.md Hosting / Risk-tier wording (A7); `docs/plan-M1.md` still mentions Cloudflare Pages / M-4 Pages.
- Feature-list F-007 text still says Vercel/Pages + previews (D20 records the change).
- CSP header; compose `read_only` + tmpfs; `dist/version.txt` for "what is deployed".
