# T-025 consult: software-architect (read-only)

## Summary
- **The skip-link in the scope does not exist today.** `.figma/make/site.json:6-9` sets `addBypassLinks: false`.
- **The current page title and language are wrong.** No title or language is set in `site.json`, so production ships `<title>Figma Make App</title>`, `og:title="Figma Make App"` and `lang="en"`. Ming has to decide whether "equivalent" means keeping these.
- **The Vite dev server listens on every network interface.** Once a proxy adds Ming's token to requests, anyone on the same network could use it. This has to change.
- **`vite preview` would also get the token proxy.** A plugin marked `apply: "serve"` still runs under `vite preview`, and preview reuses the dev proxy settings by default.

## 1. Removing local mode

### Findings
- **The mode switch:**
  - `src/data/mode.ts:1-4` defines `DataMode` and `pickMode`.
  - `mode.ts:50` makes `pnpm dev` always local.
  - The probe at `mode.ts:11-33` already tells three cases apart: a JSON answer (yes), an HTML or redirect answer (no), and a network failure or abort (error). The error case is retried once at `mode.ts:52`.
- **The server is now always Identity:**
  - `/healthz` always returns `auth: "identity"` (`server/auth.js:20-21`, `server/app.js:87`).
  - So these are dead once local mode goes:
    - the "non-identity api" branch in `src/lib/boot.ts:23-26`;
    - AuthRoot's `identity` prop and its `store === null` branch (`AuthRoot.tsx:26,52,67-77`).
- **The data layer:**
  - The `WardrobeRepo.mode` field is at `src/data/repo.ts:11`.
  - The local repo is `repo.ts:21-98`.
  - `useWardrobe(starter, defaultLocations, mode = "local", …)` is at `src/data/useWardrobe.ts:23-35`.
  - The photo loader is only built when `mode === "api" && getToken` (`useWardrobe.ts:37-40`).
- **UI branches that only exist for local mode (`src/App.tsx`):**
  - line 28 imports the demo items;
  - line 119 hides the settings button outside api mode;
  - lines 197 and 258 pass `showMockAi`, the fake "Tự điền từ ảnh" button (`Editor.tsx:160-173`, `ImportPhotosTab.tsx:22`);
  - line 198 passes `photoById` (`Editor.tsx:174-183`);
  - lines 208-212 clear the photo on duplicate only in api mode;
  - line 270 gates the settings modal on api mode.
- **Tests that use the deleted code:**
  - `repo.local.test.ts` and `demo.test.ts` test it directly.
  - `mode.test.ts` checks for "local" at lines 23-118.
  - `boot.test.ts:65-67`.
  - `useWardrobe.test.tsx:49,215`.
  - `Editor.test.tsx:86-91` and `ImportModal.test.tsx:143-148` (the `showMockAi` tests).
  - These import demo data as test fixtures: `App.test.tsx:6`, `download.test.ts:3`, `csv/map.test.ts:3`.
- **Things that do not depend on local mode** (keep them):
  - `aiSettings` passes requests through when there is no `getToken` (`authFetch.ts:24`).
  - `legacySession` only runs in production (`main.tsx:11`).
  - `theme` (`App.tsx:51,76-79`).
  - `importRunner`.
  - The auth preview page (`auth-preview.html` and `src/features/auth/preview/main.tsx:7`), which is dev-only and has nothing to do with Figma.
- **Stale docs outside the ticket's file list:**
  - `README.md:3,12-13,76,78`
  - `server/README.md:70` ("Use `pnpm dev` (local mode)")
  - `.claude/agents/implementer.md:24` and `.claude/agents/reviewer.md:23` (R1/R10 wording)
  - `.prettierignore:2`

### Recommendations
- **Startup probe:**
  - Replace `detectRuntime` with `probeServer({fetchFn, timeoutMs}): Promise<"ok" | "unreachable">`.
  - Keep the same three-way logic and the single retry. Ignore the `auth` field, or treat anything other than `"identity"` as unreachable.
  - Drop `DataMode`, `pickMode`, `detectMode` and `AuthKind`.
  - The AC "error state, never demo data" is covered by unit tests: server down, HTML answer, JSON answer, timeout.
