# Consult: software-architect, T-005.1 (`tudo-drive` Edge Function + Drive connect)

## Findings

1. **M-7 step 2 ("Create the folder") will not work if Ming makes the folder by hand.** With scope `drive.file`, the app can only see files and folders that it created itself (or that the user opened through it). A folder made in the Drive UI is invisible to the function, so smoke fails with 404. Ricotdin avoids this because `connect_gdrive --folder NAME` creates the folder through the API. The TuDo connect script has to do the same: create `TuDoCuaTui/` and print its id. The folder id is not a secret.
2. **"Valid Supabase JWT" is not the same as "logged-in user".** The legacy anon key is itself a valid project JWT (`role: anon`), and so is the service-role key. A check that only verifies the signature, or relies on `verify_jwt = true` alone, lets anyone holding the public anon key call the function. You need explicit checks: `role === "authenticated"`, a `sub` claim, and `exp` in the future.
3. **T-005.3 cannot sit behind the gateway's JWT check.** An `<img>` request sends no Authorization header (the ticket says so itself). So either `tudo-drive` runs with `verify_jwt = false` from the start, or image serving moves to a second function later. Newer Supabase projects with asymmetric signing keys or `sb_publishable_` keys also push toward `verify_jwt = false` plus a check in the function.
4. **Toolchain.** Vitest 5 on Node 22 runs any `**/*.test.ts` by default (no `include` is set in `vitest.config.ts`). The default environment is jsdom. `tsconfig.json` only covers `src` and the two configs, so `pnpm typecheck` does not see `supabase/functions/**` today. Coverage only covers `src/data/**`. Deno is not in `.mise.toml`, and adding it would be a stack change.
5. **Secrets are shared across the whole stoktok project.** Edge Function secrets are project-wide: every stoktok function can read `TUDO_GOOGLE_REFRESH_TOKEN` through `Deno.env`. Function names are also project-global (`tudo-drive` is fine). Auth is shared and sign-ups are off, so "TuDo user" means "any stoktok Auth user" (D17 accepted that blast radius).
6. **Probable cross-app reach (please verify).** As I understand it, `drive.file` access is granted per Google Cloud project, not per OAuth client. A TuDo client inside Ricotdin's Cloud project could then reach Ricotdin's own app-created files (meeting audio), and the other way round. A leaked TuDo token would then expose Ricotdin data. Storage quota is also shared, because it is the same Google account.
7. **`secrets.refs.yaml` is the wrong place for these names.** It is only for `agent/*` Bitwarden items that agents load through `with-secrets.sh`. Listing the `TUDO_*` names there would invite agent access to a Drive token. The ticket's "if needed" should resolve to **not needed**.
8. **`supabase/.gitignore` only ignores `.env.local` and `.env.*.local`.** It does not ignore `supabase/functions/.env`, which is the file `supabase functions serve` reads by default.
9. Login is magic link only (`AuthGate.tsx`, `signInWithOtp`), so there is no password. Smoke needs some other way to get Ming's user JWT.
10. Ricotdin's upload goes straight from the browser to Google: the API creates a resumable session URL and the browser PUTs the file to it. That pattern matters for T-005.2.

## Recommendations

**R-a. Function layout and testable seam** (AC3, AC1, R8). Keep everything Deno-specific in one thin file:
```
supabase/functions/tudo-drive/
  index.ts        Deno.serve, reads Deno.env, builds deps, calls handle(). ~20 lines, the only Deno-specific file
  deno.json       imports pinned, e.g. "@supabase/supabase-js": "npm:@supabase/supabase-js@2.119.0"
  handler.ts      handle(req, deps): Promise<Response>. Path routing (/smoke now, /photo/:id later), CORS, error mapping
  auth.ts         requireUser(req, verify): pulls the Bearer token, calls the injected verify, checks role/sub/exp
  google-token.ts createTokenSource({clientId, clientSecret, refreshToken, fetch, now, log})
  drive.ts        createDrive({tokens, fetch, folderId}): createFile, readFile, deleteFile (permanent DELETE, no trash)
  *.test.ts       Vitest, first line `// @vitest-environment node`
