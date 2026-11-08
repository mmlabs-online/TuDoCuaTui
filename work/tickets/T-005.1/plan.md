Status: READY

# Plan — T-005.1: Connect Google Drive through a Supabase Edge Function

> **Gate: plan-approval (High tier: `supabase/functions/**`).** Ming: the changes against the ticket's scope are
> listed as **C1–C13** in "Changes vs ticket scope" below. The consult's six open questions use their defaults
> (**Q1–Q6** under Assumptions). **Q2 needs a look before M-7 step 1**, not before coding. To approve, write
> "Plan approved" under *Notes / answers from Ming* in `ticket.md`, and mention any C/Q you want changed.

## Feature summary
Not in `docs/feature-list.md`. The ticket (`## Feature reference`) records Ming's decision of 2026-11-08:
> store photos in Google Drive the way Ricotdin does, using approach **A** (a Supabase Edge Function holds the Drive
> credentials). Defaults accepted: Split into T-005.1 to T-005.4. A new OAuth client "TuDoCuaTui" in Ricotdin's
> Google Cloud project, published "In production". Ricotdin's Google account, folder `TuDoCuaTui/`. Secret names
> `TUDO_GOOGLE_CLIENT_ID`, `TUDO_GOOGLE_CLIENT_SECRET`, `TUDO_GOOGLE_REFRESH_TOKEN` and `TUDO_DRIVE_FOLDER_ID`, in
> Edge Function secrets of the shared stoktok project.

Goal (ticket):
> The Edge Function `tudo-drive` can use Ming's Google Drive folder `TuDoCuaTui/`, only for a logged-in TuDo user.
> Its credentials never leave Edge Function secrets.

Relevant decision, `work/decisions.md` D17:
> TuDoCuaTui runs on the existing stoktok Supabase project (shared Postgres and Auth). … Ming applies migrations only
> in Dashboard → SQL Editor … agents never run `db push`, `link`, `db reset --linked`, `db pull` or `db diff --linked`
> against it … Auth: … sign-ups stay disabled.

This ticket adds no migration and changes nothing under `src/` apart from one guard line in the test setup (C5).

