## Attempt 1 — 2026-11-07 — security-ai-generated-code-auditor

**Findings**
- 🟡 `.github/risk-tiers.yml:16` — only `.github/workflows/deploy*` is High. Any other workflow (e.g. `release.yml`, or later edits to `ci.yml`) can add `secrets.*`, `pull_request_target`, write `permissions:` or deploy steps and stay Medium. A name convention is not a control; use `.github/workflows/**` (plan A5 deferred this to Ming).
- 🟡 `risk-tiers.yml:6-22` — missing workspace-§7 secrets-handling paths: `.gitignore` (holds `.env*`; dropping it allows committing env files), `.env.example` (adding a `VITE_*` name is the R3 vector), `vite.config.ts` (`envPrefix`/`define` can push non-VITE env into the bundle), `src/vite-env.d.ts`. Also mail sending: future `supabase/config.toml`, `supabase/templates/**` (auth email settings/templates). No money paths exist yet.
- 🟡 `risk-tiers.yml:23-25` — `work/**` as Low includes `work/decisions.md` and plan approvals (governance). Once `auto_merge: on`, a decision change could auto-merge. Keep `work/decisions.md` ≥ Medium.
- 🟡 `.figma/make/site.json` (`customScripts`) is injected verbatim into `index.html` by `vite.config.ts:104-129` — arbitrary script in the prod page, Medium by default. Consider High.
- 💭 `ci.yml:20-22` — actions pinned to major tags (`@v4`), not SHAs; `pnpm/action-setup` is third-party. Low impact (`contents: read`, no secrets); SHA pins + Dependabot are the hardening step.
- 💭 `ci.yml:20` — checkout keeps `persist-credentials` (default true); set `persist-credentials: false`, no step needs the token.
- 💭 `package.json:30` — `packageManager` has no `+sha512` integrity suffix.

**Clean:** no `pull_request_target`, no `${{ github.event.* }}` in `run:`, `permissions: contents: read`, no secrets/env in the workflow; fork PRs get a read-only token. Prod build has no sourcemaps and CI builds in local mode (no `VITE_*`), so nothing leaks to logs or bundle (R3 holds). `.gitattributes` keeps LFS/`-text` rules effective (later lines override `* text=auto eol=lf`).

**Recommendations**
1. Widen the workflow glob to `.github/workflows/**`; add `.gitignore`, `.env*`, `vite.config.ts`, `src/vite-env.d.ts`, `supabase/config.toml`, `supabase/templates/**` to High (workspace §7 secrets handling, prod deploy config, mail sending; R3).
2. Take `work/decisions.md` out of Low.
3. Optional hardening: SHA-pin actions and set `persist-credentials: false`.

**Risks**
- Not enforced yet: until a CI step computes tiers the file is advisory, and people may assume enforcement.
- `pnpm install` in CI runs dependency lifecycle scripts; pnpm 10 blocks dependency build scripts by default, which mitigates.

**Open questions**
1. All workflows High? Default: yes.
2. `src/data/repo.ts` (storage access) High? Bucket policies are in migrations (already High). Default: no, Medium.
3. SHA pinning now or follow-up? Default: follow-up ticket.
