Status: READY

# Plan — T-025: Remove Figma Make and the local/demo mode

Gate: `plan-approval` (confirmed: the diff touches `src/features/auth/AuthRoot.tsx` (High: the auth flow, per project CLAUDE.md), plus comment-only lines in `Dockerfile` / `.dockerignore` and docs in `server/README.md`, which are High in `.github/risk-tiers.yml`). Ming confirms or overrides the assumptions A1–A9 below when he approves.

## Feature summary
There is no feature-list entry for this. The ticket reverses `docs/feature-list.md:28`:
> "Local mode (no env vars) uses localStorage + 16 demo items, so the Figma Make preview keeps working."

The authority is `work/decisions.md` **D44** (2026-11-17):
> "Figma Make is no longer used: `.figma/`, `AGENTS.md` and the `figma*` Vite plugins are removed, and UI changes are made only in the repo. The localStorage/demo-items mode is removed: the app always runs against the Node API with real data and Identity sign-in; when the server is unreachable it shows an error, never demo data. Local development uses `pnpm dev` with a dev-only proxy to a local Node server that injects a real Identity token for Ming's own account, fetched by a script that sets the production `Origin` header (option C; Identity cannot register a localhost origin, so M-28 is dropped). The token never reaches the browser. Amends R1 and R10, and the local-mode / Figma Make preview clauses of D9, D21 and D30. Hard to reverse (no sync back from Figma Make)."

From the ticket's Scope, quoted:
- "Move what `figmaSiteConfiguration` emits for production (`<title>`, `lang`, description/meta tags, `robots.txt` with noindex, the skip-link and its CSS) into static `index.html` / `public/` so the built output is equivalent. Rename the package `figma-make-app` → `tudocuatui`."
- "remove the localStorage `WardrobeRepo`, the demo items (`src/data/demo.ts`), the `local` branch of the mode switch (`src/data/mode.ts`), and UI branches that exist only for local mode."
- "when `/healthz` does not answer as the Node server, show a clear error state (Vietnamese copy, retry) instead of falling back to demo data."
- Dev loop: "`pnpm dev` proxies `/api` and `/healthz` to the local Node server (`localhost:3000`) and adds `Authorization: Bearer <token>` on the Node side of the proxy. The plugin is `apply: "serve"` only and never part of `pnpm build`." The token comes from "a helper script (e.g. `scripts/dev-token.sh`) that signs in with `curl`, setting the `Origin` header to the production TuDo origin and `X-MM-App: tudocuatui`. The password is read with `read -s` and passed on stdin, never as an argument or into a file." The token is "kept in a git-ignored file (or env var) that the proxy reads per request". "The SPA treats the dev proxy as signed in (no sign-in screen, no token in the browser)." The README documents the dev loop and its limits.
- Docs: "project `CLAUDE.md` (drop `@AGENTS.md`, drop R10, rewrite R1 for API-only, replace the stale Supabase stack/description with Node API + Postgres + Google Drive + mmlabs Identity); README local-mode sections; `docs/feature-list.md` local-mode / Figma Make mentions; `.env.example` if it mentions local mode."