## Changes vs ticket scope (for Ming's approval)
| # | Ticket says | Plan does | Why |
|---|---|---|---|
| C1 | M-7: "2. Create the folder" (by hand) | The **connect script creates `TuDoCuaTui/` through the API** and prints its id. M-7 drops the manual step and is reordered (see M-7 below). | With scope `drive.file` the app sees only files it created itself. A folder made in the Drive UI is invisible, so smoke would return 404 (consult Finding 1). |
| C2 | "Verifies the caller's Supabase JWT" | `verify_jwt = false` for this function (in `config.toml` and the `--no-verify-jwt` deploy flag, or the Dashboard toggle off). The function itself verifies the JWT with `getClaims` and then **requires `role === "authenticated"`, a `sub` and an `exp` in the future**. | A signature-only check accepts the public anon key (`role: anon`). T-005.3 `<img>` requests carry no Authorization header, so the gateway check cannot stay on (consult Findings 2–3, R-b option A). |
| C3 | "Add them to the workspace `secrets.refs.yaml` if needed" | **Not added.** | That file lists only `agent/*` Bitwarden items that agents load. Listing the Drive token there would invite agent access to it (consult Finding 7, workspace §3). |
| C4 | Four `TUDO_*` names | Adds one **optional, non-secret** env `TUDO_ALLOWED_ORIGINS` (comma list, CORS allow-list). It defaults to `http://localhost:8443` when unset. Never `*`. | The smoke runs from a browser tab, so CORS is needed. The prod URL is not known yet (F-007), and an env var avoids a code change when it is. |
| C5 | — | `tsconfig.json` includes `supabase/functions/**/*.ts` except `**/index.ts`. `vitest.config.ts` adds the function folder to coverage with 80% thresholds. `src/test/setup.ts` gets a one-line guard (`localStorage` may be undefined in the `node` test environment). | Without this, `pnpm typecheck` and coverage do not see the function code (consult Finding 4). No Deno toolchain is added. |
| C6 | — | `supabase/config.toml` gets `[functions.tudo-drive]` with `verify_jwt = false`. | It is used by local `functions serve` and by CLI deploy. |
| C7 | Scope: "Add D18" | D18 also **allows exactly one CLI command against stoktok**: `npx supabase functions deploy tudo-drive --project-ref <stoktok-ref> --no-verify-jwt`. Secrets are set in **Dashboard → Edge Functions → Secrets** (no `secrets set`). No `link` and no `db` commands; D17's list stays. Fallback: Dashboard function editor. | D17 does not cover function deploys. Deploy touches no migration history. Consult Q6 defaulted to also allowing `secrets set`; the plan narrows that to the Dashboard because Ming works there. |
| C8 | M-7 "6. Run smoke" | Smoke = `POST /functions/v1/tudo-drive/smoke`, run by Ming from a **browser-console snippet on his logged-in TuDo tab**. The snippet reads his own session token from localStorage. | Login is magic-link only, so there is no password to get a JWT with (consult Finding 9). Ming handles his own token; agents never do. |
| C9 | "The README explains …" | A new `supabase/functions/tudo-drive/README.md` holds setup, local serve, smoke, reconnect and leak response. The root `README.md` gets a short "Google Drive (photos)" section linking to it, plus a code-map row. | It keeps the root README short. |
| C10 | "A one-time connect script" | `scripts/connect-gdrive.mjs`: plain Node 22, no dependencies, **run by Ming in a normal terminal, never through Claude Code**. It outputs the refresh token **to the clipboard** and prints only a fingerprint (first 8 hex of SHA-256), with `--print` as fallback. It **writes no env file**. `--folder-id <id>` reuses the existing folder on reconnect. | Workspace §3: output in an agent session enters agent context. Re-running for a reconnect must not create a second folder. |
| C11 | — | Error contract: missing `TUDO_*` config → `503 {"error":"drive_not_configured"}`. Google `invalid_grant` or token 400/401 → `503 {"error":"drive_not_connected"}`, cached 30 s, with one fixed log line. Other upstream failures → `502 {"error":"drive_unavailable"}`. Logs and responses carry only fixed event names and status numbers. | Meets AC2 by construction, and the sentinel test proves it (consult R-c). |
| C12 | Branch scope (D16: ticket branches change only their own folder, and `ming-todo.md` on stops) | This branch edits `work/decisions.md` (D18) and `work/ming-todo.md` (M-7). | The ticket's scope lists both explicitly. `backlog.md` stays untouched. |
| C13 | — | `.env.example` gets the five names with empty values under a "server-only, never `VITE_`, set in Supabase Edge Function secrets" comment. | Ticket scope, plus a clear warning so no value is ever given a `VITE_` prefix. |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The function rejects a request without a valid Supabase JWT with 401, and a test proves it. | `handler.test.ts` › "401 without Authorization header", "401 for non-Bearer header", "401 when verify fails", "401 for role anon", "401 for role service_role", "401 without sub", "401 for expired exp", and "401 on every route, including unknown paths". Each one asserts that the fake `fetch` (Google/Drive) was **never called** and that the body is exactly `{"error":"unauthorized"}`. `auth.test.ts` covers `requireUser` directly. Also check `supabase/config.toml` has `[functions.tudo-drive] verify_jwt = false`. |
| 2 | No `TUDO_*` value or Google token appears in client code, a `VITE_*` variable, a log line or a response body (R3). | (a) `google-token.test.ts` › "sentinel: no secret or token in logs or errors" and `handler.test.ts` › "sentinel: smoke success and failure responses and logs contain no secret". The fake fetch returns `ya29.SENTINEL_ACCESS`, and config uses `SENTINEL_CLIENT_SECRET` / `1//SENTINEL_REFRESH`. The test asserts none of them appears in any `log` call argument (JSON-stringified) or any response body. (b) `rg -n "TUDO_" src/` → no match. `rg -n "VITE_[A-Z_]*TUDO\|TUDO[A-Z_]*VITE_" -g '!work/**' .` → no match. After `pnpm build`, `rg -n "TUDO_\|googleapis" dist/` → no match. (c) `rg -n "supabase/functions" src/` → no match (no import from the function into the app). (d) Read `index.ts`: no `console.*` other than via the injected `log`, and `log` prints only the event and numbers. |
| 3 | Token refresh and the Drive calls sit behind a small interface with unit tests (fake fetch). | `google-token.ts` exports `createTokenSource(...)` → `{ getAccessToken(), invalidate() }`. `drive.ts` exports `createDrive(...)` → `{ createFile, readFile, deleteFile }`. The tests listed below pass under `pnpm test`, and coverage thresholds of 80% hold for `auth.ts`, `google-token.ts`, `drive.ts` and `handler.ts` (`pnpm test:coverage`). |
| 4 | The README explains setup, smoke, and how to reconnect after a token is revoked or expires. M-7 lists every step Ming has to do. | Read `supabase/functions/tudo-drive/README.md`. It must have the sections: Setup (OAuth client type **Desktop app**, publish **In production**, connect script, Dashboard secrets, deploy, the "Enforce JWT verification" toggle off), Smoke (console snippet + expected `{"ok":true,…}`), Local serve, Reconnect (`--folder-id`), Suspected leak, and Limits (6-month idle expiry, 100 tokens per client, Testing = 7 days, clearing clipboard history). Check that `work/ming-todo.md` M-7 has steps 1–7 as below and that each command/README step has a matching M-7 step. Check that `.env.example` lists the 5 names with empty values. |
| 5 | Checks are green. Local mode is unaffected (R1). | `pnpm typecheck`, `pnpm format:check`, `pnpm test:coverage`, `pnpm build` all pass. `git diff main --stat -- src/` shows only `src/test/setup.ts` (one guard line). `pnpm dev` without env still shows the demo items (or reason that `src/` runtime code is unchanged). |
| 6 | (C10) The connect script's pure parts work and never print the token. | `scripts/connect-gdrive.test.mjs` passes (tests below). Read the script: the refresh token goes only to the clipboard child process, or to stdout with `--print`. The default path has no `console.log` of `refresh_token`/`access_token`. |
| 7 | (C1/C6) Secret and env files stay out of git. | `git check-ignore -v supabase/functions/.env supabase/functions/.env.local` → both ignored (root `.gitignore` `.env*`). `git check-ignore supabase/functions/tudo-drive/.env.example` is not needed (none is created). |

