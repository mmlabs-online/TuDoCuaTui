# Security review — T-005.3

## Attempt 1 (2026-11-12) — security-ai-generated-code-auditor

No 🔴. Two 🟡, rest 🟢. Read-only; nothing run; no .env read.

### 🟡 Should fix
1. **Drive `Content-Length` passed through unchecked** — `server/photos.js:307` uses `media.contentLength` from `drive.js:370-374`. Node fetch requests gzip/br and decompresses, but `content-length` is the compressed length; if Google ever compresses `alt=media`, the sent length won't match the streamed bytes → truncated image or hung connection (fake Drive won't catch it). Not a leak (numeric, `/^\d+$/`). Fix: `accept-encoding: identity` on the `getMedia` request, or return `contentLength: null` when `content-encoding` is set and not `identity`.
2. **Router errors bypass `app.js`'s catch (older code; follow-up)** — `server/app.js:69` `return handleApi(...)` without `await`, so a rejection skips the catch at `:85-93` and becomes an unhandled rejection, fatal per `server/index.js:22`; same shape at `api.js:64` (`return servePhoto(...)`). `servePhoto` itself covers every throw path. Follow-up: `return await handleApi(...)` (R7).

### 🟢 Notes
- Auth: route inside the `/api/` branch on the raw pathname (`app.js:60-68`); `access.verify` before DB/Drive (`app.test.ts:166-186`); exact 4 segments (`api.js:18`); `isUuid` → 400; never decoded; GET only (HEAD → 405). No IDOR concern for single user behind Access.
- Headers are constants (`photos.js:242-248`): `image/jpeg`, `private, max-age=31536000, immutable`, CSP `default-src 'none'; sandbox`, `inline`, CORP `same-origin`; `nosniff`/XFO/Referrer-Policy from `app.js:28`; no Drive header passed. `private` + extensionless path → not cached at Cloudflare. Browser cache up to a year after Access ends (fine on personal devices).
- No Drive id/Google text in responses or logs.
- 304/ETag after the DB lookup (`photos.js:273-281`): deleted → 404, never 304; ETag is the validated uuid.
- Streaming: per-request controller (30 s + abort on `res` close, `photos.js:283-288`); `pipeline` shares the signal; errors caught; timer cleared; no buffering; `drive.js:141-156` `handedOver` removes listeners on failed attempts (T-005.1 note met).
- Gap: `res.once("close")` registered after the DB query (`photos.js:285`) — optional early return on `res.destroyed` before `getMedia`.
- Gap: Drive retry sleeps / token refresh don't take the abort signal (bounded; acceptable).
- Redirects on `getMedia` followed; Node 22 strips Authorization cross-origin (unchanged).
- DoS: no read concurrency cap (A8) acceptable (Access JWT first, CORP blocks cross-site reads, 2 MiB files, deadline); add a cap if Drive 429s.
- Client: `apiPhotoUrl` (`src/data/mappers.ts:90-91`) only same-origin `/photos/<uuid>`, `""` otherwise; only used as `<img src>` (`ItemPhoto.tsx`, `ItemCard.tsx:29-33`, `Hero.tsx:34`, `Editor.tsx:97-103`); no XSS sinks; duplicate clears photo fields (`App.tsx:187-191`); local/Supabase repos untouched (R1).
- README `:67` has the getMedia deadline rule and EXIF/GPS note.

Risks: Google `alt=media` behaviour (compression, redirects, Content-Length) only verifiable in the M-15 smoke — check Network tab sizes. Expired Access session: uncached images fall back to the placeholder.
Open: one-year `immutable` browser cache OK on shared devices?

## Attempt 2 (2026-11-12) — security-ai-generated-code-auditor (commit 1650386)

Both attempt-1 🟡 fixed. No 🔴, no new 🟡. Read-only.

1. 🟢 Content-Length: `server/drive.js:363` sends `accept-encoding: identity` (undici keeps a caller-set Accept-Encoding and across redirects). Remaining path: if Google ignores it and gzips, `drive.js:371-375` still forwards the compressed length (`photos.js:307`) — unlikely, not a leak. Optional one-line hardening at `drive.js:375`: `contentLength: null` when `content-encoding` is set and not `identity` (+ test). Test `drive.test.ts:345-349` checks the outgoing header only.
2. 🟢 Router rejections: `app.js:69` `return await handleApi(...)` in the try → catch `:85-93` → 500; `api.js:64` `return await servePhoto(...)`. `api.js:73` `return handlePhoto(...)` without await is safe (rejection propagates to the awaited `handleApi`); adding await is cosmetic. No other unawaited dispatch.
3. 🟢 **The new regression test passes without the fix** — `server/api.test.ts:49-59`: the throwing `pool.query` is caught inside `servePhoto` (`photos.js:264-272`, `errors.js:31`) so 500 comes from its own handling. Make it real: pool resolves `{ rows: [{ drive_file_id: "abcdefghij" }], rowCount: 1 }`, `getMedia` returns `{}` → `res.writeHead` at `photos.js:304-308` throws (invalid Content-Length) outside any try → with the fix 500 + `/healthz` still answers; without it an unhandled rejection fails the run (R8).

Risks: Google `alt=media` behaviour only verifiable in the M-15 smoke (compare sizes). Open: one-year `immutable` browser cache on shared devices.

## Attempt 3 (2026-11-12) — security-ai-generated-code-auditor (f2f7a7a..93f73f8)

No 🔴, no 🟡 (the scope 🟡 was a tooling gap — the orchestrator ran `git diff f2f7a7a 93f73f8 --stat`: only `server/api.test.ts` and `work/tickets/T-005.3/impl-log.md`).
- 🟢 The test now exercises the unawaited-rejection path: pool returns a row (`api.test.ts:49-58`), `getMedia` → `null`, `media.contentLength` throws at `photos.js:307` outside any try in `servePhoto`, so the 500 can only come from the catch at `app.js:85-93` reached via `return await` at `app.js:69`; asserts 500 then `/healthz` 200 with a 2 s timeout. 30 s photo timer cleared on `res` close.
- 🟢 Fixtures are obviously fake (uuid, fixed date, `"abcdefghij"`, loopback); no env reads.