Out of scope (ticket): "Any change to the server, migrations, auth verification or deploy config"; "Registering a localhost or dev subdomain origin in Identity"; "UI redesign; tests unrelated to the removed code."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `.figma/`, `AGENTS.md`, every `figma*` plugin and every `FIGMA_*` reference are gone; `package.json` name is `tudocuatui`. | `git ls-files .figma AGENTS.md` prints nothing. `git grep -niE "figma" -- . ':!work' ':!pnpm-lock.yaml'` returns only the D44 history lines this plan allows: `docs/feature-list.md` (the rewritten line 28 and the stack line, both citing D44) and the CLAUDE.md R10 "retired" row. `git grep -n "FIGMA_"` returns nothing outside `work/`. `package.json` `"name": "tudocuatui"`. `vite.config.ts` has no plugins except `react()`, `tailwindcss()` and `devTokenProxy()`. |
| 2 | `pnpm build` output keeps the same `<title>`, `lang`, description/meta, skip-link and `robots.txt` (noindex) as before the change (compared on `dist/index.html` and `dist/robots.txt`). | Compare by meaning (see A1 and A3). The implementer's step 0 records the baseline head from `dist/index.html` and `dist/robots.txt` in `impl-log.md`. The reviewer runs `pnpm build` on the branch and checks: (a) `dist/robots.txt` is byte-identical to `User-agent: *\nDisallow: /\n`; (b) `<head>` has the same tags in the same order (`meta description` with the same Vietnamese text, `meta robots "noindex, nofollow"`, `link rel=icon href=/favicon.png`, `meta og:title`, `meta og:description`); (c) the only differences are `lang`, `<title>` and `og:title`, which per A1 become `vi` / `Tủ đồ của tôi`; (d) there is no skip-link before or after (A3); (e) there is no inline `<script>` or `<style>` (CSP `server/http.js:8-9`). Unit test `src/test/indexHtml.test.ts` locks the static `index.html` values. |
| 3 | No local repo, demo items or `"local"` data mode remain in `src/`; no `localStorage` use stores wardrobe data. | `git grep -nE "createLocalRepo\|@/data/demo\|DataMode\|pickMode\|detectMode\|detectRuntime\|needsAuth\|showMockAi\|photoById\|tu-do-items\|localAiSettings" -- src` → only `src/lib/legacySession.test.ts` (it asserts that `tu-do-items` is *kept*, which is unchanged). `src/data/demo.ts`, `src/data/mode.ts`, `src/data/repo.local.test.ts`, `src/data/demo.test.ts` and `src/data/mode.test.ts` are deleted. `git grep -n "localStorage" -- src ':!*.test.*'` → only `lib/theme.ts`, `App.tsx` (theme), `lib/legacySession.ts` and `features/auth/accountId.ts`. `WardrobeRepo` has no `mode` field. |
| 4 | When the Node server is unreachable or `/healthz` is not its JSON, the app shows an error state with a retry, never demo data (unit test). | `src/data/serverProbe.test.ts` (all cases listed under Tests), `src/lib/startup.test.ts` › "unreachable shows the unavailable view, never the app", "retry probes again and continues", and `src/features/layout/ServerUnavailable.test.tsx` › "renders the Vietnamese error and Thử lại; no item cards". |
| 5 | `pnpm dev` with the Node server running locally and a fresh dev token loads the signed-in app through the Vite proxy (manual); the token never appears in the browser (no `VITE_*` variable, not in `dist/`, not in JS-visible storage) (unit/grep test). | The manual part needs Ming's credentials, so it is under *Ming verification*. The reviewer checks: `dev/devTokenProxy.test.ts` (apply rules, header rewrite, token-file reader, source scan); `src/lib/startup.test.ts` › "dev + ok renders the app without getToken and never loads the auth slice"; `scripts/dev-token.test.ts` (static invariants); `pnpm build && git grep --no-index -nE "dev-token\|devTokenProxy\|TUDO_DEV\|Bearer ey" dist` → no hits; `git grep -n "VITE_" -- src dev vite.config.ts` → only `VITE_APP_VERSION`. Config check: `server.host` and `preview.host` are `127.0.0.1`, and `preview.proxy` is `{}`. |
| 6 | `CLAUDE.md`, README and `docs/feature-list.md` describe the API-only app; R10 removed, R1 rewritten. | Read the diffs. CLAUDE.md: no `@AGENTS.md`; the description and Stack name Node API + Postgres + Google Drive + mmlabs Identity, home-server hosting (D20); R1 is the text under Approach step 9; the R10 row reads "Retired (D44)" (A6). README: no local-mode or Figma text; it has a "Development (dev loop)" section covering the 15 min token, the Turnstile limit, local DB only, and `127.0.0.1` only. feature-list lines 21, 28 and 119 are updated. |
| 7 | Checks green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass. Coverage thresholds in `vitest.config.ts` still pass (`pnpm test:coverage`) for `src/data/**`. |