## Ming verification after merge
These are M-7 in `work/ming-todo.md` (exact text the implementer adds; dashboard and real Google only):

- [ ] **M-7 — Connect Google Drive for TuDo photos** (after T-005.1 is merged; D18; README: `supabase/functions/tudo-drive/README.md`)
  1. Google Cloud Console, **Ricotdin's project** (see Q2 first): APIs & Services → enable **Google Drive API** if it is not on. OAuth consent screen: scope `.../auth/drive.file` only, **Publish app → In production**. Credentials → Create OAuth client ID → type **Desktop app**, name `TuDoCuaTui`.
  2. In a **normal terminal (not Claude Code)**, from the repo root: `node scripts/connect-gdrive.mjs`. Paste the client id and secret when asked, then approve in the browser. The script creates the `TuDoCuaTui` folder, copies the refresh token to the clipboard, and prints the folder id and a fingerprint.
  3. Supabase Dashboard (stoktok) → Edge Functions → Secrets: add `TUDO_GOOGLE_CLIENT_ID`, `TUDO_GOOGLE_CLIENT_SECRET`, `TUDO_GOOGLE_REFRESH_TOKEN` (paste from the clipboard) and `TUDO_DRIVE_FOLDER_ID`. Optionally add `TUDO_ALLOWED_ORIGINS` (e.g. `http://localhost:8443,https://<prod-host>`). Then clear the clipboard and clipboard history (Win+V → Clear all).
  4. Deploy: `npx supabase login` (once), then `npx supabase functions deploy tudo-drive --project-ref <stoktok-ref> --no-verify-jwt`. **No other CLI command against stoktok.** Then in Dashboard → Edge Functions → `tudo-drive` → Details, confirm *Enforce JWT verification* is **OFF**.
  5. Negative check: with no header, `curl -i -X POST https://<ref>.supabase.co/functions/v1/tudo-drive/smoke` → `401`. Repeat with `-H "Authorization: Bearer <anon key>"` → `401`.
  6. Smoke: open TuDo on `http://localhost:8443` in Supabase mode, logged in. Paste the README console snippet → expect `200 {"ok":true,"steps":{"create":"ok","read":"ok","delete":"ok"}}`. The Drive folder must be empty afterwards.
  7. Write the connect date next to this item. The refresh token dies after 6 months unused.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/functions/tudo-drive/index.ts` | create (~30 lines) | The only Deno-specific file. It reads `Deno.env` once, builds config, token source, drive and `verify` (supabase-js `getClaims`), then `Deno.serve(req => handle(req, deps))`. Not typechecked or unit-tested (C5). |
| `supabase/functions/tudo-drive/deno.json` | create | Pins `"@supabase/supabase-js": "npm:@supabase/supabase-js@2.119.0"` for `index.ts`. |
| `supabase/functions/tudo-drive/config.ts` | create | `readConfig(get)` → `{ drive: DriveConfig \| null, allowedOrigins: string[] }`. Pure. |
| `supabase/functions/tudo-drive/auth.ts` | create | `requireUser(req, verify, now)` → `{ userId } \| null`. Checks Bearer, `role`, `sub`, `exp` (AC1). |
| `supabase/functions/tudo-drive/google-token.ts` | create | `createTokenSource({ clientId, clientSecret, refreshToken, fetch, now, log })`. Handles refresh, cache, single-flight and the failure cache (AC3, C11). |
| `supabase/functions/tudo-drive/drive.ts` | create | `createDrive({ tokens, fetch, folderId })` → `createFile`, `readFile`, `deleteFile`. 401 → invalidate + retry once. `DriveError` carries `step` and status only (AC3). |
| `supabase/functions/tudo-drive/handler.ts` | create | `handle(req, deps)`: CORS/preflight, auth, routing (`POST /tudo-drive/smoke`), smoke flow, error mapping (AC1, AC2). |
| `supabase/functions/tudo-drive/config.test.ts` | create | Tests. |
| `supabase/functions/tudo-drive/auth.test.ts` | create | Tests. |
| `supabase/functions/tudo-drive/google-token.test.ts` | create | Tests. |
| `supabase/functions/tudo-drive/drive.test.ts` | create | Tests. |
| `supabase/functions/tudo-drive/handler.test.ts` | create | Tests. |
| `supabase/functions/tudo-drive/README.md` | create | AC4 (C9). |
| `scripts/connect-gdrive.mjs` | create | Ming's one-time connect (C1, C10). It exports pure helpers and runs `main()` only when executed directly. |
| `scripts/connect-gdrive.test.mjs` | create | Tests for the pure helpers (R8). |
| `supabase/config.toml` | modify: append `[functions.tudo-drive]` with `verify_jwt = false` | C2, C6. |
| `tsconfig.json` | modify: `include` adds `"supabase/functions/**/*.ts"`, plus `"exclude": ["supabase/functions/**/index.ts", "node_modules", "dist"]` | C5. |
| `vitest.config.ts` | modify: coverage `include` adds `supabase/functions/tudo-drive/**`, `exclude` adds `**/index.ts`, plus thresholds for `auth.ts`, `google-token.ts`, `drive.ts`, `handler.ts` | C5, AC3. |
| `src/test/setup.ts` | modify (only if needed): `globalThis.localStorage?.clear()` | Node 22 has no `localStorage` in the `node` environment, so the global `afterEach` would throw (C5). Skip it if the function tests pass without it. |
| `.env.example` | modify: 5 names, empty values, comment | C13. |
| `README.md` | modify: "Google Drive (photos)" section (3–5 lines, link) + code-map row | C9. |
| `work/decisions.md` | modify: add D18 | Ticket scope, C7, C12. |
| `work/ming-todo.md` | modify: add M-7 under Setup | Ticket scope, C12. |

Not touched: `secrets.refs.yaml` (C3), `supabase/.gitignore` (root `.env*` already covers `supabase/functions/.env*`, AC7), any `src/` runtime file, migrations, `vite.config.ts` (R10), `.mise.toml` (no Deno).

## Tests to write
All function tests start with `// @vitest-environment node`, use only relative `.ts` imports, and use a fake `fetch` (`vi.fn` returning `new Response(...)`) plus an injected `now` and `log` spy.

