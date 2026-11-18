# Loop config — TuDoCuaTui

Project-specific settings for the spaceM project-kit commands (`/run`, `/ticket`, `/bug`, `/solo`, `/status`, `/idea`)
and the `planner` / `implementer` / `reviewer` agents. Written by `/apply-kit`, then owned by this project:
a kit upgrade never overwrites this file. Keep it short; rules themselves live in `CLAUDE.md`.

## Identity
- Ticket prefix: `T` (tickets `T-001`…; bugs `BUG-001`…).
- Ticket IDs: `F-xxx` from `docs/feature-list.md` for a feature-list item (`F-xxx.n` for a split); `T-xxx` for
  everything else; `BUG-xxx` for bugs (`/bug`, D42).
- Owner: Ming. Reports to Ming in Vietnamese. Ming merges every PR; agents never approve, merge or enable auto-merge.
- **Claude Code only** (D15): Antigravity does not work on this project.

## Scope sources
<!-- Files the planner quotes. Order = precedence. -->
- `docs/feature-list.md` (source of truth for scope; it wins over a ticket unless `work/decisions.md` records a change)
- `work/decisions.md`
- `docs/plan-M1.md` (milestone plan), `docs/data-model.md` (data model)

## Prepare
- `pnpm install --frozen-lockfile`

## Checks
| Check | Command |
|---|---|
| format | `pnpm format:check` (fix with `pnpm format` first) |
| typecheck | `pnpm typecheck` (`pnpm build` does not typecheck) |
| test | `pnpm test` |
| build | `pnpm build` |

Bug test level: unit test (Vitest, jsdom). CSS, CSP and real browser APIs are invisible to jsdom: add a one-off
Playwright check recorded in impl-log (Playwright is not a repo dependency yet, D42).

## Plan approval gate
- Policy: `high-paths`

## High paths
<!-- Mirror of `high:` in .github/risk-tiers.yml. -->
- `db/migrations/**`, `server/**`
- `Dockerfile`, `.dockerignore`, `docker/**`, `deploy/**`, `scripts/check-image.sh`
- `.github/workflows/deploy*`, `.github/workflows/release.yml`, `.github/risk-tiers.yml`
- `public/_redirects`, `wrangler.toml` (legacy Cloudflare Pages)

## Consult
<!-- Area → specialist agent (read-only, at PLAN). Other areas in use: `data`, `security` (no consult). -->
| Area | Agent |
|---|---|
| architecture | `software-architect` |
| db | `database-optimizer` |
| ui | `frontend-developer` |
| ux | `ux-architect` |

## Review triggers
<!-- Run in parallel with `reviewer`. A 🔴 finding turns PASS into REWORK. -->
| Agent | Output file | Areas | Changed paths |
|---|---|---|---|
| `security-ai-generated-code-auditor` | `security-review.md` | security | `server/`, `db/migrations/`, `Dockerfile`, `scripts/check-image.sh`, `deploy/`, `src/data/repo.ts`, `src/data/repo.http.ts`, `**/*.sql`, `.env.example`, `vite.config.ts`, `public/_redirects`, `.github/workflows/` |

## /solo limits
- The data layer contract (`WardrobeRepo`), secrets, and any High path.

## Domain focus
- R1: every data access through `WardrobeRepo`; no component calls `fetch` for data; no local/demo fallback (D44).
- Vietnamese diacritics and `đ`, empty and null fields, UTC vs UTC+7 dates.
- Partial failures in batch operations (bulk photo import), photo access through the API/Drive only.
- UI: works at a 390px viewport and in dark mode (R9); Vietnamese copy only through `src/data/mappers.ts` /
  `src/constants/` (R6); derived values (`wear_count`, `last_worn`) never stored (R5).
- Files other open tickets also edit (e.g. `src/App.tsx`) are hotspots: note them in the plan.

## Guardrails
- Never read `.env*` values; never touch the hosting dashboard or the home-server deploy by hand.
- Never apply migrations to the production database (Ming's step); never run `supabase db push` or `supabase link`.
