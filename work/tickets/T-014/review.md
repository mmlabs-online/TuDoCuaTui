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
