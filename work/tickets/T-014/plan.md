Status: READY

# Plan — T-014: HTTP `WardrobeRepo` and no-login mode in the app

## Feature summary
T-014 is a `T-` ticket. It is not in `docs/feature-list.md`. Its scope comes from decisions D23 and D26 in `work/decisions.md`.

- **D23 (2026-11-10):** "TuDo moves its data from Supabase (D17) to the shared Postgres in `mmlabs-online/deployment` […], accessed only by a Node API in the same image as the SPA […]. **No in-app authentication for now** (single user); **Cloudflare Access** protects `tudocuatui.mmlabs.online` […]. Photos go to Google Drive via the backend (T-005 re-planned)."
- **D26 (2026-11-11):** "A1: keep the `VITE_SUPABASE_*` build args (Dockerfile, release.yml) until T-016. […] A3: T-014 may run in parallel but must not touch Dockerfile, .dockerignore, release.yml, check-image.sh or the CI `image` job."

Ticket scope, quoted:
- "`createHttpRepo` implementing `WardrobeRepo` (R1), chosen when the app is served by the API (build/runtime flag decided in the plan); local repo unchanged."
- "No AuthGate / sign-out in API mode; photo upload disabled with a clear "Sắp có" message until T-005."
- "Tests with a fake fetch."

The API contract is in `server/README.md` § "API (T-013.2)" and in T-013.2 plan A15–A27. Ming's note on the ticket summarises it:
- rows are snake_case and shaped like the view, so `rowToItem`/`itemToRow` are reused;
- `PUT` replaces the whole item, so every field is always sent (A16);
- the client generates the UUID;
- `wear` sends `{ delta, today: localToday() }`;
- validation errors are `{error:{code:'invalid_input', field, reason}}`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "All existing app tests pass in local mode" | `pnpm test` is green with **no edits to existing test files**, except the one additive `"api"` mode case listed under Tests. `App.test.tsx`, `useWardrobe.test.tsx`, `AuthGate.test.tsx` and `Editor.test.tsx` are unchanged and pass. All checks pass: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. Coverage thresholds for `src/data/**` still pass, and the new files are covered by them automatically. |
| 2 | "new tests cover the HTTP repo" | `src/data/repo.http.test.ts` exists with the cases listed under Tests, using a fake `fetch`. It checks the URL, method, headers and exact JSON body of every call, and the mapping of every response and error. |
| 3 | API mode is chosen when the app is served by the Node server; otherwise Supabase or local mode as today | `src/data/mode.test.ts`: the probe/precedence table (Tests below). |
| 4 | "No login screen in API mode" | `src/Root.test.tsx`: `@/lib/supabase` is mocked with a signed-out fake client (as in `AuthGate.test.tsx`), and a fake `fetch` returns items. With `mode="api"`, the item cards render, there is no email/password field, there is no "Đăng xuất" button, and the fake auth `getSession` is never called. With `mode="supabase"`, the login form shows. This is a control case, so the test proves the gate is really bypassed. |
| 5 | Photo upload disabled with "Sắp có" in API mode | `Editor.test.tsx` new cases. With `photoUpload={false}`: `EDITOR_COPY.photo.comingSoon` is visible; there are no "Chụp ảnh"/"Chọn từ thư viện" buttons and no `input[type=file]`. Dropping a file does not call `update`. The default (prop omitted) keeps the current behaviour, which the existing tests prove. |
| 6 | Local mode (Figma Make preview, `pnpm dev`) unchanged | `mode.test.ts`: with `dev: true`, no fetch is made and the result is `local`, or `supabase` when env is set. Also, `App` with no `mode` prop still renders the 16 demo items (the existing `App.test.tsx`). |
| 7 | "390px and dark mode unchanged (R9)" | No CSS changes in the diff (`git diff --stat` shows no `src/index.css`). The "Sắp có" block reuses the existing `.upload-zone` classes, which already use theme vars. A visual check at 390px in light and dark mode on `pnpm dev` with `photoUpload` off is listed for Ming. |
| 8 | D26 A3 respected | `git diff --name-only main` lists no `Dockerfile`, `.dockerignore`, `.github/workflows/release.yml`, `scripts/check-image.sh`, CI `image` job, or `vite.config.ts` (R10). |

