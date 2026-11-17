# T-025: Remove Figma Make and the local/demo mode

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | L |
| Milestone | M1 |
| Epic | E0 — Foundation |
| Areas | ui, data, architecture, security |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
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
- **Dev loop (option C, D44)**: Identity cannot register a localhost origin (the `ops-org-admin-api` `register-app`
  input only accepts `https://<sub>.mmlabs.online`), so local development uses a **dev-only proxy that injects a
  bearer token**:
  - `pnpm dev` proxies `/api` and `/healthz` to the local Node server (`localhost:3000`) and adds
    `Authorization: Bearer <token>` on the Node side of the proxy. The plugin is `apply: "serve"` only and never part
    of `pnpm build`.
  - The token is a real Identity access token (audience `tudocuatui`, 15 min) for Ming's own account, obtained by a
    helper script (e.g. `scripts/dev-token.sh`) that signs in with `curl`, setting the `Origin` header to the
    production TuDo origin and `X-MM-App: tudocuatui`. The password is read with `read -s` and passed on stdin, never
    as an argument or into a file. The token is kept in a git-ignored file (or env var) that the proxy reads per
    request, so refreshing it needs no restart.
  - The SPA treats the dev proxy as signed in (no sign-in screen, no token in the browser). This is a dev-only path;
    the planner designs it so production builds cannot reach it.
  - Document the dev loop and its limits (15 min token, Turnstile after 3 failed sign-ins) in the README.
- **Docs**: project `CLAUDE.md` (drop `@AGENTS.md`, drop R10, rewrite R1 for API-only, replace the stale Supabase
  stack/description with Node API + Postgres + Google Drive + mmlabs Identity); README local-mode sections;
  `docs/feature-list.md` local-mode / Figma Make mentions; `.env.example` if it mentions local mode.

## Out of scope
- Any change to the server, migrations, auth verification or deploy config.
- Registering a localhost or dev subdomain origin in Identity (options A and B, not chosen).
- UI redesign; tests unrelated to the removed code.

## Acceptance criteria
- [ ] `.figma/`, `AGENTS.md`, every `figma*` plugin and every `FIGMA_*` reference are gone; `package.json` name is
      `tudocuatui`.
- [ ] `pnpm build` output keeps the same `<title>`, `lang`, description/meta, skip-link and `robots.txt` (noindex) as
      before the change (compared on `dist/index.html` and `dist/robots.txt`).
- [ ] No local repo, demo items or `"local"` data mode remain in `src/`; no `localStorage` use stores wardrobe data.
- [ ] When the Node server is unreachable or `/healthz` is not its JSON, the app shows an error state with a retry,
      never demo data (unit test).
- [ ] `pnpm dev` with the Node server running locally and a fresh dev token loads the signed-in app through the Vite
      proxy (manual); the token never appears in the browser (no `VITE_*` variable, not in `dist/`, not in JS-visible
      storage) (unit/grep test).
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
  - The token script sets `Origin` to the production TuDo origin on purpose, to get past Identity's origin allowlist
    from a non-browser client; Ming accepted this (D44). It must only ever use Ming's own credentials.
  - The dev token is a live credential with write access to whatever DB the local server uses; the local server must
    point at a local database (and Drive off or a test folder), never production.
  - The token file must be git-ignored. Note: on 2026-11-17 the working tree's `.gitignore` had lost its `.env*` line
    (uncommitted local change); do not rely on `.env*` alone, check `git check-ignore` for the token file.
  - Other `localStorage` uses (theme, legacy session, filters) are not wardrobe data; keep them unless the plan says
    otherwise.

## Test plan
- Unit: mode/health probe without the local branch (server down, HTML answer, JSON answer); error state renders;
  remove tests of deleted code.
- Manual: `pnpm build` and diff `dist/index.html` / `dist/robots.txt` against `main`; `pnpm dev` + local Node server
  + `scripts/dev-token.sh` → app opens signed in → items load; let the token expire → clear error, refresh token →
  works without restart.

## Notes / answers from Ming
- 2026-11-17: remove Figma Make and local mode (option B); update `CLAUDE.md`; record a decision (D44); keep it as one
  ticket; dev sign-in via a localhost origin in Identity (option a, M-28).
- 2026-11-17: option a is impossible (the `register-app` workflow only accepts `https://<sub>.mmlabs.online`). Ming
  chose **C**: dev proxy with a real token from a script; M-28 dropped. Ming: run T-025 to plan approval now.

Plan approved (2026-11-17) — Ming: "Plan approved, giữ nguyên A1–A9" (A1–A9 confirmed as written).

## Handoff
### 2026-11-17 — claude — BLOCKED
- Done: consult (software-architect), plan.md `Status: READY` with assumptions A1–A9.
- In progress / next: Ming approves the plan (confirm or override A1–A9) by writing "Plan approved (YYYY-MM-DD)" under *Notes / answers from Ming*; then `/run T-025` implements.
- Gotchas: High paths touched (`src/features/auth/AuthRoot.tsx`, comment-only `Dockerfile` / `.dockerignore`); T-019 and F-702 overlap `AuthRoot.tsx`, `main.tsx` and `Editor.tsx`; well over 400 changed lines, fallback split named in the plan.

### 2026-11-17 — claude — DONE
- Done: attempt 1 implemented (Figma Make and local mode removed, dev token proxy, docs); review PASS; security review no 🔴, two 🟡 (non-loopback `server.host` via `--host`, unvalidated `TUDO_DEV_API`) plus minor `dev-token.sh` items; reviewer: `scripts/dev-token.sh` not executable in git.
- In progress / next: open the PR (no `gh` CLI on this machine; body drafted for Ming). Recommended: one more implementer pass for the two 🟡 items and the chmod before merge.
- Gotchas: run tests from the Linux filesystem in WSL; from `/mnt/d` the server CLI tests time out (host I/O, same on `main`).