```
- Every module except `index.ts` uses only web-standard APIs (`fetch`, `Response`, `crypto.subtle`, `TextEncoder`) and relative imports with a `.ts` extension. Deno and Vite both resolve those, and `allowImportingTsExtensions` is already on.
- No `@/` alias imports, and no imports from `src/`.
- No Deno tests are needed. In the plan:
  - Extend `tsconfig.json` `include` with `supabase/functions/**/*.ts`, excluding `**/index.ts`.
  - Add the function directory to coverage `include`.
  - Leave `index.ts` to a manual `supabase functions serve` check.

**R-b. JWT verification** (AC1). Check the JWT inside the function on every route, and set `[functions.tudo-drive] verify_jwt = false` in `config.toml`. Ming also deploys with the explicit `--no-verify-jwt` flag.
- Build `verify` from `createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getClaims(token)`. It checks locally against JWKS when the project uses asymmetric keys, and falls back to an Auth call for HS256.
- Then enforce `role === "authenticated"` and `sub`.
- Unit tests, each returning 401 and asserting the fake fetch was never called:
  - no header
  - a non-Bearer header
  - verify returns an error
  - `role: anon`
  - `role: service_role`
  - no `sub`
- Option B, for Ming to choose: keep `verify_jwt = true` here and serve images from a separate function `tudo-photo` (`verify_jwt = false`) in T-005.3, sharing code through `supabase/functions/_shared/`. You gain a second check at the gateway. You pay with two deploys and the risk that gateway checks fail on new-style keys. **Default: A** (one function, check in the function only).
- Accepted limit: `getClaims` does not see a logout. A token stays valid until it expires (1 h).

**R-c. Google token refresh and caching** (AC2, AC3).
- Call `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`.
- Cache the access token in module scope (per isolate). Treat it as expired 60 s early, and let one in-flight promise serve concurrent callers. Never store it anywhere.
- When Drive answers 401: invalidate the cache and retry once.
- When the token endpoint answers `invalid_grant` or 400/401: return 503 `{error:"drive_not_connected"}`. Write one fixed log line ("re-run connect script, see README"), and cache that failure for 30 s, as Ricotdin does.
- Logs carry fixed event names and status codes only: never upstream bodies, request headers or `err` objects. Responses never echo upstream bodies.
- Tests:
  - expiry and skew
  - single-flight
  - retry on 401
  - `invalid_grant` → 503
  - **sentinel test:** the fake fetch returns `ya29.SENTINEL` / `1//SENTINEL`, and the test asserts neither string appears in any `log` call or response body. This proves AC2.
- Missing `TUDO_*` env → 503 `drive_not_configured`, so a local stack without secrets still behaves.

**R-d. Smoke action.** `POST /tudo-drive/smoke`:
1. Multipart-create a tiny text file with `parents=[TUDO_DRIVE_FOLDER_ID]`.
2. Read it back with `alt=media` and compare.
3. Delete it permanently in a `finally`.
4. Return `{ok, steps:{create,read,delete}}`.

For Ming to get a JWT without a password, the README gives a browser-console snippet to run on the logged-in TuDo tab. It reads the `sb-<ref>-auth-token` localStorage entry and `fetch`es the smoke URL. That is Ming handling his own token, never an agent.

**R-e. Connect script** (scope; workspace §3).
- `scripts/connect-gdrive.mjs`: plain Node 22 with no dependencies, run by Ming **in a normal terminal, not through Claude Code (`!` or Bash)**, because output there enters agent context. The README must say this.
- Flow:
  - Prompt for client id, and for the client secret with hidden input.
  - Start a loopback server on `127.0.0.1:<random port>`. Use PKCE S256 and `state`, with `access_type=offline&prompt=consent` so a refresh token is always returned.
  - **Create the `TuDoCuaTui` folder through the API** (Finding 1).
  - Check the new token by refreshing it once and listing the folder.
- Output:
  - **Default:** put the refresh token on the clipboard (`clip.exe` / `pbcopy` / `wl-copy`) and print only a fingerprint (first 8 hex of its SHA-256), plus the folder id and the four secret names with dashboard instructions.
  - **Fallback:** `--print`.
  - No env file is written by default. If you add `--env-file`, it must write a path the gitignore covers (Finding 8), and the README says to delete it after `supabase secrets set --env-file … --project-ref <stoktok>`. That command touches no migrations, so it is compatible with D17, but D18 should name it explicitly as allowed.
- Reconnect: re-run the script and replace the secret. For a suspected leak, copy Ricotdin's procedure: revoke at myaccount.google.com, rotate the client secret, re-run, smoke.
- Ming's own Bitwarden copy is optional; never in `agent/`.

**R-f. Local development** (AC5, R1).
- The README covers `supabase start`, then `supabase functions serve tudo-drive --env-file supabase/functions/.env.local`. Gitignore that path explicitly.
- Note that local serve talks to **real** Drive, so only Ming runs it, with his own values.
- T-005.1 changes nothing in `src/`, so local mode is unaffected by construction. The plan should still state "no import from `supabase/functions` into `src`", and the reviewer checks `pnpm build` output.

**R-g. Shared stoktok project** (D17, D18).
- Keep the `tudo-` prefix for functions and `TUDO_` for secrets.
- D18 should record:
  - the project-wide secret exposure (Finding 5)
  - who can call the function (any stoktok Auth user)
  - that Ming deploys with `supabase functions deploy tudo-drive --project-ref <stoktok-ref> --no-verify-jwt`: no `link`, no `db` commands
  - that `.env.example` gets the names under a "server-only, never VITE_" comment
