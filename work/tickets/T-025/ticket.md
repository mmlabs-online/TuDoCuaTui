# T-025: Remove Figma Make and the local/demo mode

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | L |
| Milestone | M1 |
| Epic | E0 — Foundation |
| Areas | ui, data, architecture, security |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | M-28 |
| Attempts | 0 |
| Created | 2026-11-17 |
| Claimed by | — |
| PR | — |

## Goal
The app always runs against the Node API with real data and Identity sign-in. The Figma Make scaffolding and the
localStorage demo mode go away, so there is one code path and no silent fallback to demo data.

## Feature reference
None in `docs/feature-list.md`: this reverses its "Local mode (no env vars) uses localStorage + 16 demo items, so the
Figma Make preview keeps working". The change is decision **D44** (Ming 2026-11-17: "B. Tôi không còn nhu cầu demo
UI, tất cả chạy app thật với data thật"; one ticket, not split: "Gom chung"). D44 amends R1, R10 and the local-mode
clauses of D9, D21 and D30.

## Scope
- **Figma Make**: delete `.figma/` and `AGENTS.md`; remove the five `figma*` plugins and the `FIGMA_PUBLIC_URL` /
  `FIGMA_DEV_SERVER_HOST` handling from `vite.config.ts`. Move what `figmaSiteConfiguration` emits for production
  (`<title>`, `lang`, description/meta tags, `robots.txt` with noindex, the skip-link and its CSS) into static
  `index.html` / `public/` so the built output is equivalent. Rename the package `figma-make-app` → `tudocuatui`.
- **Local mode**: remove the localStorage `WardrobeRepo`, the demo items (`src/data/demo.ts`), the `local` branch of
  the mode switch (`src/data/mode.ts`), and UI branches that exist only for local mode. The app always uses the HTTP
  repo and the Identity sign-in.
- **Server unreachable**: when `/healthz` does not answer as the Node server, show a clear error state (Vietnamese
  copy, retry) instead of falling back to demo data.
- **Dev loop**: `pnpm dev` proxies `/api` and `/healthz` to the local Node server (`localhost:3000`), and sign-in on
  `http://localhost:5173` works once M-28 registers that origin. Document it in the README.
- **Docs**: project `CLAUDE.md` (drop `@AGENTS.md`, drop R10, rewrite R1 for API-only, replace the stale Supabase
  stack/description with Node API + Postgres + Google Drive + mmlabs Identity); README local-mode sections;
  `docs/feature-list.md` local-mode / Figma Make mentions; `.env.example` if it mentions local mode.

## Out of scope
- Any change to the server, migrations, auth verification or deploy config.
- A dev proxy that injects a bearer token (option b, not chosen).
- UI redesign; tests unrelated to the removed code.

## Acceptance criteria
- [ ] `.figma/`, `AGENTS.md`, every `figma*` plugin and every `FIGMA_*` reference are gone; `package.json` name is
      `tudocuatui`.
- [ ] `pnpm build` output keeps the same `<title>`, `lang`, description/meta, skip-link and `robots.txt` (noindex) as
      before the change (compared on `dist/index.html` and `dist/robots.txt`).
- [ ] No local repo, demo items or `"local"` data mode remain in `src/`; no `localStorage` use stores wardrobe data.
- [ ] When the Node server is unreachable or `/healthz` is not its JSON, the app shows an error state with a retry,
      never demo data (unit test).
- [ ] `pnpm dev` with the Node server running locally reaches `/api` through the Vite proxy (manual).
- [ ] `CLAUDE.md`, README and `docs/feature-list.md` describe the API-only app; R10 removed, R1 rewritten.
- [ ] Checks green.

## Technical notes
- Files: `vite.config.ts`, `index.html`, `public/`, `package.json`, `src/data/{mode,repo,demo,useWardrobe}.ts`,
  `src/App.tsx`, `src/main.tsx`, `src/features/auth/AuthRoot.tsx` (if it has a local bypass), affected tests,
  `CLAUDE.md`, `README.md`, `docs/feature-list.md`.
- Gate `plan-approval`: the change likely touches `src/features/auth/**` (High). The planner confirms.
- Risks / open questions:
  - Hard to reverse: no sync back from Figma Make after `.figma/` is gone.
  - `figmaSiteConfiguration` also shapes the production HTML; missing a tag changes production silently. Diff
    `dist/` before and after.
  - Until M-28 is done, local development stops at the sign-in screen (Identity origin is production only, M-19).
  - Other `localStorage` uses (theme, legacy session, filters) are not wardrobe data; keep them unless the plan says
    otherwise.

## Test plan
- Unit: mode/health probe without the local branch (server down, HTML answer, JSON answer); error state renders;
  remove tests of deleted code.
- Manual: `pnpm build` and diff `dist/index.html` / `dist/robots.txt` against `main`; `pnpm dev` + local Node server
  → sign-in on localhost (after M-28) → items load.

## Notes / answers from Ming
- 2026-11-17: remove Figma Make and local mode (option B); update `CLAUDE.md`; record a decision (D44); keep it as one
  ticket; dev sign-in via a localhost origin in Identity (option a, M-28).

## Handoff