- **Startup flow in `main.tsx`:** probe, then one of:
  - unreachable: render a small `ServerUnavailable` screen outside the auth chunk. Vietnamese copy lives in one copy module (R6). It has a "Thử lại" button that probes again and then boots. In dev it adds one extra line: "start the Node server / refresh the dev token".
  - ok and production: lazy-load `AuthRoot` as today.
  - ok and dev: see section 2.
- **Errors after startup:** keep them separate. The existing `wardrobe.error` banner with retry (`App.tsx:123-136`) already covers failures once the app is open.
- **Data layer:**
  - Make it `useWardrobe({getToken, onAuthLost})` with no demo data or mode.
  - Remove `mode` from `WardrobeRepo`, but keep the interface as the test seam. Rewrite R1 around it: "HTTP only, no fallback".
  - Always create the photo loader. Make `getToken` optional in `createPhotoLoader` (`photoUrls.ts:17`); `createAuthedFetch` already passes requests through without it. That way dev and production both load photos as blob URLs instead of dev using plain `<img>` links.
  - Delete the `null` path in `PhotoLoaderContext`, or keep it only for tests.
- **App and components:**
  - Delete the `showMockAi` prop and the mock button.
  - Delete the `photoById` prop and always use the by-id behaviour.
  - Make settings and the duplicate-photo clearing unconditional.
- **Auth slice:**
  - `AuthRoot`: drop the `identity` prop, always create the store, and make `onRequestNew` unconditional.
  - `boot.needsAuth` disappears.
  - This touches `src/features/auth/**`, so the `plan-approval` gate is confirmed.
- **Test fixtures:** move the few items the tests need into `src/test/fixtures.ts` instead of deleting the coverage. Name them as fixtures, not "demo", so the "no demo items in `src/`" grep is clear-cut.

## 2. Dev-only token-injecting proxy (option C)

### Findings
- **Network exposure:**
  - `vite.config.ts:35,43` binds the dev and preview servers to `FIGMA_DEV_SERVER_HOST || "0.0.0.0"`, which is every network interface.
  - With token injection, any device on the LAN could call `http://<ming-ip>:8443/api` as Ming.
- **`vite preview` also gets the proxy:**
  - Vite runs `vite preview` with `command === "serve"`, so an `apply: "serve"` plugin also loads there.
  - `preview.proxy` defaults to `server.proxy`.
  - `package.json:10` has a `preview` script.
- **The token is not in production builds:**
  - `vite.config.ts` is never bundled.
  - The runtime image copies only `dist`, `server` and production `node_modules` (`Dockerfile:36-40`), so the production Node server cannot reach the proxy code.
  - `.dockerignore:11,14` already excludes `scripts` and `.env*`.
- **Server-side protections already in place:**
  - The server rejects cross-site and same-site writes using `Sec-Fetch-Site` (`server/api.js:91-94`). Requests through the proxy from localhost:8443 arrive as same-origin and pass.
  - It sends no CORS headers, so other sites cannot read the responses.
- **Current behaviour without a token in the browser:**
  - Without `getToken`, `createAuthedFetch` passes requests through (`authFetch.ts:24`).
  - On a 401 the user sees "Phiên … tải lại trang để đăng nhập lại" (`apiErrors.ts:10`), which is misleading in dev.
- **The token store design stays valid:** the token lives only in a closure (`tokenStore.ts:33-36`). Dev must simply not build a token store.
- **Vitest runs with `import.meta.env.DEV === true`.** `mode.ts:43` already injects `dev` for this reason; keep that pattern.

