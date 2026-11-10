# Consult — software-architect — T-007 (2026-11-09)

## Findings
1. **Which pattern to copy.** Use stoktok's `release.yml` (`/home/user/stoktok/.github/workflows/release.yml`), not `docs/app-release.yml`. The template triggers on a tag push, does no guards and no digest check, and it has a first-release bug: `git commit -am` does not pick up a new, untracked `apps/<app>/release.env`. Stoktok's version does `mkdir -p` + `git add` + "only release.env changed" and avoids this. On the deployment side, copy `deploy-site.yml` (static site with one image, rollback, PR comment). Do not copy `deploy-stoktok.yml`, which has env-file, launchd and environment-secret logic TuDo doesn't need.
2. **Validation regexes on the deployment side.** `deploy-site` accepts `vX.Y[.Z]`. `deploy-calechip` and `deploy-recordin` require `vX.Y.Z`. Stoktok's guard only produces `vX.Y.Z`, so use the strict pattern: `^mingming21400/tudocuatui:v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?@sha256:[0-9a-f]{64}$` on `TUDOCUATUI_IMAGE`.
3. **pr-scope.** It takes the app name from `^release/([a-z0-9-]+)-v[0-9]`. So `release/tudocuatui-vX.Y.Z` maps to `apps/tudocuatui/`, and the release PR passes if it only writes `apps/tudocuatui/release.env`. The setup PR (non-`release/*` branch) is not checked. Merging it triggers the new `deploy-tudocuatui`, which skips because there is no `release.env` yet. This matches stoktok's draft README.
4. **Runner labels are inconsistent.** `deploy-site`, `deploy-proxy` and calechip use `runs-on: self-hosted`. stoktok and runner-check use `[self-hosted, macbook-runner]` (Mac, OrbStack). TuDo must deploy on the same Docker host as cloudflared and the `web` network. Stoktok's own CLAUDE.md still says "WSL2 home server", but deployment says Mac.
5. **R10 / Vite constraints that affect the Dockerfile:**
   - `vite.config.ts` imports `./.figma/make/site.json` and reads `package.json`. **`.dockerignore` must not exclude `.figma/make/site.json`**, or the build fails. Reading `.figma` in the image build is fine; editing it is not.
   - `base` comes from `FIGMA_PUBLIC_URL`. It must never be set in the Dockerfile or the workflow.
   - `vite build` runs in production mode, so no sourcemaps and minified output. `site.json` has `robots.index:false`, so `robots.txt` and the noindex meta are emitted.
   - Vite loads `.env`, `.env.local` and `.env.production` from the project root. If a dev's `.env.local` reaches the build context, a "no build args" image silently becomes Supabase mode and fails AC1. **`.dockerignore` must exclude `.env*`**; don't re-include `.env.example`, it isn't needed.
6. **`ci.yml`.** It runs on PRs and on pushes to `main` only, so a `release/v*` push does not run it. The guard that the commit is already on `main` means CI already ran on that SHA. Nothing in CI builds the Docker image today, so a broken Dockerfile would only show up at release time.
7. **`.github/risk-tiers.yml`.** It marks only `.github/workflows/deploy*`, `public/_redirects` and `wrangler.toml` as High. `release.yml`, `Dockerfile`, the nginx config and `deploy/**` are not covered. CLAUDE.md "Stack → Hosting: Cloudflare Pages (D5)" and its Risk tiers paragraph also become stale.
8. **Out of scope, but a real problem: a live Cloudflare tunnel token is committed in plaintext** in `/home/user/deployment/proxy/compose.yml` (`--token eyJ…`). Anyone with read access to that repo can run the tunnel. This goes to Ming as a follow-up: rotate the token and move it to a runner-side env file or secret. Not part of this diff.

