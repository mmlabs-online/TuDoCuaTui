## Attempt 1 — 2026-11-19
Verdict: PASS

Reviewed commit a468e9d (`git diff origin/main...HEAD`: 10 code/doc files + impl-log).

### Checks (run by reviewer)
- `pnpm typecheck` — green (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm format:check` — "All matched files use the correct format." (336 files).
- `pnpm test` — 1883 passed, 222 skipped (Postgres-dependent suites, as before); matches impl-log.
- `pnpm build` — "built in 392ms".

### Acceptance criteria
Mutation check: each key line was reverted/altered in a scratch copy and `server/{me,identity,app}.test.ts` re-run (58 tests). Every mutation was caught.

- [x] AC1 Authenticated GET → 200 exactly `{id, email, role:"user"}`, `Cache-Control: no-store`, no DB — evidence: `server/app.test.ts › identity auth › GET /api/auth/me -> 200 {id, email, role:"user"} from the token, no-store, no pool call` (`toEqual`, recording pool `calls` = []); handler `server/api.js:129` uses `sendJson` (no-store at `server/http.js:41`). Mutations "extra key" (4 fail), "email from ctx dropped" (2 fail), "pool.query in handler" (1 fail) caught.
- [x] AC2 `sub = TUDO_OWNER_SUB` → `"owner"` — evidence: `server/app.test.ts › GET /api/auth/me as TUDO_OWNER_SUB -> role "owner"`; `server/me.test.ts` (owner / other / null owner). Mutations "role always user", "role always owner", "ownerSub not passed from app.js" caught.
- [x] AC3 absent / empty / non-string email → `null`, token still accepted — evidence: `server/identity.test.ts › ok result carries email; absent, empty or non-string email -> null` (undefined, "", 42); `server/app.test.ts › GET /api/auth/me without an email claim -> email null`. Parsing at `server/identity.js:140-142`, after every existing check; no check loosened or added. Mutations `payload.email ?? null` and "keep empty string" caught.
- [x] AC4 no / bad token → 401, no pool call — evidence: `["GET", "/api/auth/me"]` added to the existing 401 route list (`server/app.test.ts:398`), both no header and `Bearer x.y.z`.
- [x] AC5 JWKS unavailable → 503 `auth_unavailable`, `Retry-After: 30` — evidence: `server/app.test.ts › GET /api/auth/me while JWKS is unavailable …` (guard in `server/app.js` unchanged).
- [x] AC6 other methods → 405 `Allow: GET` — evidence: `server/app.test.ts › /api/auth/me other methods -> 405 Allow: GET` (POST/PUT/PATCH/DELETE/HEAD with valid token; no pool call). Mutation `allow: "GET, HEAD"` caught.
- [x] AC7 nothing about the token logged — evidence: `server/app.test.ts › GET /api/auth/me logs only the route line …` (route lines have exactly `id,method,ms,route,status,ts`; token, sub, email, jti absent from all logs incl. the 401 `auth_denied` line; console spies untouched). Mutations "log({ email })" and "console.info" caught. The handler and verifier add no log call.
- [x] AC8 exact path match → 404 — evidence: `server/app.test.ts › /api/auth/me path variants -> 404` (`/api/auth`, `/api/auth/me/`, `/api/auth/ME`, `/api/auth/me/x`). Mutation "case-insensitive `me`" caught. Match is `parts.length === 4 && a === "auth" && b === "me"` (`server/api.js:39`) on the raw, undecoded pathname.
- [x] AC9 all checks pass — see above.
- Handler ordering: `server/api.js:129` sits after the 405 check (`:108-110`) and origin check (`:111-115`), before the `isUuid` check (`:130-133`) and the `!pool` path. Mutation "handler removed/after uuid check" fails 4 tests (would 400 `idInvalid`).

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R1: server only; no `src/` change, no SPA fetch.
- R3: no secret, no `VITE_*` change; email/sub only echoed to the caller.
- R5: nothing stored; role/email computed per request; no DB access (asserted).
- R7: every changed file is in the plan's file list; no out-of-plan file; no SPA consumer, users table or admin role.
- R8: `meBody` and the verifier change have unit tests; route tests for each AC.
- High path `server/**`: named in the plan and approved by Ming (ticket notes, 2026-11-19).

### Blockers from review agents
None (orchestrator to copy any 🔴 from `security-review.md`).

### Nits (do not block)
- 💭 `server/api.js:39-40` — braceless `if` with the `return` on the next line; the neighbouring wrapped entries in `match()` use braces. Style only (oxfmt accepts it).
- 💭 `server/me.js:5` — `ownerSub` JSDoc is `UserId | string | null`; `UserId | null` would be tighter (createApp's `ownerSub` is already canonical).

### Ming verification after merge
- After deploy, signed in: `fetch("/api/auth/me", { headers: { Authorization: "Bearer " + <token> } })` → `role: "owner"` and Ming's Identity email (optional; no UI depends on it).

### Follow-ups (out of scope)
- SPA consumer for `/api/auth/me` (a `WardrobeRepo` method) when a UI needs it.
- `server/README.md` error-code paragraph does not list 401 `unauthorized` / 503 `auth_unavailable`.