| Test (file › name) | Covers |
|---|---|
| `config.test.ts` › "returns drive null when any of the 4 TUDO_* names is missing or blank" | C11 |
| `config.test.ts` › "parses TUDO_ALLOWED_ORIGINS (trim, drop empties); defaults to http://localhost:8443; ignores '*'" | C4 |
| `auth.test.ts` › "null without header / non-Bearer / empty token" | AC1 |
| `auth.test.ts` › "null when verify returns error or throws" | AC1 |
| `auth.test.ts` › "null for role anon, service_role, missing role" | AC1, Finding 2 |
| `auth.test.ts` › "null without sub, or exp <= now" | AC1 |
| `auth.test.ts` › "returns userId for role authenticated with sub and future exp" | AC1 |
| `google-token.test.ts` › "POSTs form-encoded refresh_token grant to oauth2.googleapis.com/token" | AC3 |
| `google-token.test.ts` › "caches the token until expires_in − 60 s, then refreshes" | AC3 |
| `google-token.test.ts` › "single-flight: concurrent getAccessToken calls → one fetch" | AC3 |
| `google-token.test.ts` › "invalidate() forces a refresh" | AC3 |
| `google-token.test.ts` › "invalid_grant / 400 / 401 → TokenError not_connected, cached 30 s (no fetch within 30 s, fetch again after)" | C11 |
| `google-token.test.ts` › "5xx, network error, malformed JSON → TokenError unavailable, not cached" | C11 |
| `google-token.test.ts` › "sentinel: no secret or token in logs or errors" | AC2 |
| `drive.test.ts` › "createFile sends multipart/related to upload endpoint with parents=[folderId], fields=id, Bearer header" | AC3 |
| `drive.test.ts` › "readFile GETs files/{id}?alt=media; deleteFile DELETEs files/{id} (204)" | AC3 |
| `drive.test.ts` › "rejects file ids outside [A-Za-z0-9_-]" (no fetch) | AC3 |
| `drive.test.ts` › "on Drive 401: invalidates token and retries once; second 401 → DriveError" | AC3 |
| `drive.test.ts` › "non-2xx → DriveError with step and status only (no upstream body)" | AC2 |
| `handler.test.ts` › the 401 cases listed in AC1 (incl. "unknown path still 401 when unauthenticated") | AC1 |
| `handler.test.ts` › "OPTIONS preflight: 204 with CORS headers for allowed origin; no ACAO header for other origins; no auth needed" | C4 |
| `handler.test.ts` › "authenticated: GET /smoke → 405, unknown path → 404" | routing |
| `handler.test.ts` › "drive not configured → 503 drive_not_configured" | C11 |
| `handler.test.ts` › "smoke happy path: create → read (content equal) → delete; 200 {ok:true,steps:{create,read,delete:'ok'}}" | scope (smoke) |
| `handler.test.ts` › "smoke: read mismatch or read failure still deletes (finally) and returns ok:false with failed step" | scope (smoke) |
| `handler.test.ts` › "token not_connected → 503 drive_not_connected; Drive 5xx → 502 drive_unavailable" | C11 |
| `handler.test.ts` › "sentinel: smoke success and failure responses and logs contain no secret" | AC2 |
| `scripts/connect-gdrive.test.mjs` › "pkce: verifier 43–128 chars of unreserved set; challenge = base64url(sha256(verifier))" | C10 |
| `scripts/connect-gdrive.test.mjs` › "buildAuthUrl includes client_id, loopback redirect_uri, scope drive.file, S256, state, access_type=offline, prompt=consent" | C10 |
| `scripts/connect-gdrive.test.mjs` › "parseCallback rejects wrong state, error param, missing code" | C10 |
| `scripts/connect-gdrive.test.mjs` › "fingerprint returns first 8 hex of sha256, never the input" | C10 |
| `scripts/connect-gdrive.test.mjs` › "parseArgs: --print, --folder-id <id> (validated), unknown flag → error" | C10 |