## Recommendations
- **Dockerfile (AC1, AC2, R3, R10):**
  - Builder stage: `FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build`, then `corepack enable`.
    - The output is static, so the build never runs emulated, even if arm64 is added later.
    - Use glibc to match CI/ubuntu for Vite 8's rolldown native bindings; an alpine builder risks a musl binding mismatch.
    - Copy `package.json` + `pnpm-lock.yaml`, then `pnpm install --frozen-lockfile` (cache mount on the store), then `COPY . .`.
    - Declare `ARG VITE_SUPABASE_URL` / `ARG VITE_SUPABASE_ANON_KEY` **in the build stage only**, without `ENV`, then `RUN pnpm build`. Build args are visible to `RUN` as env, so Vite picks them up, and they never reach the final stage's config or history.
    - Do not run typecheck or tests in the image; CI does that.
  - Runtime stage: `nginxinc/nginx-unprivileged:<pinned>-alpine`.
    - Runs non-root (uid 101), so it needs no capabilities on :3000.
    - The alpine variant includes busybox `wget`. The Debian nginx image has no wget, so the compose health check would fail.
    - `COPY --from=build /app/dist /usr/share/nginx/html` and replace `/etc/nginx/conf.d/default.conf`.
    - `EXPOSE 3000`, optional `HEALTHCHECK` with the same command as compose.
  - nginx config:
    - `listen 3000;` plus `server_tokens off; absolute_redirect off;` (avoids redirects to `:3000` behind the tunnel).
    - `location / { try_files $uri $uri/ /index.html; }`
    - `location = /index.html { add_header Cache-Control "no-cache"; }`
    - `location /assets/ { try_files $uri =404; add_header Cache-Control "public, max-age=31536000, immutable"; }` — **a missing hashed asset must 404, not return index.html as JS** (stale tabs after a deploy).
    - `gzip on` for js/css/svg/json.
    - `X-Content-Type-Options nosniff` and `Referrer-Policy strict-origin-when-cross-origin`. Leave CSP as a follow-up: signed photo URLs, `blob:`, the Supabase `connect-src`.
  - Health probe: always `http://127.0.0.1:3000/`, never `localhost`. busybox may resolve `::1`, and nginx listens on IPv4 only unless you add `listen [::]:3000`.
- **`.dockerignore`:** `node_modules`, `dist`, `coverage`, `.git`, `.github`, `.claude`, `work`, `docs`, `supabase`, `deploy`, `scripts`, `.env*`, `*.log`, `.figma/design-context`, `.plugins`, `.opencode-skills`. Keep `.figma/make/site.json`: either don't ignore `.figma`, or use `.figma/*` + `!.figma/make/site.json`.
- **`release.yml` (AC3):**
  - Copy stoktok almost line for line: `APP: tudocuatui`, `NAMESPACE: mingming21400`, one build step `tags: mingming21400/tudocuatui:${tag}`, `platforms: linux/amd64` (per ticket), gha cache.
  - Pass `build-args` from **secrets** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Use secrets rather than vars for consistency with the ticket and log masking, even though both values are public in the bundle.
  - Extend the guard step:
    - Fail if **exactly one** of the two is set.
    - Validate the URL against `^https://[A-Za-z0-9.-]+$`.
    - **Reject anything that is not an anon/publishable key** (R3): `sb_` keys must start with `sb_publishable_`. For a legacy `eyJ…` JWT, base64-decode the payload and require `"role":"anon"`. This catches a pasted service_role key before it is baked into a public bundle.
    - Pass nothing else as a build arg. Optionally add a non-secret `APP_VERSION` arg written to `dist/version.txt` so you can check what is deployed.
  - `verify pushed digest`: `docker pull mingming21400/tudocuatui@$DIGEST`, then `bash scripts/check-image.sh "$ref"`.
  - Deployment-repo step: writes `TUDOCUATUI_IMAGE=mingming21400/tudocuatui:$TAG@$DIGEST` and `TUDOCUATUI_VERSION=$TAG`, keeps stoktok's `git add` + "only `apps/tudocuatui/release.env`" assert, branch `release/tudocuatui-$TAG`. The PR body should drop stoktok's "apply migrations" sentence, or reword it for M-1.
- **`scripts/check-image.sh <ref>` (TuDo version):**
  - No secret-like env names in `Config.Env`.
  - No `.env*` files in the image.
  - `Config.User` is non-root.
  - Run the container and wait for `docker exec … wget -q --spider http://127.0.0.1:3000/`.
  - A deep path (`/a/b`) returns the index.html body; check for `id="root"`.
  - `/assets/does-not-exist.js` returns 404.
  - `grep -r` under the html root finds no `sb_secret_`.
