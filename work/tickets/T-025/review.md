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

## Attempt 2 — 2026-11-17
Verdict: PASS

Scope of this attempt: commit `01f856b`. It fixes security findings 1, 2, 3, 7 and 8, the attempt-1 should-fix (the executable bit), and the README / `dev-token.sh` wording for D45. D45 is on `origin/main` (`work/decisions.md`); I read it there.

### Checks (run by reviewer)
I ran these on an rsync copy on the WSL Linux filesystem (`~/rev2-t025`, now deleted). Ming's working tree, `pnpm dev` and the Node server were not touched.
- install: `pnpm install --frozen-lockfile`: ok.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`: clean.
- format:check: "All matched files use the correct format" (269 files).
- test: `pnpm test`: exit 0. 104 files passed, 10 skipped; 1254 tests passed, 205 skipped. That is attempt 1's 1251 plus the 3 new guard tests; the skipped count is the same (DB-gated suites). The rsync excluded `.env*`, which also left out the tracked `.env.example`. The first run therefore failed only `boundary.test.ts > .env.example gains no AI variable` with ENOENT. After copying the tracked file in (not read), the run was green. This is not a code issue. `vitest run dev`: 2 files, 23 tests passed.
- build: `pnpm build`: built in 334 ms.
- `bash -n scripts/dev-token.sh`: ok.
- impl-log Attempt 2 says it ran only `vitest run src dev scripts` (835 tests), not the full suite. My full run is green, so there is no mismatch in results.

### Attempt-2 items, verified
- [x] Security 1 (`--host` / `allowedHosts: true`): `dev/devTokenProxy.ts:40-52` `assertLocalServer`, wired in `configResolved` (`:111-113`). Unit tests are in `devTokenProxy.test.ts:195-207`. Live check in the copy (port 18443): `vite --host` and `vite --host 0.0.0.0` both fail with "error when starting dev server: [dev-token] the dev server must listen on 127.0.0.1, localhost or ::1 (no --host)".
- [x] Security 2 (`TUDO_DEV_API` loopback only): `devTokenProxy.ts:25-37` parses with `new URL` and allows only `127.0.0.1`, `localhost`, `::1` and `[::1]`. Unit tests reject `http://example.com`, `https://tudocuatui.mmlabs.online` and `nonsense` (`test.ts:187-193`). Live check: with `TUDO_DEV_API=https://tudocuatui.mmlabs.online`, `vite` refuses to start. `proxyTarget` runs only inside `config()` of a serve-only plugin (`apply`), so `pnpm build` is not affected (confirmed: the build is green).
- [x] Security 3 / 8 (README notes): `README.md:29-31` covers "Browsers that send no `Sec-Fetch-Site` header are treated as same-origin" and "Origin check is not an authentication factor".
- [x] Security 4 (asked of the reviewer): with Vite 8 in the copy, `curl -H 'Host: evil.example' http://127.0.0.1:18443/healthz` returns 403, and a normal `/` returns 200. The host check runs before the proxy.
- [x] Security 7 (`dev-token.sh`): `scripts/dev-token.sh:24-25` has `trap 'rm -rf "$work"' EXIT` plus `trap 'exit 130' INT TERM HUP`. In bash, `exit` inside a signal trap fires the EXIT trap, so the temp dir is removed and the script stops instead of continuing. This is better than the auditor's single combined trap. `IFS= read -r` is used for the email (`:49`) and `IFS= read -rs` for the password (`:52`).
- [x] Attempt-1 Issue 1 (executable bit): `git ls-files -s scripts/dev-token.sh` gives `100755`.
- [x] D45 wording: `README.md:14` and `:32-36`, and the `dev-token.sh:5-6` header, now say "local DB by default; production through the tunnel is allowed (D45) with guardrails". The guardrails match D45: no `migrate.js` against production, `pg_dump` first, `DATABASE_URL` only at runtime, and real Drive deletes with the production credentials. The extra `AI_KEK` caution is accurate and only adds safety. The docs do not change behaviour.
- [x] Attempt-1 acceptance criteria: nothing in this commit touches `src/`, so the AC evidence from Attempt 1 still stands. The full suite and build are green again above.

### Scope
The 4 code/docs files changed (`dev/devTokenProxy.ts`, `dev/devTokenProxy.test.ts`, `scripts/dev-token.sh`, `README.md`) are all in the plan's file list (`plan.md:48-50,94,97`), plus `impl-log.md`. No out-of-plan changes.

### Issues
#### Issue 1 — 🟡 should-fix — secret handling in docs (security-review Attempt 2, C1)
- **Where**: `README.md:15` (example `... DATABASE_URL=<local> pnpm start`) together with the D45 guardrail at `README.md:32-36`.
- **Expected**: under D45 the production `DATABASE_URL` (and `AI_KEK`, the Google credentials) reach the process at runtime without landing in a file. Workspace rule §3: values only through `scripts/with-secrets.sh`.
- **Actual**: the only documented pattern is an inline env assignment. Repeated with the production value, it writes the connection string to `~/.bash_history`.
- **Fix instruction**: in the D45 bullet, add one line saying that production values are given via `scripts/with-secrets.sh DATABASE_URL -- pnpm start` (the secret name entry in `secrets.refs.yaml` is Ming's step), never typed inline. This does not block: it is docs only, the example itself uses `<local>`, and the guardrail sentence is already there. Fix it before merge or carry it in the PR body.

### Rules R1–R10 (CLAUDE.md)
No violations found. R3: the token is still never in client code or `VITE_*`. The new guards make the loopback guarantee behind AC5 hold under `--host` as well. R8: both new guards have unit tests.

### Nits (do not block)
- `LOOPBACK` trusts the name `localhost`. A custom `/etc/hosts` entry could map it to a non-loopback address. This is theoretical on Ming's machines.
- The README says `pnpm dev` "refuses to start with `--host`". The exact behaviour is any host other than 127.0.0.1, localhost or ::1, so it also refuses e.g. `--host 127.0.0.2`. That is fine but slightly broader than the wording.

### Ming verification after merge (unchanged from Attempt 1)
Items 1-6 from Attempt 1 still apply. In addition: run `scripts/dev-token.sh` once against Identity and press Ctrl-C at the password prompt, to confirm the terminal echo comes back and no `tmp.*` dir is left behind.

### Follow-ups (out of scope)
- Security finding 8 / open question 2: a `debt` issue against Identity saying the Origin plus `X-MM-App` check is not an authentication factor (the README line is done; the issue is not).
- The Attempt 1 follow-ups still apply.