## Approach
1. **Config and tooling (C5, C6).** Update `tsconfig.json`, `vitest.config.ts` and `supabase/config.toml`. Add a first trivial test and confirm that Vitest picks up `supabase/functions/**` and that typecheck sees it. Add the `setup.ts` guard only if the `node` env throws.
2. **`config.ts`, `auth.ts`.** `verify` has the type `(jwt) => Promise<{ claims: Record<string, unknown> } | { error: unknown }>`. `requireUser` never logs the token.
3. **`google-token.ts`.** Module-level state lives inside the closure returned by `createTokenSource`. `index.ts` creates it once per isolate, so the cache is per isolate and in memory only. Log events: `token_refresh_ok`, `token_refresh_failed {status}`, `drive_not_connected` (the fixed line "re-run scripts/connect-gdrive.mjs, see supabase/functions/tudo-drive/README.md"). Errors are `TokenError(kind)` with a fixed message.
4. **`drive.ts`.** The multipart body is built as a string with a random boundary (no `FormData`/`Blob`, so it behaves the same in Node and Deno). Deletes are permanent `DELETE` (no trash). Retry once on 401. Note for T-005.2: stream bodies cannot be retried.
5. **`handler.ts`.** The order is: OPTIONS → CORS preflight (no auth). Otherwise `requireUser` → 401 `{"error":"unauthorized"}`. Then config → 503. Then route by the pathname after `/tudo-drive` (`/smoke`, POST only). Smoke file name: `tudo-smoke-<crypto.randomUUID()>.txt`, content `"tudo-smoke " + ISO time`. Every response is JSON with CORS headers for an allowed origin only, and none echoes upstream bodies or `err.message`. A top-level try/catch maps unknown errors → 500 `{"error":"internal"}` with log `unhandled` (no error object).
6. **`index.ts` + `deno.json`.** `verify = (jwt) => supabase.auth.getClaims(jwt)` with `createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"))` (both injected by the platform). `log = (event, fields) => console.log(JSON.stringify({ fn: "tudo-drive", event, ...fields }))`. Only numbers and strings from a fixed set go in `fields`.
7. **`scripts/connect-gdrive.mjs`.**
   - Read the client id, then the client secret with muted input (readline).
   - Start a loopback server on `127.0.0.1:0`, open the browser (`start`/`open`/`xdg-open`, and also print the URL; it is not secret), and wait for `/callback`, checking `state`.
   - Exchange the code with PKCE and refresh once to verify.
   - Create the folder `TuDoCuaTui` (`mimeType application/vnd.google-apps.folder`), or with `--folder-id` GET it to verify access.
   - Copy the refresh token via `clip.exe`/`pbcopy`/`wl-copy`/`xclip` stdin. If none is available, tell Ming to re-run with `--print`.
   - Print the folder id, the fingerprint, the four secret names and the Dashboard path.
   - Timeout after 5 minutes. Do not write any file.