- **`ci.yml` (AC6):** add a separate `image` job (`needs: ci`). It builds with no build args and `load: true, push: false`, then runs `check-image.sh`. Never push from CI and never push `:latest`; only immutable release tags exist. This catches Dockerfile breakage before a release branch. If the planner treats this as scope creep, list it as a follow-up, but it is cheap.
- **Deployment drafts (AC4)** go in `deploy/deployment-repo/`:
  - `apps/tudocuatui/compose.yml`: `name: tudocuatui`; service `tudocuatui` (the service name is the DNS alias cloudflared uses, `http://tudocuatui:3000`); `image: ${TUDOCUATUI_IMAGE:?…}`; `restart: unless-stopped`; the same healthcheck as site; `networks: [tunnel]` → external `web`; json-file log limits. No ports and no env.
  - Optional hardening, only if verified locally: `read_only: true` + `tmpfs: [/tmp, /var/cache/nginx]`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`.
  - `.github/workflows/deploy-tudocuatui.yml`: `deploy-site.yml` with `APP_DIR`, `PROJECT`, var name, regex and messages substituted, and the same `runs-on` as `deploy-site`/`deploy-proxy` (see open question 1).
  - README: path mapping table, CODEOWNERS line `/apps/tudocuatui/ @didi-code0980`, "release.env is not drafted", "no hostname in either repo (cloudflared is remotely managed)", and the route must be `http://tudocuatui:3000`.
- **Docs (AC5):**
  - D20 replaces D5 and records that F-007's "preview per PR" is dropped. Per CLAUDE.md, the feature list wins unless `decisions.md` records the change, and D20 is that record.
  - Rewrite M-4.
  - Flag to Ming that the CLAUDE.md "Hosting" line and the Pages references in its Risk tiers paragraph are stale. Updating CLAUDE.md is Ming's call; otherwise list it as a follow-up.
  - Optionally add `Dockerfile`, `.github/workflows/release.yml` and `deploy/**` to `risk-tiers.yml` High.

## Risks
- **Silent local-mode production.** Until the two secrets exist (they wait for M-1), a release ships a public site with demo data and no login. The data is per-browser localStorage, so the risk is confusion, not exposure. Decide whether release should require the two values.
- **Wrong key baked in.** A service_role key pasted into `VITE_SUPABASE_ANON_KEY` would be public on Docker Hub and the website. Only the guard in the release workflow stops this.
- **Pulling a private image.** If the Docker Hub repo is private, the runner host's Docker must be logged in. None of the deploy workflows has a login step, so the first deploy fails its pull (the deploy fails, with no rollback the first time).
- **Wrong runner.** A `runs-on` that lands on a host without the `web` network breaks `config`/`up`.
- **amd64 on an Apple-Silicon host.** It runs emulated, as stoktok already does. That is fine for nginx, but a `--platform=$BUILDPLATFORM` builder plus `linux/amd64,linux/arm64` would cost little.
- **Provenance attestations.** buildx's default provenance on push records build metadata. Builder-stage ARG values matter little here (the anon key is public anyway), but set `provenance: false` or `mode=min` deliberately rather than by default.
- Leaving out the `/assets/` 404 rule or the `no-cache` on index.html produces "blank page after deploy" bugs.
- The tunnel token in `deployment/proxy/compose.yml` (Finding 8).

## Open questions (for Ming)
1. Which host and runner label serves `web`/cloudflared: `self-hosted` (as `deploy-site`) or `[self-hosted, macbook-runner]`? And is it arm64, which would argue for a multi-arch image?
2. Docker Hub `mingming21400/tudocuatui`: public or private? It contains only what the site serves, so public is acceptable. Private needs `docker login` on the runner host.
3. Before M-1, should `release.yml` refuse to release without both `VITE_*` values, or allow local-mode releases (with a notice)?
4. Should `tudocuatui.mmlabs.online` sit behind Cloudflare Access like stoktok, or be public behind the password login only?
5. Is it acceptable to add a CI `image` build/check job to `ci.yml` in this ticket?
6. Should CLAUDE.md's Hosting and Risk-tier lines and `risk-tiers.yml` be updated here, or as a follow-up?
