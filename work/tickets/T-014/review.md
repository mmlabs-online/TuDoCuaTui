## Attempt 1 — 2026-11-11
Verdict: PASS

### Checks (run by reviewer)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: "All matched files use the correct format."
- test: 55 files passed / 4 skipped; 620 tests passed / 42 skipped. Matches impl-log.md.
- build: `vite build` OK (`dist/assets/index-*.js` 247 kB)
- test:coverage (extra): green, thresholds hold; apiErrors.ts 100% lines, mode.ts 94%, repo.http.ts 100%.
- E2E smoke (reviewer reproduced): PG 16 in /tmp with scram password auth; `node server/migrate.js` applied `20261110120000_init`; `TUDO_ACCESS_DISABLED=1 node server/index.js` on the fresh `dist`; Playwright chromium at 390×844, DSF 1, light and dark (`prefers-color-scheme` emulated and `tu-do-theme=dark`; `<html class="dark">` confirmed):
  - API mode, no login: 0 password/email fields, no "Đăng xuất", list starts empty (0 cards, not the 16 demo items).
  - Editor: "Ảnh món đồ — Sắp có" visible, 0 `input[type=file]`, no "Chụp ảnh".
  - Empty name → client error "Vui lòng nhập tên món đồ".
  - Server-side validation (PUT body intercepted, name blanked) → real 400 `invalid_input/nameRequired` → toast "Vui lòng nhập tên món đồ".
  - Create, edit, wear (+1, second +1 → "Đã ghi nhận hôm nay rồi", −1) and delete each survived a reload, in both themes.
  - No page errors. The only console error is the deliberate 400.
- Expired Access: the server with `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` set and no JWT gives `/api/items` 401 `{"error":{"code":"unauthorized"}}`. The banner shows "Không tải được tủ đồ: Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại" in light and dark, with no login form. A routed 302 on `/api/**` (opaqueredirect) shows the same message and the page does not navigate away.
- Local mode: `pnpm dev` with empty `VITE_SUPABASE_*` shows 16 demo cards and no login. It made 0 requests to `/healthz` or `/api` in either theme. The local editor still has "Chụp ảnh" and 2 file inputs.
- Servers stopped, PG stopped, data dir deleted.