## Ming verification after merge
All of these need Ming's Identity credentials or his machines (WSL Ubuntu 24.04 plus a Windows browser):
1. **Dev loop.** Start a local Node server against a **local** database with Drive unset (`MM_IDENTITY_ISSUER=https://api.mmlabs.online TUDO_OWNER_SUB=<uuid> DATABASE_URL=<local> pnpm start`). Then run `scripts/dev-token.sh` and `pnpm dev`, and open `http://localhost:8443` in the Windows browser. The app opens with no sign-in screen and items load. In DevTools: browser requests carry no `Authorization` header, and localStorage/sessionStorage hold no token.
2. **Identity accepts the script.** The sign-in with `Origin: https://tudocuatui.mmlabs.online` and `X-MM-App: tudocuatui` works and returns an audience-`tudocuatui` token. The best-effort logout at the end does not break the token (A8).
3. **Token expiry.** After about 15 minutes, requests fail with the existing error banner. Running `scripts/dev-token.sh` again and pressing "Thử lại" works without restarting Vite.
4. **Server down.** Stop the Node server and reload: the "Không kết nối được máy chủ" screen appears with the dev hint, never demo items. Start the server and press "Thử lại": the app opens.
5. **No LAN exposure.** From another device on the LAN, `http://<wsl-or-pc-ip>:8443` is refused.
6. **Production, at the next release.** The page title is "Tủ đồ của tôi", `<html lang="vi">`, `/robots.txt` is noindex, and Identity sign-in, the verify-email link and the reset-password link still work.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `.figma/` (whole dir) | delete | AC1, D44 |
| `AGENTS.md` | delete | AC1, D44 |
| `vite.config.ts` | Rewrite to about 30 lines: `react()`, `tailwindcss()`, `devTokenProxy()`. Drop the site.json import, the 5 `figma*` plugins, `FIGMA_*`, `base`, the sourcemap/minify block (Vite defaults are the same as production today) and `watch.ignored`. `server`/`preview`: `host: "127.0.0.1"`, `port: Number(process.env.TUDO_DEV_PORT \|\| 8443)`, `strictPort: true`; `preview.proxy: {}` | AC1, AC5, consult §2 |
| `dev/devTokenProxy.ts` (new) | The dev-only Vite plugin, plus exported pure helpers (see Approach step 5) | Scope "Dev loop", AC5 |
| `dev/devTokenProxy.test.ts` (new) | Unit tests (node env) | AC5, R8 |
| `tsconfig.json` | Add `"dev"` to `include` | Typecheck covers the plugin |
| `index.html` | Static `lang`, `<title>`, the 5 head tags in the same order; remove every `<!-- figma:* -->` slot | AC2 |
| `public/robots.txt` (new) | `User-agent: *\nDisallow: /\n` | AC2 |
| `src/test/indexHtml.test.ts` (new) | Locks the index.html head values, no inline script/style, `public/robots.txt` content | AC2 |
| `package.json` | `"name": "tudocuatui"` | AC1 |
| `.prettierignore` | Drop the `AGENTS.md` and `.figma/` lines | Dead entries (AC1 cleanliness) |
| `.gitignore` | Drop `/.figma/design-context/` | AC1 cleanliness |
| `.dockerignore` | Drop lines 19-22 (the `.figma` comment and patterns); nothing else | Dead patterns that reference Figma; High path, A5 |
| `Dockerfile` | Delete comment line 6 (`Never set FIGMA_PUBLIC_URL…`); no other change | AC1 ("every `FIGMA_*` reference"); High path, A5 |
| `src/data/mode.ts` | delete (replaced) | AC3 |
| `src/data/serverProbe.ts` (new) | `probeServer({fetchFn, timeoutMs}): Promise<"ok" \| "unreachable">`, the same three-way probe plus a single retry as `mode.ts:11-33,51-52` | AC4 |
| `src/data/serverProbe.test.ts` (new; replaces `mode.test.ts`) | Probe tests | AC4, R8 |
| `src/data/mode.test.ts` | delete | Tests deleted code |
| `src/data/demo.ts`, `src/data/demo.test.ts` | delete | AC3 |
| `src/test/fixtures.ts` (new) | The demo items/locations moved here as `fixtureItems` / `fixtureLocations`, test-only | Keeps existing test coverage (consult §1) |
| `src/test/memoryRepo.ts` (new) | `createMemoryRepo(items, locations): WardrobeRepo`, an in-memory test double (the logic of `repo.ts:26-98` without localStorage) | Keeps App/hook UI tests without a production test seam |
| `src/data/repo.ts` | Keep the `WardrobeRepo`/`WearResult`/`WearOutcome` types; drop `mode` and the local repo (`:21-98`) | AC3 |
| `src/data/repo.local.test.ts` | delete | Tests deleted code |
| `src/data/repo.http.ts` | Drop `mode: "api"` (`:63`) | `WardrobeRepo.mode` removed |
| `src/data/repo.http.test.ts` | Drop the "mode is api" test (`:72-74`) | Same |
| `src/data/useWardrobe.ts` | Signature `useWardrobe({ getToken, onAuthLost } = {})`; always `createHttpRepo(...)`; `photos = getToken ? createPhotoLoader(...) : null`; drop `mode` from the return | AC3 |
| `src/data/useWardrobe.test.tsx` | Former "local mode" tests run against `createMemoryRepo` via `vi.mock("./repo.http")` with a per-test switch; api/identity tests use the new signature; drop the `"local"` photo-loader case | AC3 |
| `src/data/aiSettings.ts`, `src/data/aiSettings.test.ts` | Drop `localAiSettings` (unused, local-mode only, `aiSettings.ts:99-107`) and its test | AC3 |
| `src/data/usePhotoUrl.ts` | Comment line 4 only ("Null when no loader: …") | Stale local-mode text |
| `src/types/item.ts` | Comments lines 19-23: drop "local mode" / "demo" wording | Stale text |
| `src/lib/boot.ts` | Drop `needsAuth` and the `Runtime` import; keep `takeTokenHash` | AC3; consult §1 |
| `src/lib/boot.test.ts` | Drop the `needsAuth` tests; the "replaceState before /healthz" test uses `probeServer` | Same |
| `src/lib/startup.ts` (new) | `startup({ probe, dev, show })`: pure orchestration, see Approach step 4 | AC4, AC5 |
| `src/lib/startup.test.ts` (new) | Unit tests | AC4, AC5, R8 |
| `src/main.tsx` | Probe → unavailable / dev app / AuthRoot via `startup()`; keeps `takeTokenHash` first, `applySavedTheme`, `clearLegacyAuthKeys`, and the dynamic `import("./features/auth/AuthRoot")` (boundary test) | AC4, AC5 |
| `src/features/layout/ServerUnavailable.tsx` (new) | Full-page error with retry and an optional dev hint | AC4 |
| `src/features/layout/ServerUnavailable.test.tsx` (new) | Component test | AC4 |
| `src/features/layout/copy.ts` | Add `serverUnavailable: { title, body, retry, retrying, devHint }` (Vietnamese) | R6 |
| `src/features/auth/AuthRoot.tsx` | Drop the `identity` prop; always `createTokenStore`; `onRequestNew` always set; drop the `renderApp()` fallthrough (`:77`); update the doc comment | consult §1 (dead once local mode goes); High |
| `src/features/auth/AuthRoot.test.tsx` | Drop the `identity` prop; delete the two "+ access" tests (`:65-74`, `:119-133`) | Same |
| `src/App.tsx` | Props `{ getToken?, onSignOut?, onAuthLost? }` (no `mode`); `useWardrobe({ getToken, onAuthLost })`; drop the demo import; settings button and modal unconditional; drop `showMockAi` / `photoById` props; duplicate always clears the photo fields | AC3; **hotspot** |
| `src/App.test.tsx` | `vi.mock("@/data/repo.http")` switch: the UI describe uses `createMemoryRepo(fixtureItems, fixtureLocations)`, the API describes use the real http repo with the existing fetch stubs. Drop `mode="api"`. Replace "local mode has no settings button" / "local mode: demo items, no sign-out" with "settings button always shown" / "no sign-out without onSignOut" | AC3 |
| `src/features/items/Editor.tsx` | Drop the `showMockAi` prop and the mock "Tự điền từ ảnh" button (`:160-173`); drop the `photoById` prop and always use the by-id behaviour (`:174-183`) | AC3 |
| `src/features/items/Editor.test.tsx` | Drop the showMockAi tests (`:86-95`) and the prop from helpers; the photoById tests run without the prop | Same |
| `src/features/import-export/ImportModal.tsx`, `ImportPhotosTab.tsx` | Drop `showMockAi`; the mock AI checkbox goes | AC3 |
| `src/features/import-export/ImportModal.test.tsx` | Drop the showMockAi param/tests; one test "Photos tab shows no AI checkbox" | Same |
| `src/features/import-export/copy.ts` | Drop `photos.aiTitle` / `photos.aiHint` (now unused) | R6 one place, no dead copy |
| `src/features/import-export/download.test.ts`, `src/features/import-export/csv/map.test.ts` | Import from `@/test/fixtures` | demo.ts deleted |
| `scripts/dev-token.sh` (new, POSIX bash 3.2) | Signs in and writes the token file (Approach step 6) | Scope "Dev loop" |
| `scripts/dev-token.test.ts` (new) | Static invariants of the script | AC5 |
| `CLAUDE.md` | Drop `@AGENTS.md` and the comment block `:3-5`; rewrite the description (`:9-11`) and Stack (`:25-26`); rewrite R1; R10 → retired | AC6 |
| `README.md` | Lines 3, 12-13, 53, 76, 78; new "Development (dev loop)" section | AC6 |
| `docs/feature-list.md` | Lines 21, 28, 119 | AC6 |
| `server/README.md` | Docs only: line 64 drop "(or when Figma Make site settings inject inline scripts or styles)"; line 70 replace "Use `pnpm dev` (local mode) for UI work." with a pointer to the README dev loop | Stale; High path (`server/**`), A4 |
| `.claude/agents/implementer.md` (`:24`), `.claude/agents/reviewer.md` (`:23`), `.claude/agents/planner.md` (`:27`) | Replace the local-mode / Figma wording of R1/R10 with the new R1 and "R10 retired" | Agents enforce the rules from these lines; A4 |