8. **Docs.** Write the function README, the root README section, `.env.example`, D18 and M-7 (text above).
   - D18 row: "2026-11-08 · Photos in Google Drive via Edge Function `tudo-drive` · approach A (one function, `verify_jwt=false`, in-function check `role=authenticated`+`sub`+`exp`); scope `drive.file`; OAuth client 'TuDoCuaTui' (Desktop app, In production) in Ricotdin's Cloud project, Ricotdin's Google account, folder created by `scripts/connect-gdrive.mjs`; secrets `TUDO_GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `TUDO_DRIVE_FOLDER_ID` (+ optional non-secret `TUDO_ALLOWED_ORIGINS`) are set only in Dashboard → Edge Functions → Secrets, never in `secrets.refs.yaml`, never `VITE_*`; Edge secrets are project-wide, so every stoktok function can read them; any stoktok Auth user can call the function (sign-ups off); the only CLI command allowed against stoktok is `supabase functions deploy tudo-drive --project-ref <ref> --no-verify-jwt`; D17's forbidden list stands · Ming 2026-11-08 + T-005.1 plan approval · T-005.1–T-005.4".
9. Run the checks.

Rules:
- **R1**: no runtime change in `src/`, and no import from `supabase/functions` into `src`.
- **R2**: no migration.
- **R3**: secrets live only in Edge secrets. The anon key in `index.ts` comes from the platform env, not the client.
- **R4**: it is being replaced, but untouched here; T-005.4 removes Storage.
- **R6**: no UI copy.
- **R7**: follow-ups are listed below.
- **R8**: tests for every pure module, plus coverage thresholds.
- **R9**: n/a (no UI).
- **R10**: `vite.config.ts` and `AGENTS.md` are untouched.

Workspace §3: no agent runs the connect script, `functions serve` with real values, or the deploy.

## Specialist input used
From `consult-software-architect.md`:
- **Adopted:** Findings 1–9.
  - R-a: layout and seam. `config.ts` was added as a split-out of env parsing.
  - R-b: option A.
  - R-c: cache, single-flight, retry, 30 s failure cache, sentinel test.
  - R-d: smoke + console snippet.
  - R-e: script, clipboard + fingerprint, `--print`.
  - R-f: local serve with `supabase/functions/.env.local`, documented as Ming-only because it hits real Drive.
  - R-g: prefixes, D18 content, CORS allow-list.
  - R-h: M-7 order.