## Ming verification after merge
Once the first Node release (T-015, M-14) is live at `tudocuatui.mmlabs.online` behind Cloudflare Access:
1. Open the site on the phone. There should be no login screen and no "Đăng xuất" button. The list loads from the server: it is empty at first, not the 16 demo items.
2. Add an item, edit it, tap "Mặc hôm nay" and then −1, and delete it. Reload after each step and check the change persisted.
3. Open the editor. The photo area should show "Sắp có", and there should be no camera or library buttons.
4. Check at 390px in light and dark mode.
5. Optional: the Figma Make preview still shows the demo items with no login.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/repo.http.ts` | create | `createHttpRepo(fetchFn?)`: the `WardrobeRepo` over `/api` (scope bullet 1, R1). |
| `src/data/apiErrors.ts` | create | `ApiError` class, `API_ERROR_COPY` (Vietnamese messages, one place, R6) and `apiErrorMessage(code, reason?, requestId?)`. |
| `src/data/mode.ts` | create | `DataMode` type, `pickMode()` (precedence) and `detectMode()` (the runtime `/healthz` probe, A1–A3). |
| `src/Root.tsx` | create | `Root({ mode })`: wraps `App` in `AuthGate` **only** in `supabase` mode (scope bullet 2). Kept out of `main.tsx` so it can be tested. |
| `src/data/repo.ts` | modify | Widen `WardrobeRepo.mode` to `"local" \| "supabase" \| "api"`. No other change. |
| `src/data/useWardrobe.ts` | modify | Optional third parameter `mode?: DataMode`. The default stays as today (`supabase ? "supabase" : "local"`). `"api"` → `createHttpRepo()`. Update the doc comment. |
| `src/App.tsx` | modify | Accept optional `{ mode?: DataMode }` and pass it to `useWardrobe`. Pass `photoUpload={wardrobe.mode !== "api"}` to `Editor`. The sign-out and mock-AI conditions stay as they are (they are already `=== "supabase"` and `=== "local"`). |
| `src/main.tsx` | modify | Call `detectMode()`, then render `<Root mode={mode} />` in `StrictMode`. Use `.then`, not top-level await. `applySavedTheme()` still runs first. |
| `src/features/items/Editor.tsx` | modify | Optional prop `photoUpload = true`. When it is `false`, render the "Sắp có" block instead of the upload zone, the source buttons and the file inputs. |
| `src/features/items/copy.ts` | modify | Add `photo.comingSoon` and `photo.comingSoonHint` (R6). |
| `README.md` | modify | Add one bullet under "Run locally" for API mode and the precedence (lines 13–14 area). This is docs only. |
| `src/data/repo.http.test.ts` | create | HTTP repo tests (fake fetch). |
| `src/data/apiErrors.test.ts` | create | Error mapping tests. |
| `src/data/mode.test.ts` | create | Probe and precedence tests. |
| `src/Root.test.tsx` | create | No login in API mode, with a control case. |
| `src/features/items/Editor.test.tsx` | modify (additive) | New `photoUpload={false}` cases. Existing cases are untouched. |
| `src/data/useWardrobe.test.tsx` | modify (additive) | One `"api"` mode case. Existing cases are untouched. |

Not touched:
- `Dockerfile`, `.dockerignore`, `release.yml`, `scripts/check-image.sh` (D26 A3);
- `vite.config.ts`, `AGENTS.md`, `.figma/` (R10);
- `server/**`, `src/lib/supabase.ts`, `src/features/auth/**`, `src/data/mappers.ts`;
- `vitest.config.ts` (the `src/data/**` threshold already covers the new files);
- `src/index.css`.

Estimated size is about 280 lines of non-test code:
- `repo.http.ts` ~110
- `apiErrors.ts` ~60
- `mode.ts` ~45
- `Root.tsx` ~15
- `Editor.tsx` ~25
- the rest ~25

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `repo.http.test.ts › list GETs /api/items and maps rows with rowToItem (photo "", null last_worn → "")` | read path, wire format |
| `› locations GETs /api/locations and returns the array` | read path |
| `› GETs send Accept: application/json, cache: "no-store", redirect: "manual"` | request shape (A6) |
| `› save with a UUID id PUTs /api/items/<id> with Content-Type application/json` | A16, client id |
| `› save with a non-UUID id ("", "x1") generates a UUID (crypto.randomUUID spied) and PUTs to it` | client generates the UUID (importRunner sends `id: ""`) |
| `› save body is itemToRow(item, null) minus id/location_id, plus location_name (trimmed; "" → null), every field present` | A16 full replacement: the test asserts the exact key set |
| `› save returns rowToItem(response.item) — server location_name/created_at win` | response mapping |
| `› save ignores item.photo (data:, blob:, http) — nothing extra is sent; result photo is ""` | A8, photos disabled |
| `› remove DELETEs /api/items/<id> and resolves on 204 (no body parse)` | delete |
| `› wear +1 / -1 POSTs { delta, today: localToday() } (fake timers at a fixed UTC+7 date) and maps { wear_count, last_worn, already }` | wear contract, `null` → `""` |
| `› 400 invalid_input reason nameRequired → ApiError with EDITOR_COPY.errors.nameRequired; field/reason kept on the error` | validation errors reuse the `validate.ts` copy |
| `› 401 unauthorized and an opaqueredirect response → session-expired message` | Cloudflare Access expiry (A6) |
| `› 404 / 409 / 413 / 503 / 500 (with requestId) → their API_ERROR_COPY messages; 500 message contains the requestId` | error mapping |
| `› non-JSON error body (HTML 502) → "unexpected" message; fetch rejects (TypeError) → "network" message` | robustness |
| `› a 200 with a non-JSON body → "unexpected" ApiError (not a crash)` | Cloudflare login HTML |
| `› mode is "api"` | interface |
| `apiErrors.test.ts › every server code in server/README.md maps to a non-empty Vietnamese message; unknown code → generic` | R6 completeness |
| `› invalid_input with each validate.ts reason (nameRequired, nameTooLong, priceNegative, priceInvalid, dateInvalid) uses EDITOR_COPY.errors; other reasons → generic invalid-input message` | reuse of the reason codes |
| `› ApiError is an Error whose message is the Vietnamese text (so useWardrobe.message shows it)` | integration with the existing `message()` |
| `mode.test.ts › pickMode: api beats supabase beats local (truth table of apiAvailable × hasSupabase)` | precedence (A2) |
| `› detectMode with dev: true never calls fetch` | Figma Make / `pnpm dev` unchanged (A3) |
| `› probe true only for 200 + application/json + body {status:"ok"}` | detection (A1) |
| `› probe false for text/html 200 (Vite SPA fallback), 404, JSON without status ok, invalid JSON` | no false positives |
| `› probe retries once on network error/timeout, then falls back; success on the 2nd try → api` | transient failure (A4) |
| `› probe aborts after the timeout (fake timers) and resolves false` | no hang |
| `› probe GETs "/healthz" same-origin with cache: "no-store"` | request shape |
| `Root.test.tsx › api mode: items from fake fetch render; no login form; no "Đăng xuất"; auth.getSession not called` | AC "no login screen in API mode" |
| `› supabase mode (signed-out fake client): login form is shown` | control case |
| `› local mode: demo items render, no login form` | R1 |
| `Editor.test.tsx › photoUpload false: shows "Sắp có" copy, no camera/library buttons, no file inputs` | scope bullet 2 |
| `› photoUpload false: dropping a file on the photo area does not call update` | scope bullet 2 |
| `useWardrobe.test.tsx › api mode: loads through the HTTP repo and reports mode "api"` (fake fetch via `vi.stubGlobal`) | wiring |

Test notes:
- Use `vi.stubGlobal("fetch", …)` with `vi.unstubAllGlobals()` in `afterEach`, or inject `fetchFn`.
- Build fake `Response` objects with `new Response(JSON.stringify(body), { status, headers })`. jsdom/Node 22 provides `Response`.
- For the opaque redirect, use a plain object `{ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }` cast to `Response`.

## Approach
1. **`src/data/apiErrors.ts`**
   - Define `class ApiError extends Error { status; code; field?; reason?; requestId? }`. Its `message` is the Vietnamese text.
   - `API_ERROR_COPY` has these messages:

     | Key | Message |
     |---|---|
     | `network` | "Không kết nối được máy chủ, thử lại nhé" |
     | `unauthorized` | "Phiên truy cập đã hết hạn — tải lại trang để đăng nhập lại" |
     | `forbidden_origin` | "Không có quyền thao tác" |
     | `not_found` | "Món đồ không còn tồn tại, tải lại trang nhé" |
     | `conflict` | "Dữ liệu vừa thay đổi hoặc bị trùng, thử lại nhé" |
     | `payload_too_large` | "Dữ liệu quá lớn" |
     | `invalid_input` | "Dữ liệu không hợp lệ" |
     | `invalid_json` | same as `invalid_input` |
     | `unsupported_media_type` | same as `invalid_input` |
     | `db_unavailable` | "Máy chủ dữ liệu đang bận, thử lại sau" |
     | `internal` | `(id) => "Lỗi máy chủ (mã ${id})"` |
     | `unexpected` | "Máy chủ phản hồi không hợp lệ, tải lại trang nhé" |
     | `generic` | "Có lỗi xảy ra, thử lại nhé" |

   - `invalid_input` with a `reason` in `ItemErrorCode` uses `EDITOR_COPY.errors[reason]`. `nameTooLong` is called with `NAME_MAX`.
   - This is R6: one copy object for the data feature. The reasons reuse the existing editor copy instead of duplicating it.
2. **`src/data/repo.http.ts`: `createHttpRepo(fetchFn = (...a) => fetch(...a), base = "/api")`.**
   - Private `call(method, path, body?)`:
     - Send with `{ method, headers: { Accept: "application/json", ...(body && { "Content-Type": "application/json" }) }, body: body && JSON.stringify(body), cache: "no-store", credentials: "same-origin", redirect: "manual" }`.
     - If `fetchFn` throws → `ApiError(0, "network")`.
     - `res.type === "opaqueredirect"` → `ApiError(401, "unauthorized")` (A6).
     - 204 → `null`.
     - Otherwise parse JSON. If the parse fails → `ApiError(res.status, "unexpected")`.
     - `!res.ok` → `ApiError` from `body.error.{code, field, reason, requestId}`. A missing code → `unexpected`.
   - The wire type is `ApiItemRow = Parameters<typeof rowToItem>[0]`, defined in `src/` (A25 of T-013.2).
   - `list`: `GET /items` → `items.map((r) => rowToItem(r, ""))`.
   - `locations`: `GET /locations` → `locations`.
   - `save(item)`:
     - `id = isUuid(item.id) ? item.id : crypto.randomUUID()`.
     - `const { id: _i, location_id: _l, ...row } = itemToRow(item, null)`.
     - Body is `{ ...row, location_name: item.location.trim() || null }`.
     - `PUT /items/${id}` → `rowToItem(res.item, "")`.
   - `remove`: `DELETE /items/${item.id}`.
   - `wear`: `POST /items/${item.id}/wear` with `{ delta, today: localToday() }` → `{ wearCount: r.wear_count ?? 0, lastWorn: r.last_worn ?? "", already: !!r.already }`.
   - Ids go into the path as they are: they are UUIDs, and the server rejects anything else with `idInvalid` (T-013.2 A15).
3. **`src/data/repo.ts`:** widen the `mode` union.
4. **`src/data/mode.ts`**
   - `export type DataMode = "local" | "supabase" | "api"`.
   - `pickMode(apiAvailable, hasSupabase)` returns:
     - `api` if `apiAvailable`;
     - else `supabase` if `hasSupabase`;
     - else `local`.
   - `probeApi(fetchFn, timeoutMs = 2000)`:
     - `GET /healthz` with `cache: "no-store"` and an `AbortController` timeout;
     - true only if `res.ok`, the content type starts with `application/json`, and the JSON has `status === "ok"`;
     - any exception → false.
   - `detectMode({ fetchFn = fetch, hasSupabase = !!supabase, dev = import.meta.env.DEV } = {})`:
     - if `dev`, return `pickMode(false, hasSupabase)` with no request;
     - otherwise up to 2 probe attempts; the retry happens only after a network error or timeout, not after a definite "not JSON" answer;
     - then `pickMode`.
   - Rationale: A1–A4.
5. **`src/Root.tsx`:** `mode === "supabase" ? <AuthGate><App mode={mode} /></AuthGate> : <App mode={mode} />`. `AuthGate` is not changed.
6. **`src/main.tsx`:** `applySavedTheme(); void detectMode().then((mode) => root.render(<React.StrictMode><Root mode={mode} /></React.StrictMode>))`. The page is blank until the probe settles. That is normally a few ms on the same origin, and at most about 4 s if the server hangs. Today's AuthGate already renders `null` while it loads a session.
7. **`src/data/useWardrobe.ts`**
   - `useWardrobe(starter, defaultLocations, mode: DataMode = supabase ? "supabase" : "local")`.
   - The repo `useMemo` switches on `mode`:
     - `api` → `createHttpRepo()`;
     - `supabase` → `createSupabaseRepo(supabase!)`, falling back to local if `supabase` is null;
     - `local` → `createLocalRepo`.
   - `message()` is unchanged. It already returns `Error.message`, which is Vietnamese for `ApiError`. `signOut` is unchanged and is not shown in API mode.
8. **`src/App.tsx`:** `function App({ mode }: { mode?: DataMode } = {})`, then `useWardrobe(starter, locations, mode)` and `photoUpload={wardrobe.mode !== "api"}` on `Editor`.
   - `showSignOut` stays `wardrobe.mode === "supabase"`, so it is false in API mode.
   - `showMockAi` stays `=== "local"`, so it is false in API mode.
9. **`src/features/items/Editor.tsx`:** `photoUpload = true` prop. When it is `false`:
   - in `.photo-column`, render `<div className="upload-zone" aria-disabled="true">` with `<span className="upload-icon"><Icon name="image" size={25} /></span><b>{EDITOR_COPY.photo.comingSoon}</b><small>{EDITOR_COPY.photo.comingSoonHint}</small>`;
   - omit `.photo-source-actions`, both `<input type=file>` and the "Bỏ ảnh" button;
   - keep `.photo-caption` and the mock-AI button logic as is.
   - `.upload-zone` styles are class-based (`index.css:575`), so a `div` looks the same, and there is no CSS change. Copy:
     - `comingSoon: "Ảnh món đồ — Sắp có"`;
     - `comingSoonHint: "Tính năng lưu ảnh đang được hoàn thiện"`.
10. **README:** add a bullet: "**Served by the Node server** (`node server/index.js`): API mode — data through `/api`, no login (Cloudflare Access protects the site); wins over Supabase mode. Detected at startup via `/healthz`, no build flag."
11. Run all checks.

Rules:
- **R1:** every data access stays behind `WardrobeRepo`, and the local repo is untouched. API mode is a third implementation; the Supabase one stays (T-016 removes it).
- **R3:** no new `VITE_*` variable and nothing secret. The browser sends only the Cloudflare Access cookie, implicitly, on the same origin.
- **R6:** new copy lives in `API_ERROR_COPY` and `EDITOR_COPY`.
- **R7:** follow-ups go to the impl-log.
- **R8:** new pure logic has unit tests.
- **R9:** no CSS changes, existing classes are reused, and there is a visual check by Ming.
- **R10:** `vite.config.ts` is not touched.
- **D26 A3:** no Docker or CI files are touched.

## Specialist input used
None. There are no consult files for T-014. The T-013.2 architect consult finding 2 (no shared wire-type file; `src/` defines its own client types) is followed through T-013.2 A25.

## Assumptions
- **A1 — Detection is a runtime probe of same-origin `GET /healthz`, with no build arg or flag.**
  - Why: only the Node server answers `/healthz` with `200 application/json {"status":"ok"}` (`server/app.js:48`). The Vite dev server, the Figma Make preview and any SPA-fallback host answer it with `index.html` (`text/html`), and the probe treats that as "no API".
  - Why `/healthz`: it needs no DB and no new server code, and it keeps D26 A3 (no Dockerfile/release.yml/build-arg change). `/healthz` is behind Cloudflare Access like the rest of the host, but the browser that just loaded the page already holds the Access cookie.
  - Rejected alternatives:
    - probing `/api/locations`: it needs the DB, so a 503 would be ambiguous, and it goes through the JWT check;
    - a server-injected flag in `index.html` or a new `/api/config`: it changes `server/**` and the static serving, so it is a bigger diff with no gain;
    - a `VITE_API` build arg: forbidden by D26 A3, and it would need `release.yml`.
- **A2 — Precedence is `api` > `supabase` > `local`.**
  - The production image is still built with `VITE_SUPABASE_*` (D26 A1). Once the Node server serves it, the probe wins, so there is no AuthGate and no Supabase calls from the repo.
  - Builds with Supabase env on a non-Node host keep Supabase mode.
  - With no env and no server, the app stays in local mode.
- **A3 — No probe in dev builds (`import.meta.env.DEV`).** The Figma Make preview and `pnpm dev` behave exactly as today and make zero extra requests. Trying API mode locally means `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=… pnpm start` (`server/README.md:38`).
- **A4 — Probe robustness.**
  - The timeout is 2 s per attempt, with one retry only after a network error or timeout.
  - If both attempts fail on the Node host, the app falls back to Supabase mode and the login screen appears. It does not silently write to Supabase, because a login is needed first.
  - This trade-off is accepted until T-016 removes Supabase. After that, the fallback is local mode only.
- **A5 — The Supabase client is still created at import time** when the env is set, even in API mode (`src/lib/supabase.ts`, unchanged).
  - Its only side effect is a token refresh if an old session sits in localStorage. That is harmless, and T-016 removes it.
  - `AuthGate` and the Supabase repo are never mounted or used in API mode.
- **A6 — Requests use `redirect: "manual"`.**
  - If the Cloudflare Access session expires, Access redirects `/api` calls to its login page. That is an `opaqueredirect`, and the app reports it as "session expired — reload". The server's own 401 `unauthorized` maps to the same message.
  - `credentials: "same-origin"` is the default and is stated explicitly.
  - No CSRF token is needed: the requests are same-origin, so `Sec-Fetch-Site` is `same-origin`, and PUT/POST send `Content-Type: application/json` (`server/README.md:32`).
- **A7 — The body is built from `itemToRow`** (imported from `mappers.ts`, typed with the Supabase `Database` types for now).
  - `id` and `location_id` are removed, and `location_name` is added. The server would ignore them anyway (A16), but leaving them out matches the README.
  - The client trims `location_name`, and the server NFC-normalises it.
  - When T-016 removes `src/types/database.ts`, it re-homes the row type. That is noted for T-016.
- **A8 — Photos in API mode.**
  - `item.photo` and `item.photoPath` are ignored by `save`, and every returned item has `photo: ""`.
  - Photo URLs in a CSV import are dropped silently in API mode. JSON import is already "Sắp có".
  - The bulk-photo import tab is already a "Sắp có" placeholder and is left as is.
  - Duplicating an item in API mode copies no photo.
- **A9 — `wear` uses `localToday()`** (the browser's local date, as in the local repo). The server accepts ±1 day around Asia/Ho_Chi_Minh today (T-013.2 A12/A19).
- **A10 — Delete of an id that is not a UUID** (it cannot occur in API mode, because every item comes from the server) is sent anyway, and the server's 400 is shown as a toast.
- **A11 — API mode starts empty.** Moving existing Supabase data is not in this ticket. Ming can export JSON from the current Supabase-mode site before the switch; JSON import is F-602, still "Sắp có". This is listed as a follow-up for Ming, not done here.
- **Hotspots:**
  - `src/App.tsx` and `src/features/items/Editor.tsx` (UI tickets);
  - `README.md` (T-015/T-016 also edit it);
  - `src/data/useWardrobe.ts` (T-016 removes the Supabase branch).
- **Follow-ups (not in this diff):**
  - T-016: drop the `supabase` branch from `pickMode`/`useWardrobe`, re-home `ItemRow`/`ItemInsert` types, and make the fallback local-only.
  - Data move from Supabase to Postgres (A11) if Ming wants it.

## Blocking questions
None.

## Split proposal
None. The slice is about 280 lines of non-test code and one feature (the HTTP repo plus mode selection), under the ~400-line guide.