`.env.example` is **not** changed: it does not mention local mode (it says "The browser build needs no variables", which is still true).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/data/serverProbe.test.ts` › "ok on 200 application/json {status:'ok'}" | AC4 |
| › "ok ignores the auth field (missing, 'identity', other)" | A7 |
| › "unreachable on 200 text/html (SPA host answer)" | AC4 |
| › "unreachable on a manual redirect (opaqueredirect / 3xx)" | AC4 |
| › "unreachable on 500 / 404 JSON" | AC4 |
| › "unreachable on JSON content-type with an invalid body (SyntaxError), no retry" | AC4 |
| › "unreachable on {status:'down'} and on a null body" | AC4 |
| › "network error → one retry → unreachable (fetch called twice)" | AC4 |
| › "network error then ok → ok" | AC4 |
| › "timeout aborts the request, retries once, then unreachable" (fake timers) | AC4 |
| › "requests /healthz with cache:no-store and redirect:manual" | regression of `mode.ts:16-20` |
| `src/lib/startup.test.ts` › "unreachable shows the unavailable view, never the app or the auth slice" | AC4 |
| › "retry probes again and continues to auth when the server is back" | AC4 |
| › "dev + ok renders the app without getToken and never loads the auth slice" | AC5 |
| › "prod + ok loads the auth slice" | regression |
| › "dev + unreachable passes dev=true (dev hint)" | AC4 |
| `src/features/layout/ServerUnavailable.test.tsx` › "renders the Vietnamese error and Thử lại; no item cards" | AC4 |
| › "Thử lại calls onRetry and is disabled while it runs" | AC4 |
| › "dev hint only when dev" | AC4 |
| `src/lib/boot.test.ts` › "replaceState runs before the /healthz fetch" (updated to `probeServer`) | D36 regression |
| `dev/devTokenProxy.test.ts` (`// @vitest-environment node`) › "applies only to serve, not build, not preview" | AC5 |
| › "proxy rule matches /api, /api/items/x, /healthz; not /apix, /healthzz, /src/api.ts" | AC5 |
| › "default target http://127.0.0.1:3000; TUDO_DEV_API overrides" | dev loop |
| › "token file: default under the home dir (outside the repo); TUDO_DEV_TOKEN_FILE overrides" | A2 |
| › "readDevToken: missing file → missing; not JWT-shaped → malformed; exp in the past → expired; valid → token (trailing newline trimmed)" | AC5 |
| › "rewriteAuth: always strips the client Authorization header" | AC5 |
| › "rewriteAuth: injects Bearer for sec-fetch-site same-origin or absent; not for cross-site, same-site, none" | AC5 |
| › "rewriteAuth: no header when the token is missing, expired or malformed" | AC5 |
| › "warnings never contain the token" | AC5 |
| › "source scan: no VITE_ in dev/; nothing under src/ or index.html mentions dev-token, devTokenProxy or TUDO_DEV" | AC5 |
| `scripts/dev-token.test.ts` › "reads the password with read -s, uses umask 077, sends Origin and X-MM-App, passes the password only through printf into a pipe (never in a curl/node argument), never prints the token" | AC5, D44 |
| `src/test/indexHtml.test.ts` › "index.html has the static title, lang, head tags in order; no figma slot; no inline script/style" and "public/robots.txt is noindex" | AC2 |
| `src/App.test.tsx` › "settings button is always shown and opens the AI settings modal"; "no sign-out without onSignOut"; "duplicate clears the photo" (now without mode); the existing UI tests on the memory repo | AC3 |
| `src/features/import-export/ImportModal.test.tsx` › "Photos tab shows no AI checkbox" | AC3 |
| `src/features/auth/AuthRoot.test.tsx` (updated, no `identity` prop) | regression |

