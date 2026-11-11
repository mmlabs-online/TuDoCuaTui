# Security review — T-005.1

## Attempt 1 (2026-11-11) — security-ai-generated-code-auditor

No 🔴. Two 🟡 (one-two lines each, `server/drive.js`), rest 🟢. No .env read.

### 🟡 Should fix
1. **fetch follows redirects; the token POST body (client_secret + refresh_token) could be re-sent to another host on a 307/308** — `server/drive.js:143` (`once`), token exchange `:168-178`. Defence in depth for A11. Fix: `redirect: "error"` (or `"manual"` → `drive_bad_response`) on the token call, and on meta/create/delete; leave `getMedia` on follow unless Drive `alt=media` never redirects (Authorization is stripped cross-origin). Test: a 307 from the token URL → `drive_bad_response`/`drive_unavailable`, no second request.
2. **`deleteFile` reports success for an invalid id without a request** — `server/drive.js:298-300` with `:376-378`: `fileUrl` throws `drive_not_found` for a bad id and `deleteFile` swallows it as "already gone", so a corrupted stored id would leave an orphaned private photo. Fix: distinct code for invalid ids (e.g. `drive_invalid_id`), or swallow `drive_not_found` only when `status === 404`. Also validate the id returned by `createFile` (`:337-341`) against `FILE_ID_RE`.

### 🟢 Notes
3. Streaming body has no deadline without a caller signal (`drive.js:144-153`, `getMedia :349-357`; `drive-smoke.js:26-28` passes none); the abort listener on the caller's signal is never removed. T-005.3 contract: every `getMedia` caller passes a per-request signal with a deadline (document in server/README.md).
4. Error/JSON bodies read in full with no byte cap (`drive.js:148`) — fine with fixed Google endpoints.
5. Retry-After capped at 10 s, ≤3 attempts, single 401 retry; `createFile` single-shot except the 401 retry (A8).
6. Token not exposed: errors carry only `code`/`status`; logs `{event, op, status, code, reason}` with allowlisted reasons; redaction tests `drive.test.ts:438-483`, CLI `index.cli.test.ts:94-114`.
7. Endpoints are constants (`:100-102`), overrides only via factory; ids/folder id regex + `encodeURIComponent`.
8. Multipart safe (random boundary, JSON-escaped name/appProperties, `MIME_RE`); bad MIME reported as `drive_bad_response` (`:311`) — cosmetic; T-005.2 should allowlist MIME types.
9. Config loader correct; partial/malformed → exit 2 (`index.js:39-46`, `drive-smoke.js:85-87`).
10. `check-image.sh` additions fail correctly (`:46`, `:58`, `:112-113`); a grep error would pass silently (paths guaranteed); history scan covers `VITE_` only (optional).
11. Fixtures are obviously fake; no `GOCSPX-`/`1//0`/`ya29.` in the repo.

Open: does Drive v3 `alt=media` ever redirect?
