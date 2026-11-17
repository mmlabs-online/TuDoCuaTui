## Attempt 1 — 2026-11-17

### Step 0 baseline (before any edit, `pnpm build` on the unmodified branch)
```
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Figma Make App</title>
  <meta name="description" content="Quản lý tủ quần áo cá nhân với tìm kiếm, theo dõi số lần mặc và nhập xuất dữ liệu, giúp bạn dễ dàng sắp xếp và lựa chọn trang phục.">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/favicon.png">
  <meta property="og:title" content="Figma Make App">
  <meta property="og:description" content="(same description)">
  <script type="module" ...> <link rel="stylesheet" ...>
</head>
```
`dist/robots.txt` = `User-agent: *\nDisallow: /\n`. After: same tags in the same order; only `lang` (vi), `<title>` and `og:title` (`Tủ đồ của tôi`) differ (A1); `dist/robots.txt` identical; no skip-link before or after (A3); no inline script/style.

### Files touched
| File | Required because |
|---|---|
| `.figma/` (deleted), `AGENTS.md` (deleted) | AC1, D44 |
| `vite.config.ts` | Only `react()`, `tailwindcss()`, `devTokenProxy()`; loopback host; `preview.proxy: {}` (AC1, AC5) |
| `dev/devTokenProxy.ts`, `dev/devTokenProxy.test.ts` (new) | Dev proxy plugin and its tests (AC5) |
| `tsconfig.json` | `dev` added to `include` |
| `index.html`, `public/robots.txt` (new), `src/test/indexHtml.test.ts` (new) | Static head tags and robots (AC2) |
| `package.json` | name `tudocuatui` (AC1) |
| `.prettierignore`, `.gitignore`, `.dockerignore`, `Dockerfile` | Dead Figma lines only (AC1; A5) |
| `src/data/mode.ts`, `mode.test.ts`, `demo.ts`, `demo.test.ts`, `repo.local.test.ts` (deleted) | AC3 |
| `src/data/serverProbe.ts`, `serverProbe.test.ts` (new) | Two-state probe replacing `detectRuntime` (AC4) |
| `src/test/fixtures.ts` (moved from `demo.ts`), `src/test/memoryRepo.ts` (new) | Test-only data and repo double |
| `src/data/repo.ts`, `repo.http.ts`, `repo.http.test.ts` | `WardrobeRepo.mode` and the local repo removed |
| `src/data/useWardrobe.ts`, `useWardrobe.test.tsx` | Always the HTTP repo; new signature |
| `src/data/aiSettings.ts`, `aiSettings.test.ts`, `usePhotoUrl.ts`, `src/types/item.ts` | `localAiSettings` removed; stale local-mode comments |
| `src/lib/boot.ts`, `boot.test.ts` | `needsAuth` removed; probe test uses `probeServer` |
| `src/lib/startup.ts`, `startup.test.ts` (new), `src/main.tsx` | Probe, then unavailable / dev app / auth (AC4, AC5) |
| `src/features/layout/ServerUnavailable.tsx`, `.test.tsx` (new), `copy.ts` | Error screen with retry, Vietnamese copy in one place (AC4, R6) |
| `src/features/auth/AuthRoot.tsx`, `AuthRoot.test.tsx` | `identity` prop and the no-store branch removed (High path) |
| `src/App.tsx`, `src/App.test.tsx` | No `mode`; settings unconditional; duplicate always clears photo; tests on memory repo |
| `src/features/items/Editor.tsx`, `Editor.test.tsx` | `showMockAi` / `photoById` removed |
| `src/features/import-export/ImportModal.tsx`, `ImportPhotosTab.tsx`, `copy.ts`, `ImportModal.test.tsx` | `showMockAi` and the mock AI checkbox removed |
| `src/features/import-export/download.test.ts`, `csv/map.test.ts` | Import fixtures from `@/test/fixtures` |
| `scripts/dev-token.sh`, `scripts/dev-token.test.ts` (new) | Token script and static invariants |
| `CLAUDE.md`, `README.md`, `docs/feature-list.md` | AC6 (R1 rewritten, R10 retired, dev loop section) |
| `server/README.md`, `.claude/agents/{implementer,reviewer,planner}.md` | Docs-only, A4 |