- **Changed:**
  - R-e/Q6: `secrets set --env-file` is replaced by the Dashboard Secrets page, so there is no env-file option at all. Reason: Ming works in the Dashboard, and it means one fewer place for the token to land on disk.
  - R-e reconnect: `--folder-id` was added so the script does not create a second folder.
- **Not used here:** the notes on later tickets (T-005.2 proxy upload, T-005.3 HMAC/streaming). They are recorded as follow-ups below.

## Assumptions
Consult open questions, defaults adopted:
- **Q1**: one function, `verify_jwt = false`, checked inside the function (C2). Option B (a separate `tudo-photo` function in T-005.3) stays possible later.
- **Q2 — ⚠ please read before M-7 step 1.** As far as the planner knows, and **without a primary-source check** (no web access in this run), `drive.file` grants are tied to the Google Cloud **project**, not to the individual OAuth client. A TuDo token would then reach files that Ricotdin's app created (meeting audio), and the other way round. **Default kept: Ricotdin's Cloud project, as Ming decided.** T-005.2 adds a defence: check `parents` before any delete. The alternative is a separate Cloud project "TuDoCuaTui" in M-7 step 1. It costs about 5 extra minutes and changes no code or plan; only the M-7 text changes. The orchestrator should open a `decision` issue for this (reversible until M-7 is run).
- **Q3**: clipboard + fingerprint, `--print` fallback, no env file (C10).
- **Q4**: the T-005.3 HMAC secret is not added now. T-005.3 adds its own Ming item.
- **Q5**: no `TUDO_ALLOWED_USER_IDS`. Any stoktok Auth user can call the function, as D17 accepted. Smoke only creates and deletes its own temp file.
- **Q6**: narrowed. The only CLI command is `functions deploy` (C7). Secrets go through the Dashboard.

Others:
- The platform injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into Edge Functions on stoktok. If stoktok has moved to publishable keys only, `index.ts` falls back to `SUPABASE_PUBLISHABLE_KEY` if present. `getClaims` handles both HS256 and asymmetric keys. The Ming check in M-7 step 5 confirms it.
- supabase-js 2.119 has `auth.getClaims`. The implementer confirms this in `node_modules/@supabase/auth-js` types.
- An OAuth app in production with only `drive.file` (a non-sensitive scope) needs no Google verification review.
- Vitest's default `include` already matches `**/*.test.{ts,mjs}`, so no `include` change is needed.
- **Hotspots:**
  - `README.md` and `work/ming-todo.md` are also edited by **F-007** (IN_PROGRESS/BLOCKED: Deploy section, M-4).
  - `vitest.config.ts` may be edited by **F-005.2** (IN_PROGRESS, coverage).
  - `tsconfig.json` may be edited by **F-002** (IN_PROGRESS, DB types).
  - Expect a rebase. The edits are additive (new sections/rows/array entries).
  - `src/App.tsx` is not touched.
- Size: about 550 lines of non-test code + docs and about 450 lines of tests, which is above the ~400-line guide (see Split proposal).

Follow-ups (not in this diff, for the orchestrator to file as `debt` / ticket edits):
1. T-005.2 `Needs Ming` should list M-7.
2. A periodic smoke or monitor so refresh-token death is noticed. Today nothing alerts.
3. T-005.2: upload streams cannot be retried on 401, so refresh the token proactively before streaming. Check `parents` before deletes (Q2).
4. T-005.3: HMAC secret Ming item, invocation/egress quota on stoktok's free tier.

## Blocking questions
None. Q2 is a pre-M-7 decision, not a planning blocker.

## Split proposal
The estimate is above the ~400-line guide. Possible split:
- **S1**: function + tests + tooling (C2, C4–C6, C11).
- **S2**: connect script + READMEs + `.env.example` + D18 + M-7 (C1, C3, C7–C10, C12, C13).

**Default: no split.** Reasons:
- Neither half can be verified by Ming on its own: smoke needs both.
- Both halves need the same security review and the same plan-approval gate. A split would cost Ming a second approval and a second PR review for no gain.
- About 45% of the lines are tests, and the modules are small and independent.

If Ming prefers the split, this plan covers S1 first unchanged, and S2 becomes T-005.1.2 with the same text.
