# T-007: Self-host on the home server via Cloudflare Tunnel, with the stoktok release/deploy CI/CD

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | F-007 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-09 |
| Claimed by | claude@2026-11-10T00:56:23Z |
| PR | — |

## Goal
TuDo runs at `https://tudocuatui.mmlabs.online` from the home server, deployed the same way as stoktok: a
`release/vX.Y.Z` push builds a Docker image on GitHub's runner, pushes it to Docker Hub and opens a PR on
`mmlabs-online/deployment`; merging that PR deploys it with a health check and automatic rollback.

## Feature reference
`docs/feature-list.md` F-007 (Deploy: "Deploy to Vercel or Cloudflare Pages (owner decides); preview deploy per
PR; env vars configured"). This ticket changes the hosting choice: **D5 (Cloudflare Pages) is replaced** by
self-hosting behind the shared cloudflared tunnel. Ming asked for this on 2026-11-09 ("ok, và cả setup CI CD
tương tự stoktok") with a Cloudflare published-application route `tudocuatui.mmlabs.online` → container
`tudocuatui:3000`. **Conflict to flag:** F-007's "preview deploy per PR" is lost (no Pages previews).
Reference implementation (read-only): `mmlabs-online/stoktok` `.github/workflows/release.yml` and
`deploy/deployment-repo/`; `mmlabs-online/deployment` `docs/app-release.yml`, `apps/site/` (static nginx on
:3000, the closest match), `.github/workflows/deploy-site.yml`, `pr-scope.yml`, `proxy/compose.yml`.

## Scope
In this repo:
- `Dockerfile` (+ `.dockerignore`, nginx config): multi-stage — Node 22 + pnpm (frozen lockfile) runs
  `pnpm build`; runtime is a static web server on **:3000** (no published ports) serving `dist/` with an
  `index.html` fallback, suitable for a `wget --spider http://127.0.0.1:3000/` health check.
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are **build args** (baked at build time); built without them,
  the image runs in local mode.
- `.github/workflows/release.yml` following stoktok's: `release/vX.Y.Z` branch (commit on `main`, new and higher
  version), creates the tag, builds and pushes `mingming21400/tudocuatui:vX.Y.Z` (linux/amd64), verifies the
  pushed digest, and opens `release/tudocuatui-vX.Y.Z` on `mmlabs-online/deployment` changing only
  `apps/tudocuatui/release.env` (`TUDOCUATUI_IMAGE=…:vX.Y.Z@sha256:…`). Secrets are only referenced by name.
- `deploy/deployment-repo/` drafts, mirroring stoktok's: `apps/tudocuatui/compose.yml` (service `tudocuatui`,
  external network `web`, health check, no secrets), `.github/workflows/deploy-tudocuatui.yml` (same flow as
  `deploy-site.yml`), a README with the CODEOWNERS line and the setup-PR steps.
- README "Deploy" section rewritten for this flow; record decision D20 (replaces D5) and update M-4.

## Out of scope
- Opening or merging anything on `mmlabs-online/deployment` (Ming copies the drafts in a setup PR).
- Cloudflare dashboard, Docker Hub, GitHub secrets (Ming steps), the tunnel itself (`proxy/`).
- Per-PR preview deploys; Supabase changes (D18/D19: password login needs no Redirect URL).

## Acceptance criteria
- [ ] `docker build` (no build args) produces an image that serves the app on :3000 in local mode, answers
      unknown paths with `index.html`, and passes the `wget --spider` health check.
- [ ] With the two `VITE_*` build args the bundle uses them; nothing else secret is baked in, and no secret
      value appears in the repo (only the anon key may reach the browser, R3).
- [ ] `release.yml` mirrors stoktok's guards (on `main`, new higher version, secrets present), tags, pushes,
      verifies the digest and opens a deployment-repo PR that changes only `apps/tudocuatui/release.env`.
- [ ] The deployment-repo drafts follow the `site` / `stoktok` pattern (network `web`, service name
      `tudocuatui`, port 3000, health check, rollback) and pass `pr-scope`.
- [ ] README explains the full release → deploy flow and Ming's one-time setup; D20 is recorded.
- [ ] The existing CI (`ci.yml`) still passes; typecheck, format, tests and build are green.

## Technical notes
- High tier (production deploy config, `.github/workflows/`): plan approval; security review at REVIEW.
- Cloudflare route must be `http://tudocuatui:3000` (not `https://`): cloudflared talks plain HTTP to the
  container on the `web` network.
- Do not use `vite preview` / `pnpm dev` as the server (dev-only, host checks).
- Ming steps (to list in the plan): Docker Hub repo `mingming21400/tudocuatui`; repo secrets
  `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DEPLOY_REPO_TOKEN`, and the two `VITE_*` values; setup PR on the
  deployment repo; the Cloudflare route; M-1 before passing the `VITE_*` values.
- Risk: the image (with the anon key baked in) is on Docker Hub; the anon key is public by design, but the
  Docker Hub repo visibility should be decided.

## Test plan
- Local: `docker build` and run the container, `curl` `/` and a deep path, health check command; build with
  dummy `VITE_*` args and grep the bundle for them.
- Workflow: `actionlint` if available; review against stoktok's release.yml.
- Manual (Ming): first `release/v0.1.0`, merge the deployment PR, open `https://tudocuatui.mmlabs.online`.

## Notes / answers from Ming
- 2026-11-09: Ming set up (draft) the Cloudflare published application `tudocuatui.mmlabs.online` → service
  `tudocuatui:3000`, and asked for "setup CI CD tương tự stoktok".

- 2026-11-09: Ming added the repo secrets `DEPLOY_REPO_TOKEN`, `DOCKERHUB_TOKEN`, `DOCKERHUB_USERNAME` to TuDoCuaTui (same names as stoktok). The two `VITE_SUPABASE_*` values are not added yet (they wait for M-1).

- 2026-11-10: Plan approved (2026-11-10) — Ming: "approve"; assumptions A1–A11 accepted as the plan's defaults (runner [self-hosted, macbook-runner], public Docker Hub repo, local-mode releases allowed before M-1, no Cloudflare Access, CI image job, risk-tiers updated, CLAUDE.md untouched, no previews, first release v0.1.0).

## Handoff

### 2026-11-09 — claude — BLOCKED
- Done: consult (software-architect) saved; plan.md READY with changes C1–C11 and assumptions A1–A11 (runner, Docker Hub visibility, release before M-1, Access, CI image job, risk-tiers, CLAUDE.md, no previews, versions, rollback, size).
- In progress / next: Ming approves the plan (and confirms or changes A1–A11); then /run implements.
- Gotchas: tunnel token in deployment/proxy/compose.yml is plaintext (M-9 proposed); CLAUDE.md Hosting line goes stale (Ming's call).
