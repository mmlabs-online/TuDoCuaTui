# TuDoCuaTui (spaceM project rules)

Personal wardrobe tracker ("Tủ đồ của tôi"): a React SPA plus a Node API (`server/`) over self-hosted
Postgres, with photos on Google Drive and sign-in through mmlabs Identity. The app always runs against the Node
API; there is no local or demo mode (D44).

- Scope: [docs/feature-list.md](docs/feature-list.md) is the source of truth. If a ticket and the feature list
  disagree on scope, the feature list wins unless `work/decisions.md` records a change; flag the conflict.
- Milestone plan: [docs/plan-M1.md](docs/plan-M1.md). Data model: [docs/data-model.md](docs/data-model.md).
- Workflow (tickets, agents, commands): see **Workflow** below.

## Repo
- Remote: `git@github.com:mmlabs-online/TuDoCuaTui.git`, default branch `main`, write mode `direct`.
- Backlog: `work/` (adapter `markdown-work-dir`).

## Stack
- React 19, Vite 8, Tailwind CSS v4, TypeScript 5.7, formatter oxfmt.
- Node 22 and pnpm 10 (pinned in `.mise.toml`).
- Node API in `server/` (`/api`, `/healthz`, `/readyz`), self-hosted Postgres (`db/migrations/`), Google Drive photos,
  mmlabs Identity sign-in; data layer in `src/data/`.
- Hosting: the home server, Docker + Cloudflare Tunnel (decision D20 in `work/decisions.md`).

Do not change the stack without Ming's explicit decision.

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Typecheck: `pnpm typecheck`. `pnpm build` does **not** typecheck.
- Build: `pnpm build`
- Format: `pnpm format` (check: `pnpm format:check`)
- Tests: `pnpm test` (from F-005)

**Checks** = every one of these that exists at the time: typecheck, `pnpm format:check`, `pnpm test`, `pnpm build`.

## Architecture rules (reviewer enforces these)

| ID | Rule |
|---|---|
| R1 | **API only, no fallback.** Every data access goes through `WardrobeRepo` (`src/data/`); the only implementation is the HTTP repo against the Node API (`/api`). Components never call `fetch` for data directly. There is no local/demo mode: when `/healthz` does not answer as the Node server, the app shows an error with retry (D44). Local development uses `pnpm dev` with the dev-only token proxy (`dev/devTokenProxy.ts`); its token never reaches the browser. |
| R2 | **RLS on every table.** Schema changes are a new file in `supabase/migrations/` with RLS in the same migration; never edit an applied migration; regenerate `src/types/database.ts`. Applying migrations to the real project is Ming's step. |
| R3 | **Only the anon key reaches the browser.** Nothing secret in client code or in a `VITE_*` variable (no service role key, no LLM key). Server-side secrets live only in Supabase Edge Function secrets. |
| R4 | **Photos are private.** Storage paths are `{user_id}/{item_id}/{uuid}.jpg` in bucket `wardrobe`; display only through signed URLs; never write outside the caller's own folder. |
| R5 | **Derived values are never stored.** `wear_count` and `last_worn` come from `wear_logs` (view `items_with_stats`). |
| R6 | **Vietnamese UI copy, English code.** Labels ↔ DB ids only through `src/data/mappers.ts` / `src/constants/`. After F-004, UI copy lives in one place per feature. |
| R7 | **Stay inside the ticket's plan.** Anything else found goes to the follow-ups list, not into the diff. |
| R8 | **No PASS without green checks.** New or changed pure logic (parsers, mappers, filters, validation, repo) has unit tests once F-005 has landed. |
| R9 | **Mobile-first.** UI changes work at a 390px viewport and in dark mode. |
| R10 | Retired (D44): Figma Make was removed. |

## Risk tiers
- High: `supabase/migrations/**` (DB migrations, RLS), auth flow in `src/features/auth/**`, production
  deploy config (Cloudflare Pages config, `public/_redirects`, `.github/workflows/deploy*`).
- `.github/risk-tiers.yml`: draft tier file (F-003), reviewed by Ming (D10), not yet enforced by CI.

## Workflow

<!-- spaceM project-kit 1.0.1 — inserted by /apply-kit. Settings: `.claude/loop.config.md`. Kit files: `.claude/kit.lock`. -->

One orchestrated loop per ticket. **The main session is the orchestrator** (subagents cannot dispatch other subagents), driven by `/run`.

```
/ticket "..."   →  BACKLOG
/bug "..."      →  BACKLOG (BUG-xxx; then: record PR, record another, or fix the batch now)
/run [ID]       →  CONSULT → PLAN ─(gate: High path → Ming approves)→ IMPLEMENT → REVIEW ─PASS→ DONE → PR → Ming merges → MERGED
                                                                         ^            │
                                                                         └── REWORK ──┘  max 2 reworks → ESCALATED (stop, ask Ming)
/solo "..."     →  small direct change outside the loop (logged in work/solo-log.md)
/status         →  board summary
```

- Each ticket runs on branch `ticket/<ID>` (or the session's mandated branch). The board `work/backlog.md` changes only on `main`; row order is run order.
- A ticket is claimed with `Claimed by: claude@<timestamp>` and every run appends to `## Handoff` in its `ticket.md`.
- **Ming approves and merges every PR — agents never merge.**
- Project settings (ticket prefix, scope sources, checks, consult table, review triggers, High paths, guardrails): `.claude/loop.config.md`.
- Ticket states: `BACKLOG` → `PLANNING` → `IN_PROGRESS` → `REVIEW` → `DONE` → `MERGED`, plus `REWORK`, `BLOCKED`, `ESCALATED`.

Files: `work/backlog.md` (board), `work/ming-todo.md` (Ming-only steps), `work/decisions.md`, `work/solo-log.md`,
`work/templates/`, `work/tickets/<ID>/` (`ticket.md`, `consult-*.md`, `plan.md`, `impl-log.md`, `review.md`, review-agent files, `escalation.md`).

Kit-managed files (`.claude/commands/`, `.claude/agents/`, `work/templates/`) come from spaceM `skills-library/project-kit`; change them there, not here, so every project gets the fix.

Ticket IDs: `F-xxx` / `F-xxx.n` from the feature list (`.n` = a split); `T-xxx` for tickets that are not in the
feature list; `BUG-xxx` for bugs (`/bug`, D42): every bug fix ships with a regression test that fails before the fix.
Unattended: `/loop /run` keeps picking the next runnable ticket until nothing is runnable.

**Claude Code only** (Ming, 2026-11-07, decision D15): Antigravity does not work on this project. Claude
plans, implements, writes the tests and reviews. Workspace routing that sends test writing to Antigravity
does not apply here.

## Conventions
- Commits: `<ID>: <imperative summary>` for ticket work; `solo: …` for `/solo`; otherwise conventional style.
- Secrets: only in `.env.local` (git-ignored) and the hosting dashboard. `.env.example` lists names with no values.