### Tests added / changed
- New: `src/data/serverProbe.test.ts` (the 11 plan cases), `src/lib/startup.test.ts` (5), `src/features/layout/ServerUnavailable.test.tsx` (3), `dev/devTokenProxy.test.ts` (15), `scripts/dev-token.test.ts` (5), `src/test/indexHtml.test.ts` (2).
- Updated: `boot.test.ts`, `useWardrobe.test.tsx` (memory repo through a `vi.mock("./repo.http")` switch), `App.test.tsx` (same switch; "settings button is always shown and opens the AI settings modal", "no sign-out without onSignOut", "duplicate clears the photo", "the editor has no mock AI button"), `Editor.test.tsx`, `ImportModal.test.tsx` ("Photos tab shows no AI checkbox"), `AuthRoot.test.tsx`, `aiSettings.test.ts`, `repo.http.test.ts`.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: clean after `pnpm format`.
- test: `vitest run src dev scripts` gives 68 files, 832 tests passed. A full `pnpm test` on this Windows/WSL host (files on `/mnt/d`, about 240 s) shows only 5 s timeouts in untouched server tests (`server/index.cli.test.ts` 14 cases, `photo-relocate.cli`, `photo-sweep.cli`, one `ai/tagPhoto` case) and, in one of three runs, `src/App.test.tsx` "delete asks for confirmation" (a 5 s timeout under load). Run alone, `src/App.test.tsx` (41 tests) and the three server CLI files all pass. With `--testTimeout=60000` and the whole suite in parallel, 9 cases of `server/index.cli.test.ts` still fail with "server did not start". I did not get one fully green `pnpm test` invocation on this host; the reviewer should run it on a faster machine.
- test:coverage (src, dev, scripts only): `src/data` 98.22 % lines / 95.35 % branches; every `src/data/**` file is above the thresholds. The full-run threshold check was not reachable for the reason above (server thresholds fail when the server tests are left out).
- build: `pnpm build` ok. `dist/index.html` and `dist/robots.txt` as described under baseline. `grep -rlE "dev-token|devTokenProxy|TUDO_DEV|Bearer ey" dist` gives no hits.
- Dev proxy end to end (WSL, fake backend and fake JWT, never the real Identity API): proxied `/healthz` and `/api/items` reach the backend with `Authorization: Bearer <token>`, and a client-sent `Authorization: Bearer attacker` is replaced; `Sec-Fetch-Site: cross-site` gets no header; a missing token file forwards without the header and logs one line `[dev-token] token missing - run scripts/dev-token.sh`; the server listens on `127.0.0.1:8443` only. Vite 8's proxy (`http-proxy-3`) emits `proxyReq` from the request's `socket` event, before headers are flushed, so `removeHeader` / `setHeader` work (confirmed by that run).
- `scripts/dev-token.sh`: `bash -n` OK and the static test only; never run against Identity.
- AC greps: `git grep -niE figma -- . ':!work' ':!pnpm-lock.yaml'` gives the `CLAUDE.md` R10 row, `docs/feature-list.md:21` (both cite D44) and `docs/plan-M1.md:146` (see follow-ups). `git grep FIGMA_` gives nothing. The AC3 grep gives only `legacySession.test.ts` (`tu-do-items`). `localStorage` outside tests: `App.tsx` and `lib/theme.ts` (theme), `lib/legacySession.ts`, `features/auth/accountId.ts`. `git grep VITE_ -- src dev vite.config.ts` gives only `VITE_APP_VERSION` and the existing `boundary.test.ts` string.

### Out-of-plan files
- None. One deviation in content: `LAYOUT_COPY.serverUnavailable.devHint` says "làm mới token theo mục Development trong README" instead of naming `scripts/dev-token.sh`, because the plan's own source scan (nothing under `src/` mentions `dev-token`) and the `dist/` grep would otherwise fail.

### Follow-ups (noticed, not done)
- `docs/plan-M1.md:146` (D9 decision row) still names Figma Make and local mode. It is a historical decision table, so I left it; AC1's grep therefore shows it.
- Supabase wording in `CLAUDE.md` R2-R4 and Risk tiers; stale `tu-do-items` key in old browsers; unused `.ai-btn` CSS and `sparkle` icon; `not_available` AI error code; AgentPlat lines in `.gitignore` and `public/.gitattributes`.
- `server/index.cli.test.ts` is flaky on a slow filesystem (5 s timeouts); consider a larger `testTimeout` for the CLI test files.

### Scope self-check
- Could the diff be smaller? No: it is mostly deletions (Figma plugin block, local repo, demo data, their tests) and moves (fixtures, memory repo).
- Diff size: about +1056 / -1525 lines (69 files).
