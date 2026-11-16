# Security review — T-019.9

## Attempt 1 (HEAD 9891e84) — security-ai-generated-code-auditor, 2026-11-16

No 🔴 findings. Two 🟡 doc items and two notes. Read-only review (no git diff / checks / image script run by the auditor).

### Confirmed
1. No unauthenticated path to `/api/*`: `server/app.js:98-104` guards every `/api` request with `auth.authenticate` (401 on failure); `server/auth.js:35-37` `createAuth` returns only `createIdentityAuth`; the always-true test authenticator `server/test/auth.ts` is excluded from the image (`check-image.sh:71-72`); `server/ai/config.js` lost the "request auth off" branch, `AI_KEK` still deleted from env (`:31-33`). `//api/...` / `/./api` never reach `handleApi`.
2. Startup fails closed: `auth.js:20-25` (unset → identity; any other value incl. `""`, `Identity`, `" identity"`, `access` → fixed-message error); issuer check `identity.js:23-44` (prod exactly `https://api.mmlabs.online`); owner sub via `toUserId` (rejects non-UUID and nil UUID, `user.js:16`); `index.js:29-35` exit 2 with only the fixed message. `check-image.sh:101-113` covers each case.
3. No env values in error messages (fixed strings; `index.cli.test.ts:64,88` asserts `bogus`, `access`, `SECRETISH` never printed).
4. No dev bypass reintroduced; the new injection payload `NODE_ENV=development` is apt.
5. Bearer never follows a redirect: `redirect: "manual"` at `repo.http.ts:42`, `aiSettings.ts:51`, `photoUrls.ts:70`; `authFetch.ts:13,41` attaches the token only to same-origin `/` paths (not `//`). A redirect becomes status 0 ("unexpected"/"internal"), never 401, so no sign-out. `mode.ts:16-22` redirect → local mode.
6. Nothing secret client-side: only `VITE_APP_VERSION` (`src/lib/version.ts:7`); `.env.example` names only; compose mirror holds non-secret values.
7. Owner scoping / RLS unchanged; `ownerSubOf` only feeds owner lanes (`app.js:44-54`); token checks in `identity.js` unchanged; no migration touched.
8. AC1 grep clean; `opaqueredirect` only in test fixtures.

### Findings
- 🟡 1. Rollback note names the wrong last version: `deploy/deployment-repo/apps/tudocuatui/compose.yml:13-14` says "<= v0.2.6", but v0.2.7/v0.2.8 also predate T-019.9 (BUG-001 found in v0.2.8 production). Same bound in `plan.md:169` (M-22 text), `ticket.md:56`, `impl-log.md:39`. Fix: "any image released before T-019.9 (currently ≤ v0.2.8)". Also: "exit 2" for an old image holds only after M-26 drops `CF_ACCESS_*`; before that an old image with the mode unset starts in Access mode and 401s every `/api` call — still fail-closed, site down either way; advice unchanged.
- 🟡 2. Stale "Access mode" comment at `src/features/auth/AuthRoot.tsx:12` — planned follow-up (A5), comment only.

### Notes
- A9 accepted risk: a redirect on `/healthz` → local mode with demo data; no token sent, no server data exposed. Host guard is a follow-up.
- Pre-existing: a non-production `NODE_ENV` override accepts an `http://localhost:<port>` issuer (`identity.js:33-40`); needs in-container access; no change proposed.