## Approach
0. **Baseline, before any edit.** Run `pnpm build`. Copy `dist/index.html` and `dist/robots.txt` to the scratchpad. Paste the `<html lang>` line and the whole `<head>` into `impl-log.md` (needed for AC2).
1. **Figma removal.** Delete `.figma/` and `AGENTS.md`. Rewrite `vite.config.ts`. Write `index.html` statically:
   - `<html lang="vi">`;
   - after `<title>Tủ đồ của tôi</title>`, in this order:
     - `<meta name="description" content="<the site.json text verbatim>">`;
     - `<meta name="robots" content="noindex, nofollow">`;
     - `<link rel="icon" href="/favicon.png">`;
     - `<meta property="og:title" content="Tủ đồ của tôi">`;
     - `<meta property="og:description" content="<same text>">`.

   No inline `<script>` or `<style>` (CSP). Add `public/robots.txt`. Rename the package. Clean `.prettierignore`, `.gitignore`, `.dockerignore`:19-22 and `Dockerfile`:6. R10 no longer applies (D44).
2. **Server probe.** `src/data/serverProbe.ts` keeps the `mode.ts` logic, except:
   - it returns `"ok" | "unreachable"`;
   - it has no `dev` short-circuit, so in dev the probe goes through the proxy to the real server;
   - it ignores `auth` (A7).

   Delete `mode.ts`.