- The CORS allow-list is fixed origins, never `*`. This can live in a non-secret `TUDO_ALLOWED_ORIGINS` or a constant. It is cheap to add now; it is needed by T-005.2.

**R-h. M-7 order:**
1. OAuth client (Desktop app type) + "In production".
2. Run the connect script (it creates the folder).
3. Set the secrets.
4. Deploy with `--no-verify-jwt`.
5. Smoke via the console snippet.
6. Note the date.

**Later tickets (outside T-005.1 scope, notes only):**
- **T-005.2 upload.** Photos are ≤ ~0.5 MB after resizing, so passing them through the function is fine. Cap the body (for example 2 MB → 413), start a resumable session on the server and stream `req.body` to it, so the function does not buffer the file. The alternative is Ricotdin's pattern (the browser PUTs to a session URL, then a confirm step). It adds an orphan-cleanup step and makes the session URL a bearer credential. **Default: proxy.**
  - The function should write `tudo_item_photos` with a client built from the **caller's JWT**, so RLS enforces ownership. Never use the service role.
  - Before any delete, check the file's `parents` includes the folder, as a defence against Finding 6.
- **T-005.3 serving.**
  - Stream with `new Response(driveRes.body, …)`.
  - `Cache-Control: private, max-age ≤ token TTL`, plus an ETag from `md5Checksum`.
  - Never hand out `thumbnailLink` or `webContentLink`.
  - It needs a **fifth secret** (HMAC key, e.g. `TUDO_MEDIA_SIGNING_KEY`), which is not among the four Ming accepted.
  - A 30-photo grid means 30 invocations per view, which counts against stoktok's free-tier invocation and egress limits.

## Risks
- `drive.file` is probably shared per Cloud project (Finding 6): TuDo and Ricotdin may be able to reach each other's files.
- A manually created folder breaks smoke (Finding 1).
- The anon key passes a signature-only check (Finding 2).
- `verify_jwt = false` makes the check in the function the only gate. One bug there exposes the function, and the 401 tests carry that weight.
- `index.ts` and the real `getClaims` wiring are not covered in CI.
- Refresh-token death: 6 months unused, client-secret rotation, the 100-tokens-per-client limit on repeated reconnects, or the app left in Testing (7 days). There is no monitor; consider a `debt` issue for a periodic smoke.
- The clipboard copy may stay in Windows clipboard history (Win+V); the README should mention clearing it.
- Edge Function limits (CPU time, invocation and egress quotas) mainly bite in T-005.3.

## Open questions (batched for Ming; each has a default)
1. **One function, or a separate image function later?** It decides whether the gateway's JWT check stays on for the API routes. Default: one function with `verify_jwt = false` (R-b, option A).
2. **Separate Google Cloud project for TuDo?** It would isolate TuDo's files from Ricotdin's (Finding 6). Default: keep Ricotdin's project as decided, but have the planner confirm the `drive.file` scoping in Google's docs. If it is project-wide, raise a decision issue.
3. **How should the refresh token leave the connect script?** Default: clipboard plus fingerprint; `--print` as fallback; no env file.
4. **Add the T-005.3 HMAC secret to M-7 now?** It saves Ming a second dashboard visit. Default: no (YAGNI); T-005.3 adds an M-8.
5. **Limit callers to TuDo users?** Any stoktok Auth user can currently call the function. Option: a non-secret `TUDO_ALLOWED_USER_IDS` env. Default: no, since D17 accepted this and T-005.2's RLS ownership limits the damage.
6. **Allow `supabase secrets set --project-ref` against stoktok?** D17 lists the forbidden CLI commands, and this one is not covered either way. Default: allowed for secrets and `functions deploy` only, recorded in D18.

Files referenced: `D:\mmlabs\spaceM\projects\.wt-tudocuatui\T-005.1\work\tickets\T-005.1\ticket.md`, `…\T-005.1\supabase\config.toml`, `…\T-005.1\supabase\.gitignore`, `…\T-005.1\vitest.config.ts`, `…\T-005.1\tsconfig.json`, `…\T-005.1\.github\risk-tiers.yml`, `…\T-005.1\work\decisions.md` (D17), `…\T-005.1\work\tickets\T-005.3\ticket.md`, `D:\mmlabs\spaceM\secrets.refs.yaml`, `D:\mmlabs\spaceM\projects\ricotdin\CLAUDE.md` (§0.4 Storage = Google Drive), `D:\mmlabs\spaceM\projects\ricotdin\app\web\src\lib\upload\upload.ts`.
