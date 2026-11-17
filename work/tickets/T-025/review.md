## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
Run in WSL Ubuntu 24.04 on a `git archive HEAD` copy on the Linux filesystem (`~/rev-t025`), and on a copy of `origin/main` (`~/rev-main`) for comparison, each with `pnpm install --frozen-lockfile`.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`: exit 0, no errors.
- format:check: exit 0. "All matched files use the correct format" (269 files).
- test: `pnpm test`: exit 0. 104 files passed, 10 skipped; 1251 tests passed, 205 skipped; 36.7 s. `origin/main` on the same host gives 101 files and 1262 tests passed, 205 skipped. The difference is the deleted local-mode/demo tests; the skipped count is the same (DB-gated suites).
- test:coverage: exit 0, so every threshold passes. `src/data` is 98.22 % statements / 95.35 % branches.
- build: exit 0 (`dist/index.html`, `dist/robots.txt`, `dist/favicon.png`, assets; `AuthRoot` is still a separate chunk).
- **Timeouts the implementer reported** (`server/index.cli.test.ts`, `photo-relocate.cli`, `photo-sweep.cli`, `ai/tagPhoto`, once `src/App.test.tsx`): they come from the host, not from this diff. The same full suite is green with the default 5 s timeout when it runs from the Linux filesystem. The server test files are not touched by this diff (`git diff --name-only origin/main...HEAD -- server/` lists only `server/README.md`). The slow runs came from `/mnt/d` (drvfs) I/O. impl-log reported this honestly and did not claim a green run, so there is no mismatch.

### Acceptance criteria
- [x] 1. Figma gone; package renamed. Evidence: `git ls-files .figma AGENTS.md` is empty. `git grep -n FIGMA_ -- . ':!work'` is empty. `git grep -niE figma -- . ':!work' ':!pnpm-lock.yaml'` gives `CLAUDE.md:48` (R10 "Retired (D44)"), `docs/feature-list.md:21` (cites D44) and `docs/plan-M1.md:146` (historical D9 row; disclosed in impl-log, see Nits). `package.json` has `"name": "tudocuatui"`. `vite.config.ts` has only `react()`, `tailwindcss()`, `devTokenProxy()`; `server`/`preview` use `host: "127.0.0.1"`, `strictPort`, and `preview.proxy: {}`.
- [x] 2. Built head and robots unchanged except A1. Evidence: I built both branches and compared the output.
  - `dist/robots.txt` is byte-identical on both (`User-agent: *\nDisallow: /\n`, checked with `od -c`).
  - `<head>` has the same tags in the same order: description (same Vietnamese text), robots `noindex, nofollow`, icon `/favicon.png`, `og:title`, `og:description`.
  - The only differences are `lang` en→vi, `<title>` and `og:title` "Figma Make App"→"Tủ đồ của tôi" (A1, approved).
  - There is no skip-link on either branch (A3) and no inline `<script>` or `<style>`.
  - `src/test/indexHtml.test.ts` locks these values and passes.
- [x] 3. No local repo, demo data or local mode in `src/`. Evidence:
  - The AC3 grep only hits `src/lib/legacySession.test.ts` (`tu-do-items` kept, unchanged).
  - `mode.ts`, `demo.ts`, `repo.local.test.ts`, `demo.test.ts` and `mode.test.ts` are deleted.
  - `localStorage` outside tests appears only in `App.tsx` and `lib/theme.ts` (theme), `lib/legacySession.ts` and `features/auth/accountId.ts`, plus the test-only `src/test/setup.ts`.
  - `WardrobeRepo` has no `mode` field (`src/data/repo.ts:7-16`).
- [x] 4. Unreachable server gives the error screen, never demo data. Evidence:
  - `src/data/serverProbe.test.ts`: all 11 plan cases pass.
  - `src/lib/startup.test.ts` › "unreachable shows the unavailable view, never the app or the auth slice" and "retry probes again and continues to auth when the server is back" pass.
  - `src/features/layout/ServerUnavailable.test.tsx` › "renders the Vietnamese error and Thử lại; no item cards", "Thử lại calls onRetry and is disabled while it runs" and "dev hint only when dev" pass.
- [x] 5. The token never reaches the browser (the manual part is in Ming's list below). Evidence:
  - `dev/devTokenProxy.test.ts` (15 tests: apply rules, header rewrite, token reader, warnings, source scan) passes.
  - `src/lib/startup.test.ts` › "dev + ok renders the app without getToken and never loads the auth slice" passes.
  - `scripts/dev-token.test.ts` (5 tests, including `bash -n`) passes.
  - `grep -rlE "dev-token|devTokenProxy|TUDO_DEV|Bearer ey|127\.0\.0\.1:3000" dist` finds nothing.
  - `git grep VITE_ -- src dev vite.config.ts` finds only `VITE_APP_VERSION` and two test strings.
  - I read the code:
    - `rewriteAuth` (`dev/devTokenProxy.ts:60-71`) always drops the client `authorization` and injects only for `sec-fetch-site` same-origin or absent.
    - The token is read per request in `proxyReq` (`:89-97`).
    - The plugin `apply` excludes build and preview (`:82`).
    - The script passes the password only via builtin `printf` into a pipe (`scripts/dev-token.sh:54-57`), then `unset pw`.
    - It uses `umask 077`, writes to a tmp file then `mv`, and never prints the token.
- [x] 6. Docs describe the API-only app. Evidence:
  - `CLAUDE.md`: `@AGENTS.md` and the Figma comment are removed; the description and Stack name Node API + Postgres + Drive + Identity, home server (D20); R1 matches plan step 9 word for word; R10 is "Retired (D44)".
  - `README.md`: the old local-mode bullets are gone; the "Development (dev loop)" section covers the 15 min token, Turnstile after 3 failures, local DB only, `127.0.0.1` only and no proxy in `pnpm preview`.
  - `docs/feature-list.md`: lines 21, 28 and 119 are updated.
- [x] 7. Checks green. Evidence: see Checks above.

Scope: every changed file is in the plan's file list. `work/**` files are loop bookkeeping. `src/test/fixtures.ts` is the planned move of `demo.ts`. A4/A5 (`server/README.md`, `.claude/agents/*`, `Dockerfile:6`, `.dockerignore:19-22`) were approved by Ming. The `Dockerfile` and `.dockerignore` edits remove comments and dead patterns only. `dev/` is not in `.dockerignore`, so `vite.config.ts`'s import of `./dev/devTokenProxy` still resolves in the image build stage (`COPY . .`); `dev/*.test.ts` is excluded by `**/*.test.ts`.

### Issues
#### Issue 1 — 🟡 should-fix — dev loop usability
- **Where**: `scripts/dev-token.sh` (git mode `100644`) and `README.md` dev-loop block ("`scripts/dev-token.sh`", twice).
- **Expected**: running the documented command works on a fresh clone.
- **Actual**: the file is not executable in git. Ming's checkout on `/mnt/d` (drvfs without metadata) shows every file as executable, so it works there. A clone on the Linux filesystem or on macOS fails with "Permission denied".
- **Fix instruction**: either `git update-index --chmod=+x scripts/dev-token.sh`, or change both README lines to `bash scripts/dev-token.sh`. This does not block: it does not affect any acceptance criterion, and it works in Ming's current setup. Carry it in the PR body or fix it before merge.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1 (new text): every data access goes through `WardrobeRepo`, whose only implementation is `createHttpRepo`. There is no fallback: `startup` never renders `App` on `"unreachable"`.
- R3: no new `VITE_*` variable, and the token stays out of `src/` and `dist/`.
- R6: the new copy lives in `LAYOUT_COPY.serverUnavailable`.
- R8: the new pure logic (`serverProbe`, `startup`, `devTokenProxy` helpers) has unit tests.
- R9: `ServerUnavailable` reuses `.app-shell` / `.no-results` and `Btn`. It has no fixed widths, and dark mode works because `applySavedTheme()` sets `html.dark` before the first render.
- The auth slice is still loaded only through `import()` in `main.tsx:35` (boundary test green).

### Nits (do not block)
- `docs/plan-M1.md:146` still mentions Figma Make and local mode. It is a historical decision row; the plan's AC1 allowance did not list it, but impl-log disclosed it. Leave it, or add "(superseded by D44)".
- The `devApp` branch is not tree-shaken from the production bundle: the string `devApp` is in `dist/assets/index-*.js`, because `dev` is passed as a parameter into `startup()`. It is unreachable, since `import.meta.env.DEV` is the literal `false` there, so this is not a security issue. The plan's "dead code" wording is accurate only in that sense.
- `.no-results` has no horizontal padding, so the error body text can run edge to edge at 390px. A cosmetic check is all that is needed.
- `work/ming-todo.md`: the T-025 plan-approval line was added under the `### F-701.1 — Gemini` heading rather than the T-025 section. This is loop bookkeeping, not the implementer's diff.