### Recommendations
- **One plugin, in its own file** (e.g. `dev/devTokenProxy.ts`, added to the `tsconfig` include):
  - Set `apply: (_cfg, env) => env.command === "serve" && !env.isPreview`.
  - Its `config()` hook returns `server.proxy` for `^/(api|healthz)(/|$)` pointing at `TUDO_DEV_API` (default `http://127.0.0.1:3000`).
  - Use `configure: (proxy) => proxy.on("proxyReq", …)` to:
    1. remove any incoming `authorization` header;
    2. read the token file synchronously on each request (it is tiny; this means a refresh needs no restart);
    3. check the token against a JWT-shaped pattern (`^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`);
    4. set `Authorization: Bearer …`.
  - Do not use the static `headers` option: it is read once at startup.
  - Confirm the proxy library in Vite 8 (`http-proxy-3`) still fires `proxyReq` synchronously.
- **Defence in depth in the proxy:**
  - Inject only when `sec-fetch-site` is `same-origin` or absent.
  - Never log the token. When the file is missing or the decoded `exp` has passed, log one line in the terminal ("dev token missing/expired, run scripts/dev-token.sh") and still forward the request without the header, so the server returns 401.
- **Set an explicit `preview.proxy: {}`** as a second guard, or drop the `preview` script.
- **Bind to `127.0.0.1`** in both `server` and `preview`. Never set `allowedHosts: true`; Vite's default host check also blocks DNS-rebinding attacks.
- **Port:**
  - Use `TUDO_DEV_PORT` (default 8443) instead of `PORT`, because the Node server also reads `PORT`.
  - Do not use a `VITE_` prefix for anything in this feature.
- **How the SPA knows it is signed in through the proxy:**
  - Decide this at build time with `import.meta.env.DEV`, read once in `main.tsx` and passed down as an injectable flag for tests.
  - In dev, skip `AuthRoot` entirely and render `<App />` with no `getToken` (requests are already authenticated by the proxy) and no `onSignOut`.
  - Vite replaces `import.meta.env.DEV` with `false` in builds, so this branch is dropped from production.
  - Do not use a runtime signal such as `/healthz` returning `auth:"dev-proxy"`: that would put a "skip sign-in" branch into the production bundle that depends on what the server sends.