3. **Data layer.**
   - `WardrobeRepo` loses `mode`; delete the local repo and `demo.ts`.
   - `useWardrobe({getToken, onAuthLost})` always uses `createHttpRepo`. The photo loader exists only when `getToken` exists: production gets blob URLs (D34); in dev `<img src="/api/photos/<id>">` is authenticated by the proxy.
   - Remove `localAiSettings`.
   - R1 holds: every data access is still through `WardrobeRepo`.
4. **Startup.** `src/lib/startup.ts`:
   ```ts
   type View = { kind: "unavailable"; dev: boolean; retry: () => Promise<void> } | { kind: "devApp" } | { kind: "auth" };
   export async function startup(o: { probe: () => Promise<"ok" | "unreachable">; dev: boolean; show: (v: View) => void | Promise<void> }): Promise<void>
   ```
   - It shows `unavailable` on `"unreachable"`; `retry` runs `startup(o)` again.
   - On `"ok"` it shows `devApp` when `dev`, otherwise `auth`.

   `main.tsx` keeps `applySavedTheme()`, `clearLegacyAuthKeys()` (PROD only) and `takeTokenHash()` before anything else (D36). It then calls `startup({ probe: () => probeServer(), dev: import.meta.env.DEV, show })`, where `show` renders:
   - `<ServerUnavailable dev onRetry={retry}/>`;
   - `<App />` (dev: no `getToken`, no `onSignOut`);
   - or, after the dynamic `import("./features/auth/AuthRoot")`, `<AuthRoot verifyHash resetHash renderApp={(p) => <App {...p}/>}/>`.

   Vite replaces `import.meta.env.DEV` with `false` in builds, so the dev branch is dead code in production. Do not use a runtime "skip sign-in" signal (consult §2). The boundary test (`boundary.test.ts:59-73`) must stay green: only `main.tsx` mentions `features/auth`, and only through `import()`. A failed auth-chunk load never falls back to anything.
5. **Dev proxy plugin** `dev/devTokenProxy.ts`:
   - `apply: (_c, env) => env.command === "serve" && !env.isPreview`.
   - A `config()` hook returns `server.proxy` with one key `^/(api|healthz)(/|$)` → `target: process.env.TUDO_DEV_API || "http://127.0.0.1:3000"`.
   - `configure: (proxy) => proxy.on("proxyReq", (proxyReq, req) => rewriteAuth(...))`. Do not use the static `headers` option: it is read once.
   - Exported pure helpers:
     - `tokenFilePath(env, homedir)`: default `~/.config/tudocuatui/dev-token`, override with `TUDO_DEV_TOKEN_FILE`;
     - `readDevToken(path, now)`: synchronous read per request; trims; JWT-shape regex `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`; decodes the payload's `exp`;
     - `rewriteAuth(headers, tokenResult)`: always removes the client `authorization`; sets `Bearer` only when `sec-fetch-site` is `same-origin` or absent and the token is valid.
   - When the token is missing, expired or malformed, log one terminal line per distinct problem ("dev token missing/expired — run scripts/dev-token.sh"). Never log the token. Forward without the header, so the server answers 401.
   - The implementer confirms that Vite 8's proxy (`http-proxy-3`) fires `proxyReq` synchronously with a writable `proxyReq`, and records it in impl-log.
   - The plugin never sets `allowedHosts`.
6. **Token script** `scripts/dev-token.sh` (bash 3.2, `set -eu`):
   - **Constants:** `IDENTITY=https://api.mmlabs.online/api/v1`, `APP=tudocuatui`, `ORIGIN=https://tudocuatui.mmlabs.online`.
   - **Credentials:** the email comes from `TUDO_DEV_EMAIL` or `read -r`. The password comes from `read -rs` (from the TTY).
   - **Cookie jar:** in `mktemp -d` (chmod 700), removed by `trap … EXIT`.
   - **Login:** `printf '%s\n%s' "$email" "$pw" | node -e '<stdin → JSON.stringify({email,password})>' | curl -sS -X POST "$IDENTITY/auth/login" -H 'Content-Type: application/json' -H "X-MM-App: $APP" -H "Origin: $ORIGIN" -c jar -b jar --data-binary @- -o resp -w '%{http_code}'`. `printf` is a builtin, so the password is in no process argv. Unset `pw` right after.
   - **Token:** POST `/auth/token` `{audience, account_id}` with the jar. Validate `token_type=Bearer`, `audience=tudocuatui`, JWT shape. Write it with `umask 077` to `"$file.tmp"` then `mv` to `"$file"`.
   - **Logout:** best-effort POST `/auth/logout` (A8).
   - **Output:** print only the path and `expires_in`; on error, print the Identity error `code`, never bodies or tokens. Map 401 to "wrong email/password". Map a Turnstile-required or rate-limited answer to "Identity wants Turnstile (3 failed sign-ins): sign in once at https://tudocuatui.mmlabs.online, then retry".
   - **Header comment:** only Ming's own account; the local server must use a local DB.
