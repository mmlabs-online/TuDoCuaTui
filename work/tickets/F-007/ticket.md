# F-007: Deploy to production with per-PR previews

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | F-001 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-08T14:07:09Z |
| PR | — |

## Goal
The app has a production URL that Ming can open on a phone and log in to with a magic link.

## Feature reference
`docs/feature-list.md` F-007. Decisions: `work/decisions.md`.

## Scope
- Host: **Cloudflare Pages** with Git integration (decision D5).
- Agent: SPA fallback (`public/_redirects`: `/* /index.html 200`), pinned Node/pnpm for the Pages build
  (for example `.node-version`; the build command uses `pnpm install --frozen-lockfile && pnpm build`, output `dist`),
  and a README "Deploy" section with the exact dashboard steps Ming follows (M-4).
- Previews per PR come from Pages' Git integration. Preview builds get **no** Supabase env vars (local mode).

## Out of scope
- A custom domain.
- A separate staging Supabase project.
- Clicking through the Cloudflare or Supabase dashboards (Ming, M-4).

## Acceptance criteria
- [ ] `pnpm build` output plus `_redirects` serves deep links from `index.html` (`npx wrangler pages dev dist`, or an equivalent static-server check).
- [ ] The README "Deploy" section lists every dashboard step: project, build command, output dir, Node version,
      production-only env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and the Supabase redirect URL.
- [ ] Nothing in the repo contains env values.
- Ming verification after merge (M-4): the production URL works with magic-link login on a phone; a PR preview
  opens in local mode.

## Technical notes
- Files: `public/_redirects`, `.node-version`, `README.md`.
- Previews without env vars cannot touch production data (decision D5).
- `vite.config.ts` uses `FIGMA_PUBLIC_URL` for `base`; make sure it is unset on the host.
- Expected tier: **High** (production deploy config). Ming reviews.

## Test plan
- Manual: phone login on the production URL; open a preview URL and see local mode.

## Notes / answers from Ming
- 2026-11-08: Plan approved (Ming, in chat with Annie: "Plan approved (F-007), chạy sau T-004"; recorded by Annie). Run only after T-004 is merged.
Waiting for Ming: plan approval (High tier)
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
### 2026-11-07 — claude — BLOCKED (plan approval)
- Done: consult + plan READY. Scope changes for Ming to approve: no `public/_redirects` (Pages' default SPA fallback; added back only if the deep-link check fails), build command `pnpm build`, `NODE_VERSION`/`PNPM_VERSION` dashboard vars; `_headers` deferred.
- Next: Ming approves → implement `.node-version` + README "Deploy (Cloudflare Pages)" runbook (M-4).