- **Token file location** (needs Ming's answer, question 2):
  - Option (a), recommended: `.dev/dev-token` in the repo, plus `/.dev/` in `.gitignore` and `.dev` in `.dockerignore`, and a test that runs `git check-ignore .dev/dev-token`. It works whether Ming runs Vite in Windows or in WSL.
  - Option (b): a file outside the repo (`$TUDO_DEV_TOKEN_FILE`, default `~/.config/tudocuatui/dev-token`). Git and Docker can never see it, but Windows and WSL home folders differ.
  - In both cases the script writes with `umask 077`.
- **Tests for the AC:**
  - Unit-test that `apply` returns false for `build` and for `isPreview`.
  - Unit-test the header-rewrite helper (drops client Authorization, rejects malformed tokens, works without the file).
  - A grep/build test that `dist/` has no `dev-token`, `devTokenProxy` or `Bearer` literal from config.
  - A test that `main.tsx` in dev mode never creates a token store and nothing writes a token to storage.

## 3. Replacing `figmaSiteConfiguration`

### Findings
What the plugin emits in production today, given `site.json`:
- `lang="en"` (`vite.config.ts:94`).
- `<title>Figma Make App</title>` (line 88).
- These tags, appended in this order at the end of `<head>` (lines 132-163):
  - `meta name=description` with the Vietnamese text;
  - `meta name=robots content="noindex, nofollow"`;
  - `link rel=icon href="/favicon.png"` (from `public/favicon.png`);
  - `meta property=og:title "Figma Make App"`;
  - `meta property=og:description`.
- `robots.txt` containing `User-agent: *\nDisallow: /\n` (lines 100, 112-119).
- **No skip-link, no inline `<style>`, no Google Analytics script, no custom scripts:** those `site.json` options are unset or false.
- **CSP:** `server/http.js:8-9` (`script-src 'self' challenges.cloudflare.com`, `style-src 'self' fonts.googleapis.com`) does not allow inline code, and `server/static.test.ts:220` asserts there is no `'unsafe-inline'`.
  - Nothing in the current build output relies on inline code, so the CSP needs no change.
  - Any inline `<style>` or `<script>` you add to `index.html` would be blocked in production.
- **Other Figma remnants:**
  - `server/static.js` has no Figma-specific logic.
  - `.dockerignore:19-22` exists only so `site.json` reaches the Docker build.
  - `Dockerfile:6` and `README.md:53` carry the `FIGMA_PUBLIC_URL` comment.
  - The `mode === "development"` sourcemap switch (`vite.config.ts:11-19`) exists only for `.figma/make/deploy-preview`.

### Recommendations
- **Static `index.html`:** write the values directly, in the same tag order, after `<title>`. Put `robots.txt` in `public/`; Vite copies it to `dist/` and serves it in dev. Delete every `<!-- figma:* -->` placeholder.
- **Compare by meaning, not bytes:** Vite's tag injection adds its own indentation and attribute quoting. Have the plan extract `lang`, `<title>` and the list of head `meta`/`link` tags from `dist/index.html` on `main` and on the branch, compare them, and compare `robots.txt` byte for byte.
- **If a skip-link is added anyway**, put its CSS in `src/index.css`, never in an inline style. It would be a new feature, not "equivalence", so it belongs in follow-ups (R7).
- **Clean up:**
  - remove `.dockerignore:19-22`;
  - simplify the sourcemap/minify block to Vite's defaults;
  - drop `.prettierignore:2`;
  - `tsconfig` `resolveJsonModule` can stay.
- **`package.json` rename:** a non-workspace pnpm lockfile does not record the package name, so this is safe.

## Risks
- **The Dockerfile comment edit:** `Dockerfile:6` sits in a deploy-config path that the ticket excludes ("no change to deploy config"). The edit is comment-only, but the PR tier may go up.
- **The dev token is a live credential:**
  - Binding to `0.0.0.0` exposes it to the LAN.
  - The local server's `DATABASE_URL` and Drive settings must not point at production. The README should state this, and the token script could refuse to run if a production-looking `DATABASE_URL` is set in the shell.
- **The sign-in path is no longer exercised during development.** Dev skips `AuthRoot` entirely, so regressions there only show up in tests or in production.
- **Removing `showMockAi` changes visible UI** (the fake button disappears). That is expected under D44, but Ming should know.
- **The "no `localStorage` stores wardrobe data" AC:** the old `tu-do-items` key stays in browsers that used local mode. Leaving it there is harmless; note it as a follow-up rather than adding cleanup code.
- **Undo cannot reach Figma Make:** once `.figma/` is deleted there is no sync back from Figma Make.

## Open questions for Ming (batch)
1. **Title and language:** keep `Figma Make App` / `lang="en"` to match the AC exactly, or fix them to `Tủ đồ của tôi` / `lang="vi"` as a recorded, deliberate difference?
   - Default: fix them and update the AC wording, since they are user-facing bugs.
2. **Token file location:** `.dev/dev-token` in the repo (git- and docker-ignored, works across Windows and WSL), or outside the repo through `TUDO_DEV_TOKEN_FILE`?
   - Default: in the repo, with a `git check-ignore` test.
   - Related: does Ming run `pnpm dev` in Windows Node or in WSL?
3. **The skip-link line in the AC:** drop "skip-link" from the AC because none ships today, or add one as a new feature?
   - Default: drop it from the AC and record a follow-up.
4. **Unknown `/healthz` `auth` values:** should a value other than `"identity"` count as "server unreachable"?
   - Default: no, check only `status:"ok"`.
5. **Docs outside the listed files:** may this ticket also update `server/README.md:70` and `.claude/agents/{implementer,reviewer}.md` (R1/R10 text)?
   - Default: yes, docs only.
