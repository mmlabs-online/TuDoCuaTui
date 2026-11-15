## Attempt 1 — 2026-11-15
Verdict: REWORK

Reviewed: branch `claude/magical-cori-2ssw8l` at d46f15f, diff `origin/main...HEAD`.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0, clean.
- format:check: "All matched files use the correct format." (242 files), exit 0.
- test: Test Files 90 passed | 9 skipped (99); Tests 1162 passed | 176 skipped (1338). Same as impl-log.
- build: `✓ built in 410ms` (AuthRoot chunk 24.37 kB).

Browser checks (Playwright, Chromium, 390x844, light and dark):
- Real `AuthGate` in identity mode against the built `dist/`. `/healthz` was mocked to `auth: identity` and `api.mmlabs.online` was mocked with route interception (scratchpad script `join-e2e.cjs`, screenshots in `scratchpad/t01910/`).
- `/auth-preview.html` under `pnpm dev`, "Tham gia" screen.

### Acceptance criteria
- [x] `not_member` with `join_available` shows "Tiếp tục với <email>"; join, then token. Evidence:
  - Unit tests: `AuthGate.test.tsx` › join flow (9 tests including the it.each), `tokenStore.test.ts` › join / accountEmail (5), `identityClient.test.ts` › join and accounts (5). All pass.
  - Browser, sign-in: the requests were `POST /auth/login, POST /auth/token`, then the join screen with the login email. There was no join or accounts call before the click. After the click the order was `…, POST /auth/apps/tudocuatui/join, POST /auth/token`, then the app opened. The join body was exactly `{"account_id":…}` with `X-MM-App: tudocuatui`, `Content-Type: application/json` and no Authorization header.
  - Browser, reload with a stored id: `POST /auth/token, GET /auth/accounts` (with `X-MM-App`, no body), then the join screen with the email from accounts. A second reload showed the join screen again, still with no join call.
  - Storage after the join held only `mm_account_id` (plus the theme key). The token did not appear in the DOM or the console. The server `message` was not echoed.
- [x] A refused join shows Vietnamese copy. Evidence:
  - Unit tests: `AuthGate.test.tsx` › it.each over 6 codes, plus "join session_invalid → sign-in, id cleared". `copy.test.ts` and `errors.test.ts` extended.
  - Browser: `join_closed` showed "Tủ đồ của tôi hiện không nhận thành viên mới." and `join_unavailable` showed "Chưa thể tham gia Tủ đồ của tôi lúc này. Vui lòng liên hệ người vận hành." The user stayed on the join screen, no `/token` followed, and the server text was not shown.
  - "Dùng tài khoản khác": sign-in screen, `mm_account_id` cleared, no `/logout` call (unit test and browser).
- [x] The privacy notice comes before "Tiếp tục với <email>" (D38). Evidence:
  - `JoinScreen.test.tsx` › "privacy notice … precedes the continue button" (compareDocumentPosition). The browser check confirmed the order in every join state.
  - The text equals `PHOTO_PRIVACY_NOTICE` (`src/constants/privacy.ts:2-3`), verbatim from the ticket.
  - The editor notice shows in identity mode and is absent in local mode. Evidence: `Editor.test.tsx` › "photo privacy notice", and a browser check of the local build (0 matches, 0 identity calls).
- [ ] All checks pass; 390px and dark mode. The checks are green, but the 390px check FAILED (Issue 1), and the light-mode contrast of the editor notice is too low (Issue 2).

### Issues
#### Issue 1 — 🔴 blocker — R9 / plan AC4: a long email does not wrap and overflows the viewport
- **Where**: `src/features/auth/JoinScreen.tsx:17` (`<span className="break-all">`). The global `.btn { white-space: nowrap; }` is at `src/index.css:132`.
- **Expected**: Plan AC4 says: "A long email such as `nguyễn.thị.phương.thảo.rất.dài@example.com` wraps inside the button and does not scroll horizontally."
- **Actual**:
  - The span inherits `white-space: nowrap` from `.btn`, so `break-all` has no effect.
  - With `nguyễn.thị.phương.thảo.rất.dài.dài.dài@example.com` at 390px (light and dark), the label scrollWidth is 358 against a 322 clientWidth. The text runs out of both sides of the button, and `document.documentElement.scrollWidth` = 392 (page scrolls horizontally).
  - Screenshot before the fix: `join-signin-light.png` from the first run. The preview only uses `an@example.com`, which is why it does not show the problem.