### Ming verification after merge (carry into the PR)
1. Dev loop: local Node server on a local DB with Drive unset, then `scripts/dev-token.sh`, then `pnpm dev`. Open `http://localhost:8443` from Windows. The app opens with no sign-in screen and items load. DevTools shows no `Authorization` header on browser requests and no token in localStorage or sessionStorage.
2. Identity accepts the script's sign-in (production `Origin`, `X-MM-App: tudocuatui`) and returns an audience-`tudocuatui` token. The best-effort logout does not invalidate the token (A8).
3. Token expiry: after about 15 min requests fail with the error banner. Re-running the script and then retry or reload works without restarting Vite.
4. Server down: the "Không kết nối được máy chủ" screen appears with the dev hint, never demo items. After starting the server, "Thử lại" opens the app.
5. No LAN exposure: `http://<ip>:8443` from another device is refused.
6. Production at the next release: the title is "Tủ đồ của tôi", `lang="vi"`, `/robots.txt` is noindex, and sign-in, verify-email and reset-password still work.

### Follow-ups (out of scope)
- The `server/*.cli.test.ts` files (and, under load, `src/App.test.tsx`) hit the 5 s default timeout when the suite runs from `/mnt/d`. Consider a per-file `testTimeout` for the CLI spawn tests, or document "run the tests from the Linux filesystem" in the README.
- The plan's listed follow-ups still apply: Supabase wording in R2–R4 and Risk tiers, the stale `tu-do-items` key, the unused `.ai-btn` CSS and `sparkle` icon, the `not_available` AI code, the AgentPlat lines, and the `dev-token` grep in `scripts/check-image.sh`.
