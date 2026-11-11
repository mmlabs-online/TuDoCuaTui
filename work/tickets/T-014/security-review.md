# Security review — T-014

## Attempt 1 (2026-11-11) — security-ai-generated-code-auditor

No 🔴. One 🟡, six 🟢. Code read only; no .env read.

### 🟡 Should fix
1. **`/healthz` probe follows redirects** — `src/data/mode.ts:16` uses default `redirect: "follow"` (`repo.http.ts:27` uses `"manual"`). With an expired Cloudflare Access session, Access answers `/healthz` with a 302 to `<team>.cloudflareaccess.com`; the cross-origin follow fails CORS → `TypeError` → retried, fails → `pickMode(false, true)` → `supabase` → the Supabase login form on the production host. No data exposure (RLS, JWT on `/api`), but wrong login shown and a sign-in writes to the legacy store; the real cause is hidden. Fix: `redirect: "manual"` on the probe; treat `res.type === "opaqueredirect"` as an Access-protected Node host (`"yes"`) so API mode loads and the first `/api` call shows `API_ERROR_COPY.unauthorized`; add a `mode.test.ts` case. Or record it as accepted under A4.

### 🟢 Notes
2. A hostile/cached/non-Node host cannot meaningfully flip the app into API mode (`mode.ts:16-21`: ok + JSON + `{status:"ok"}`, same origin, `no-store`; no service worker); a wrong API mode builds only `createHttpRepo` (`useWardrobe.ts:32`); AuthGate is UX-only, RLS enforces. Dev builds skip the probe (`mode.ts:41`) — R1 intact.
3. API mode doesn't reach Supabase data. Leftovers for T-016: `getAiSettingsRepo()` (`aiSettings.ts:80-82`) picks Supabase whenever env is set (no caller today); `src/lib/supabase.ts` still creates the client with `persistSession`/`autoRefreshToken`/`detectSessionInUrl`, so an old session keeps refreshing with no sign-out in API mode (`App.tsx:89`) — stop creating the client and clear `sb-*-auth-token` in T-016.
4. No XSS sink: server `code`/`reason` are lookup keys only (`apiErrors.ts:31-38`), prototype keys fall back to `generic`; only `requestId` rendered as a text node (`Toast.tsx:21`, `App.tsx:106`); no `dangerouslySetInnerHTML`. Optional: accept `requestId` only when it is a UUID.
5. Ids unencoded in paths (`repo.http.ts:68,73`); `remove`/`wear` lack the `isUuid` guard that `save` has (`:59`). Defence in depth: guard or `encodeURIComponent`.
6. Response shape trusted after 200 (`repo.http.ts:52,65,77`) → English `TypeError` text on a malformed body (R6). Optional shape checks → `ApiError(res.status, "unexpected")`.
7. Checked fine: same-origin `/api`, `credentials: "same-origin"`, `redirect: "manual"` maps Access expiry to 401; no tokens in URLs/logs; CSRF (JSON content type, no-body DELETE, server Sec-Fetch-Site check); probe timeout covers body read; `crypto.randomUUID` (secure contexts); no new `VITE_*` (R3); `createLocalRepo` unchanged (R1).

### Risks / open questions
- Until T-016 a failed probe on the Node host shows the Supabase login; a sign-in writes to the legacy store (integrity/UX).
- Confirm no Cloudflare Cache Rule overrides `no-store` on `/healthz`.

## Attempt 2 (2026-11-11) — security-ai-generated-code-auditor (commit e4d31e6)

Attempt-1 🟡 fixed. No 🔴, no new 🟡. Code read only.

- Fix: `src/data/mode.ts:18-22` `redirect: "manual"` (keeps `no-store` + abort); `:23` opaqueredirect → `"yes"` → API mode even with Supabase env, no retry. `/api` maps opaqueredirect to 401 `unauthorized` (`repo.http.ts:32`, copy `apiErrors.ts:9`). Tests `mode.test.ts:39,42-46`; negative cases unchanged (`:48-57`).

### 🟢 Notes
1. No data exposure: API mode builds only `createHttpRepo()` (`useWardrobe.ts:32-33`), same-origin `/api` only; AuthGate skip (`Root.tsx:7`) is UX-only; RLS and the server JWT check enforce.
2. A non-Node host that redirects `/healthz` (Pages redirect rule, `healthz.html`/trailing-slash 308, Pages behind its own Access app) would load API mode with an empty UI and an error banner; nothing written anywhere. Node server never redirects `/healthz` (`server/app.js:45-48`); plain Pages SPA fallback (200 HTML) still → `"no"`. Optional: document "`/healthz` must never redirect on the SPA host" (server/README.md / D5).
3. Not attacker-steerable: same-origin relative probe; `Location` never read; dev builds skip the probe (`mode.ts:48`).
4. Leftover for T-016 (unchanged): live Supabase client with `persistSession`/`autoRefreshToken`, no sign-out in API mode; `getAiSettingsRepo()` has no caller.

Open: confirm no Cloudflare Cache Rule overrides `no-store` on `/healthz`.