7. **UI branches.** In App, Editor, ImportModal and ImportPhotosTab, remove the local-only branches listed in consult §1. Settings becomes unconditional; duplicate always clears the photo. R9: `ServerUnavailable` uses existing theme variables and `Btn`, works at 390px and in dark mode (the theme is applied before render), and has no fixed widths over 390px. R6: copy lives in `LAYOUT_COPY.serverUnavailable`, for example:
   - title "Không kết nối được máy chủ";
   - body "Ứng dụng cần máy chủ để tải tủ đồ. Kiểm tra kết nối rồi thử lại.";
   - retry "Thử lại", retrying "Đang thử lại…";
   - devHint "Dev: chạy server Node (pnpm start) và làm mới token bằng scripts/dev-token.sh".
8. **Tests.** Move the fixtures, add the memory repo, update the tests listed above. Keep `vitest.config.ts` coverage thresholds green; do not change thresholds.
9. **Docs.**
   - **CLAUDE.md R1:** "**API only, no fallback.** Every data access goes through `WardrobeRepo` (`src/data/`); the only implementation is the HTTP repo against the Node API (`/api`). Components never call `fetch` for data directly. There is no local/demo mode: when `/healthz` does not answer as the Node server, the app shows an error with retry (D44). Local development uses `pnpm dev` with the dev-only token proxy (`dev/devTokenProxy.ts`); its token never reaches the browser."
   - **CLAUDE.md R10:** "Retired (D44): Figma Make was removed."
   - **CLAUDE.md description and Stack:** React SPA + Node API (`server/`) + self-hosted Postgres + Google Drive photos + mmlabs Identity; hosting on the home server, Docker + Cloudflare Tunnel (D20). Leave R2–R4's Supabase wording as is (follow-up).
   - **README dev-loop section:**
     - Start the local server with a local DB.
     - Run `scripts/dev-token.sh` (token at `~/.config/tudocuatui/dev-token`), then `pnpm dev`.
     - Re-run the script every 15 min; no restart needed.
     - Turnstile after 3 failed sign-ins.
     - Bound to `127.0.0.1` (WSL: open `http://localhost:8443` from Windows).
     - Never point `DATABASE_URL` at production.
     - `pnpm preview` has no proxy.