### Acceptance criteria
- [x] All existing app tests pass in local mode — evidence: `pnpm test` green. Existing test files have only additive edits: `Editor.test.tsx` (optional 3rd arg on `renderEditor` + a new describe) and `useWardrobe.test.tsx` (new "api mode" describe).
- [x] New tests cover the HTTP repo — evidence: `src/data/repo.http.test.ts` covers URL, method, headers, exact PUT key set, UUID generation, photos ignored, 204, wear, and 400/401/opaqueredirect/404/409/413/503/500/non-JSON/network. Also `apiErrors.test.ts` and `mode.test.ts`.
- [x] No login screen in API mode — evidence: `src/Root.tsx:7` uses AuthGate only for `supabase`. `Root.test.tsx` checks api mode (no email field, no "Đăng xuất", `getSession` not called) with a supabase control case. E2E confirms it.
- [x] Photo upload disabled with "Sắp có" — evidence: `src/App.tsx:171` and `src/features/items/Editor.tsx:86,138,171`; copy is at `src/features/items/copy.ts:7-8`. Editor tests and E2E confirm it.
- [x] 390px and dark mode unchanged (R9) — evidence: no CSS in the diff. Screenshots at 390px light/dark: the "Sắp có" block uses the existing `.upload-zone` styling and looks the same as the upload zone.
- [x] Mode detection — evidence: `src/data/mode.ts:17` (JSON + `status:"ok"` only) and `:41` (no probe in dev). The E2E Node server selected api; Vite dev selected local.
- [x] D26 A3 / R10 — evidence: `git diff --name-only origin/main...HEAD` lists no Dockerfile, .dockerignore, release.yml, check-image.sh, .github/**, server/**, vite.config.ts, index.css, AGENTS.md or .figma/.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: the third repo is behind `WardrobeRepo` (`src/data/repo.http.ts`), and local mode was verified on `pnpm dev`.
- R3: no new `VITE_*` variable or secret.
- R6: copy lives in `API_ERROR_COPY` (`src/data/apiErrors.ts`) and `EDITOR_COPY`; validation reasons reuse the editor copy.
- R7: every file is in the plan.
- R8: green checks and tests for new logic.
- R9: verified at 390px in light and dark.
- R10: untouched.

### Nits (do not block)
- `src/data/repo.http.test.ts:184` — `toMatch(/^2026-03-(09|10)$/)` is looser than needed. TZ is fixed to Asia/Ho_Chi_Minh in `vitest.config.ts`, so this could assert `"2026-03-10"` exactly.
- Server code `method_not_allowed` and reasons such as `todayOutOfRange`/`idInvalid` fall back to the generic messages. That is acceptable, but the specific messages could be added later.

### Follow-ups (out of scope)
- Pre-existing, in both local and API mode: at 390px the header "+" add button is clipped at the right edge, and the active "Tất cả" filter chip label is barely visible in dark mode. Not caused by this diff.
- From the plan: T-016 drops the supabase branch, re-homes the row types and makes the fallback local-only. Data move Supabase → Postgres (A11) if Ming wants it.

### Security follow-up to fix (Ming, 2026-11-11: "Sửa rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. `src/data/mode.ts:16` — the `/healthz` probe follows redirects, so an expired Cloudflare Access session at startup falls back to Supabase mode (login screen). Use `redirect: "manual"` on the probe and treat `res.type === "opaqueredirect"` as an Access-protected Node host (→ API mode, so the first `/api` call shows the "phiên truy cập đã hết hạn" message). Add a `mode.test.ts` case for opaqueredirect → `api`.

## Attempt 2 — 2026-11-11
Verdict: PASS

Scope of this attempt: only the security follow-up from attempt 1 (opaqueredirect on the `/healthz` probe).

### Checks (run by reviewer)
- typecheck: exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: exit 0 ("Finished … on 165 files")
- test: 55 files passed / 4 skipped; 621 tests passed / 42 skipped. That is attempt 1's 620 plus the new case, and it matches impl-log.md attempt 2. `vitest run src/data/mode.test.ts`: 11/11 pass.
- build: `vite build` OK (`index-*.js` 247.24 kB)
- Browser smoke (reviewer, Playwright chromium at 390×844): fresh `dist` served by a throwaway Node static server, with no Supabase env in the build:
  - `/healthz` → SPA fallback `index.html` 200 text/html: **local mode**. 16 demo cards, 0 `/api` requests, 1 probe.
  - `/healthz` → 302 to `https://*.cloudflareaccess.com/…`, and `/api/**` 302 too (expired Access): **API mode**. Banner "Không tải được tủ đồ: Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại". No login form, the page did not navigate away (1 main-frame navigation).
  - `/healthz` → 302 to `/` while `/api/**` gets SPA-fallback HTML 200 (a hypothetical static host that redirects `/healthz`): **API mode** (the expected trade-off, see below). Banner "Không tải được tủ đồ: Máy chủ phản hồi không hợp lệ, tải lại trang nhé". Empty list, no crash, no navigation.

### Fix verification
- `src/data/mode.ts:18-22`: the probe now passes `redirect: "manual"`, keeping `cache: "no-store"` and the abort signal.
- `src/data/mode.ts:23`: `res.type === "opaqueredirect"` → `"yes"` → `pickMode(true, …)` = `api`, even with Supabase env set. This matches how `repo.http.ts:32` treats the same signal (401 unauthorized → "phiên truy cập đã hết hạn" copy).
- `src/data/mode.test.ts:39` asserts `redirect: "manual"`. `src/data/mode.test.ts:42-46` checks opaqueredirect → `api` with `hasSupabase=true` and a single fetch, so no retry.
- Dev path is unchanged: `src/data/mode.ts:48` returns before any probe when `import.meta.env.DEV`. This covers the Figma Make preview (Vite dev server per AGENTS.md) and `pnpm dev`.
- Diff: `git show e4d31e6 --stat` shows only `src/data/mode.ts` (+8/−1), `src/data/mode.test.ts` (+7) and `impl-log.md`. `90a314b` only flips ticket.md State REWORK→REVIEW. `git diff --name-only origin/main...HEAD` is unchanged from attempt 1 apart from these files, and it still lists no server/**, .github/**, public/**, vite.config.ts, AGENTS.md or .figma/.

### Can a non-Node host now wrongly pick API mode?
Only a host that answers same-origin `GET /healthz` with a 3xx while the SPA page itself loaded fine. Realistic cases:
- **Vite dev / Figma Make preview**: no probe at all (`mode.ts:48`). Not affected.
- **Cloudflare Pages (D5)**: the repo has no `public/_redirects`, and `dist/` has no `healthz` / `healthz.html` / `healthz/` entry. Pages' pretty-URL redirects therefore don't fire, and an unknown path gets the SPA fallback `index.html` with 200 text/html → "no". Not affected.
- **HTTP→HTTPS or host canonicalisation**: the probe is relative and same-origin with a page that already loaded on the final scheme/host. Not affected.
- **Cloudflare Access in front of a static host (e.g. Pages preview protection)**: `index.html` is gated by the same Access cookie, so a 302 on `/healthz` only happens if the session expires between loading the HTML (or serving it from browser cache) and the probe. Result: API mode with the "phiên truy cập đã hết hạn — tải lại trang" banner. Reloading re-authenticates, and the next probe returns HTML → Supabase/local. The user sees one recoverable error and loses no data. Before this fix, the same race fell back to Supabase/local, so this edge is a wash.
- **A host configured to redirect `/healthz` specifically** (custom rule, trailing-slash on a real directory): API mode. The banner reads "Máy chủ phản hồi không hợp lệ, tải lại trang nhé" (or the expired-session text if `/api` also redirects). The list is empty, nothing is written, and local/Supabase data stays untouched but is not reachable. No such configuration exists in this repo or its deploy targets.

Conclusion: no realistic deployment of this repo now wrongly selects API mode, and the failure mode is visible and non-destructive.

### Acceptance criteria
Attempt 1 evidence still holds; the full suite is green. The follow-up criterion is met:
- [x] Expired Access at startup → API mode, not the Supabase login — evidence: `mode.ts:20,23`, `mode.test.ts:42-46`, and the browser smoke "302ext" case above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: local mode is verified in the browser smoke (SPA case) and dev skips the probe. R3: no new env/secret. R7: only the follow-up's files changed. R8: checks green, and the new branch is tested. R10: untouched.

### Nits (do not block)
- The `mode.ts:11` docstring still says SPA hosts answer with HTML. A one-line mention that a redirect counts as the Node host (Access) would help future readers. The comment at `:16-17` partly covers it.

### Follow-ups (out of scope)
- Same as attempt 1.