- **Fix instruction**:
  - Change the span to `<span className="whitespace-normal break-all">` (or set `whitespace-normal` on the span some other way; it must be on the span, because the unlayered `.btn` rule beats utilities on the `<button>`).
  - Verified by injecting `button .break-all{white-space:normal}`: the label wraps to two lines inside the 39px button, scrollWidth is 322/322 and the page is 390 in all join states, light and dark.
  - Optionally use a long email in the `AuthPreview` join screen, so the preview shows this case.

#### Issue 2 — 🟡 should-fix — R9 contrast: the editor privacy notice is barely readable in light mode
- **Where**: `src/features/items/Editor.tsx:139` (`style={{ color: "var(--muted)" }}`)
- **Expected**: Readable text on the photo column, at least 4.5:1, like the other text there (the column uses `#fff8eb` text on `var(--chocolate)`, `src/index.css:1930-1934`).
- **Actual**:
  - The photo column background is `var(--chocolate)` in both themes.
  - Light mode: `--muted` rgb(111,106,98) on rgb(59,42,34) gives about 2.5:1, grey on dark brown and hard to read (screenshot `editor-light.png`).
  - Dark mode: about 8.5:1, which is fine.
  - The notice also sits directly against the buttons, with no top margin.
- **Fix instruction**: In `Editor.tsx`, keep the change in that file and use a light text colour that works on the chocolate background in both themes, for example `className="mt-2 text-xs" style={{ color: "#fff8eb", opacity: 0.85 }}` (this matches `.photo-column .ai-btn`). Do not use `--muted` there. No CSS file change is needed.

### Rules R1–R10 (CLAUDE.md)
- R1: holds. Local mode never mounts `AuthGate`. The editor notice is gated on `photoById`; checked in a test and in the browser.
- R3: holds. Only cookie + `X-MM-App` calls. The token is fetched only after a successful join (`tokenStore.ts` `join()`, with a generation guard). There is no new storage.
- R6: holds. All new copy is in `src/features/auth/copy.ts`, `src/features/items/copy.ts` and `src/constants/privacy.ts`. There are no literals in `JoinScreen.tsx` or `Editor.tsx`.
- D8 consent: holds. `store.join()` is reached only from the `JoinScreen` `onJoin` button. The `useRef` guard and `disabled` stop double submits (test "double click sends one join").
- R7: holds. Every source file is in the plan. The `work/ming-todo.md` and `ticket.md` edits are orchestrator bookkeeping for the plan approval.
- R8: holds. Tests cover the client, errors, store, screen and gate.
- R9: violated (Issues 1 and 2).
- R2, R4, R5: n/a. R10: holds; no Figma files touched.

### Nits (do not block)
- 💭 The impl-log says "Not committed", but the work is in commit d46f15f.
- 💭 `AuthGate.join()`: if the user taps "Dùng tài khoản khác" while a join is in flight and the join then fails with `session_invalid`, the sign-in screen gets that error notice. This is harmless.

### Follow-ups (out of scope)
- As in the impl-log: when an `accounts()` lookup fails with `session_invalid`, the stored id stays until the next `/token` call.
- `.btn` with `white-space: nowrap` will clip any other button label that carries user data. Worth a shared `Btn` wrap option later.

### Security blockers (added by the orchestrator)
Security S1 (🟡, `security-review.md` Attempt 1) is added to this rework: a late join result for account A after "Dùng tài khoản khác" can call `enterReady()` for B or set `signed_out` while B is ready without `retireApp()` (`AuthGate.tsx:245-261`, `:282-288`), reopening the T-019.7 generation window. Fix with a gate-level join marker, reset `joining.current` in `onUseOtherAccount`, and a test.