10. **Checks.** Run `pnpm typecheck`, `pnpm format`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm build`. Then run the AC2 comparison and the AC1/AC3/AC5 greps, and record the outputs in impl-log.

## Specialist input used
`consult-software-architect.md`:
- **Adopted, §1:**
  - replace `detectRuntime` with a two-state probe;
  - a `ServerUnavailable` screen outside the auth chunk with copy in one module;
  - keep the `wardrobe.error` banner for post-start errors;
  - drop `WardrobeRepo.mode`, `showMockAi`, `photoById`;
  - settings and duplicate-clear unconditional;
  - drop `AuthRoot.identity` and `needsAuth`;
  - fixtures in `src/test/fixtures.ts`.
- **Adopted, §2:**
  - a separate plugin file with `apply` excluding build and preview;
  - a per-request token read in `proxyReq`;
  - strip the client Authorization header;
  - the JWT-shape check;
  - inject only for `same-origin` or absent `sec-fetch-site`;
  - one-line warnings, never the token;
  - `preview.proxy: {}`;
  - bind to `127.0.0.1`, never `allowedHosts: true`;
  - `TUDO_DEV_PORT`, no `VITE_` names;
  - the build-time `import.meta.env.DEV` switch;
  - `umask 077`.
- **Adopted, §3:** the static tags in the same order; `public/robots.txt`; compare by meaning, not bytes; no inline code (CSP); the skip-link not added; the build block reset to Vite defaults; remove the `.dockerignore` figma lines and `.prettierignore:2`.
- **Rejected:** "always create the photo loader with optional `getToken`" (§1). It adds test churn (blob URLs need `URL.createObjectURL` stubs in App tests) for no production change: production always has `getToken`, and in dev the proxy authenticates `<img>` requests. Only the `mode` check is removed.
- **Rejected:** "token script could refuse a production-looking `DATABASE_URL`". The script does not start the server, so a check in its shell proves nothing. The README states the rule instead.
- **Changed:** token file location. The consult's default is `.dev/dev-token` in the repo (Q2). This plan uses `~/.config/tudocuatui/dev-token` outside the repo, because Ming runs both the script and `pnpm dev` in WSL (the cross-OS reason for the in-repo option goes away). Git and Docker can then never see the file, and nothing depends on `.gitignore`, which the ticket says lost its `.env*` line once. See A2.

## Assumptions
These are for Ming to confirm at plan approval. The consult's open questions (Q1–Q5) are taken with their stated defaults unless noted.
- **A1 (Q1):** title and language are fixed to `Tủ đồ của tôi` / `lang="vi"` (and `og:title` follows), as a recorded, deliberate difference from today's `Figma Make App` / `en`. AC2 is read as "same tags otherwise". If Ming says keep, the implementer writes the old values and AC2 becomes byte-for-byte on those tags.
- **A2 (Q2, changed default):** the token file is outside the repo at `~/.config/tudocuatui/dev-token` (override `TUDO_DEV_TOKEN_FILE`), so `.gitignore` gets no token entry. Ming runs everything in WSL Ubuntu 24.04. If Ming prefers the consult default `.dev/dev-token`, the change is: add `/.dev/` to `.gitignore` and `.dev` to `.dockerignore`, add a `git check-ignore .dev/dev-token` test, and change the default path.
- **A3 (Q3):** no skip-link ships today (`site.json` has `addBypassLinks: false`), so none is added; AC2's "skip-link" means "none before, none after". Adding one is a follow-up.
- **A4 (Q5):** docs-only edits outside the ticket's file list are included: `server/README.md:64,70` and `.claude/agents/{implementer,reviewer,planner}.md`. `server/README.md` is High in `risk-tiers.yml`; the PR is High anyway (auth).
- **A5:** the ticket puts deploy config out of scope, but AC1 needs `FIGMA_PUBLIC_URL` gone from `Dockerfile:6`. The plan deletes only that comment line and the dead `.figma` lines 19-22 in `.dockerignore`; there is no functional change to the image. If Ming objects, keep both and amend AC1 to exclude them.
- **A6:** R10 is kept as a "Retired (D44)" row rather than deleted, so that the "R1–R10" references in 6+ agent/command files stay valid without renumbering. This removes the rule, as AC6 asks.
- **A7 (Q4):** the probe checks only `status:"ok"`; it ignores the `auth` field.
- **A8:** the script logs out its Identity session after taking the token (best effort), assuming the JWT stays valid until `exp` (the server verifies it locally against JWKS). If Ming's check shows logout kills the token, the logout step is dropped in a follow-up.
- **A9:** WSL2 forwards Windows `localhost:8443` to a WSL socket bound to `127.0.0.1` (default localhost forwarding or mirrored mode). If it does not on Ming's machine, the fix is WSL networking config, not binding to `0.0.0.0`.
- **Behaviour changes Ming should expect:**
  - the fake "Tự điền từ ảnh" button and the "Dùng AI nhận diện" checkbox disappear (F-702 will add the real one);
  - `pnpm dev` without a running Node server shows the error screen;
  - the sign-in UI is never exercised in dev (only in tests and production);
  - the 401 message in dev says "tải lại trang để đăng nhập lại", and reloading after refreshing the token does work.
- **Left as is (follow-ups, not in this diff):**
  - a stale `tu-do-items` localStorage key in old browsers;
  - unused `.ai-btn` CSS and `sparkle` icon (F-702 may reuse them);
  - `not_available` AI error code / copy;
  - Supabase wording in CLAUDE.md R2–R4 and Risk tiers;
  - AgentPlat lines in `.gitignore` and `public/.gitattributes`;
  - a `dev-token` grep in `scripts/check-image.sh`;
  - the `docs/feature-list.md` "Current state" section, which is historical.
- **Hotspots:**
  - `src/App.tsx` is edited.
  - T-019 (IN_PROGRESS umbrella) owns the auth slice; this ticket edits `src/features/auth/AuthRoot.tsx` and `src/main.tsx`, so expect a rebase if a T-019 slice lands first.
  - F-702 (BLOCKED) will edit `Editor.tsx` where the mock button is removed.
- **Size.** This is well over 400 changed lines, but mostly deletions (the about 440-line Figma plugin block, the local repo, the demo data and their tests) and moves (fixtures, memory repo). Ming decided one ticket ("Gom chung", D44).

## Blocking questions
None.

## Split proposal
None. Ming explicitly kept this as one ticket (D44, "Gom chung"). If review cycles stall, the natural cut is (1) Figma removal + static index.html, then (2) local-mode removal + dev proxy + docs.
