Status: READY

# Plan — BUG-001: Confirm button invisible in confirm dialogs

## Feature summary
This is a bug ticket (D42), not a feature-list item. The behaviour it protects:

- `docs/feature-list.md:86`: "`src/components/` for UI primitives: `Icon`, `Btn`, `Modal`, `Field`, `Confirm`, …"
- `docs/feature-list.md:121`: "**AC:** matches the app style in light and dark mode; works on a 390px viewport."
- `work/decisions.md` D42: "Every bug fix ships with a regression test that fails before the fix (Playwright when jsdom cannot see the bug); the reviewer gives REWORK without it. … Playwright is not a repo dependency yet (adding it is Ming's decision): until then a browser-only bug gets a unit-level regression test where one can reproduce it, plus a one-off Playwright check (the session's preinstalled Playwright …) whose result is recorded in impl-log and review."

**State of the fix.** The CSS fix already shipped in T-024 (PR #64, merge commit `169709a`). `src/index.css:2420-2425`:
```css
.btn.btn-danger-fill,
.btn.btn-danger-fill:hover { background: #a4453e; border-color: #a4453e; color: #fff; }
```
Specificity (0,2,0) beats the redesign `.btn { background: transparent; border-color: var(--text) }` (`index.css:1413`, 0,1,0) and `.btn:hover { border-color: var(--orange) }` (`index.css:1421`, 0,1,1). The colour is fixed in both modes on purpose: white on the dark `--danger` `#e27c73` is only 2.85:1, white on `#a4453e` is 6.0:1 (T-024 plan). The root cause in the ticket is now **confirmed**: the T-024 audit (P1 #2) measured contrast 1.02 and computed background `rgba(0, 0, 0, 0)` on the pre-fix `main`.

Code reading of the current tree finds no remaining gap:
- All three dialogs use the same component with the default `kind="danger-fill"`: `Editor.tsx:379` (discard), `App.tsx:237` (delete item) and `AiSettingsModal.tsx:209` (delete AI key). None passes `kind`. `Btn` renders `btn btn-${kind}`.
- Hover: no later rule sets `background` on `.btn:hover`. The `.btn:hover` orange `box-shadow` ring (`index.css:1423`) still shows on the danger button. That is the shared hover cue for every `.btn`, so it stays.
- Dark: no `.dark .btn*` rule touches `btn-danger-fill`. Only `.dark .btn-primary` exists (`index.css:147`, `1445`).
- Nested modal (AI key): the AI-key `Confirm` renders inside the AI settings `.modal`. No `.modal .btn`-style descendant rule sets colour or background, so the nesting changes nothing.
- 390px: `.confirm-content > div > .btn { flex: 1 1 0 }` (`index.css:2575`) and `min-height: 44px` under `(max-width: 650px), (pointer: coarse)` (`index.css:2747-2755`).

**What remains for this ticket:** (1) prove with a browser run that the shipped fix meets every acceptance criterion, including the AI-key dialog, which only renders in API mode; (2) add the D42 regression check as a durable, committed script that fails on pre-fix `7d6df33` and passes on the current branch. No `src/` change is expected. A contingency CSS change applies only if the run proves a gap (see Approach step 5).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Regression check: a Playwright run on the built app asserts the confirm button's computed background is the danger colour; it fails on `main` before the fix and passes after; result and screenshots (light/dark, 390px) recorded in impl-log (D42) | Run `scripts/confirm-verify.cjs` (see *Tests to write*) twice against a `pnpm build && pnpm preview` server. **Before:** a detached worktree at `7d6df33`, built and served on another port. Expect exit code 1, with failures `danger-bg` (`rgba(0, 0, 0, 0)`) in light and dark and `contrast` in light. **After:** the current branch. Expect exit code 0. impl-log has both `summary.json` outputs (verbatim failure lines), the two commit SHAs and the screenshot paths. The reviewer re-runs the "after" command and gets exit 0. |
| 2 | All three confirm dialogs: danger background and readable text (contrast ≥ 4.5:1), light and dark | The script, for each dialog `discard`, `delete-item`, `delete-ai-key` × `light`, `dark` × viewport `390x844`, `1280x800`, asserts on `.confirm-content .btn-danger-fill`: computed `background-color === "rgb(164, 69, 62)"`, `border-color === "rgb(164, 69, 62)"`, `color === "rgb(255, 255, 255)"`, composited contrast ≥ 4.5. **Hover:** after `locator.hover()` and a 300 ms wait (`.btn` has `transition: 0.18s`), it asserts the same background and contrast again. The 1280 run uses `isMobile: false`, so hover is real. Screenshots go to `<out>/<dialog>-<theme>-<w>.png` and `…-hover.png`. |
| 3 | Cancel buttons and `.btn-primary` look unchanged; 390px: both buttons visible and tappable | (a) The script records computed `background-color`, `color` and `border-color` of the confirm's cancel button (`.confirm-content .btn-secondary`) and of the header `.btn-primary` ("Thêm món đồ") per theme in `summary.json` under `unchanged`. The implementer diffs the `unchanged` block between the before and after runs and records the result in impl-log: it must be identical. The reviewer confirms in `git diff 7d6df33..HEAD -- src/index.css` that the T-024 change touches only `.btn.btn-danger-fill` among button colours. (b) At 390×844 the script asserts both confirm buttons have `width > 0`, lie fully inside the viewport (`left ≥ 0`, `right ≤ innerWidth`, `bottom ≤ innerHeight`), have `height ≥ 44`, and do not overlap. |
| 4 | All checks pass | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all exit 0. The new `.cjs` file must pass `oxfmt --check`. |

## Ming verification after merge
- Production (API mode, identity): open an item, change a field, close the editor. On the "Bỏ thay đổi?" dialog the "Bỏ thay đổi" button is red with a white label, in light and dark mode. This is the exact environment of the report. The script reaches API mode only through mocked endpoints.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `scripts/confirm-verify.cjs` | **Create.** Small Playwright check (≈150–200 lines) for the three confirm dialogs, described below | D42 regression test. Durable and committed, so later CSS work can re-run it. Same pattern as `scripts/mobile-verify.cjs`: global Playwright via `NODE_PATH`, no new dependency. |
| `work/tickets/BUG-001/impl-log.md` | Create: before/after runs, SHAs, failure lines, `unchanged` diff, screenshot paths | D42: the result is recorded in impl-log |
| `src/index.css` | **Only if** the after-run fails an assertion (contingency, Approach step 5). Edit inside the existing T-024 rule at `index.css:2420-2425`; add no new block. | Ticket scope: "Smallest change in `src/index.css`" |

No other file. `scripts/mobile-verify.cjs` stays unchanged: it is a large T-024 audit tool, and its check E already covers two dialogs. A focused script keeps this regression test fast and readable (R7).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `scripts/confirm-verify.cjs` › check `danger-bg` (dialog × theme × viewport, idle and hover) | AC 1, AC 2 (background, border, text colour) |
| `scripts/confirm-verify.cjs` › check `contrast` (≥ 4.5, idle and hover) | AC 2 |
| `scripts/confirm-verify.cjs` › check `tap-390` (both buttons in viewport, ≥ 44px high, no overlap) | AC 3b |
| `scripts/confirm-verify.cjs` › `unchanged` record (cancel + `.btn-primary` computed colours) | AC 3a, compared before/after in impl-log |

No jsdom unit test: jsdom does not apply the cascade from `index.css`, so it cannot reproduce this bug (ticket *Technical notes*, D42). `pnpm test` is not changed. The script is a reviewer tool, like `mobile-verify.cjs`.

### Script spec: `scripts/confirm-verify.cjs`
- **Header comment:** usage, the same style as `mobile-verify.cjs`:
  ```
  pnpm build && pnpm preview --port 5199 --strictPort
  NODE_PATH=$(npm root -g) node scripts/confirm-verify.cjs --out <dir> [--base http://localhost:5199]
  ```
  Exit 1 on any failure. `summary.json` in `<dir>`.
- **Server:** the **built** app through `vite preview`. On `vite preview`, `/healthz` returns the SPA HTML, so `detectRuntime` picks local mode with demo items. API mode needs no real server: in the API-mode context, `page.route` mocks the endpoints. A dev server is not usable because `detectRuntime` forces local mode when `import.meta.env.DEV`.
- **Contexts:** for each theme `light`/`dark` and each viewport `[390,844, mobile]`/`[1280,800, desktop]`, a fresh context. It sets `colorScheme` and seeds `localStorage` `tu-do-theme` with an init script, as in `newContext` in `mobile-verify.cjs` (key and approach copied from there). `isMobile`/`hasTouch` are true only for 390.
- **Dialog `delete-item` (local mode):** open the first `.item-card` and click the button named `/Xoá$/` → `.confirm-content`.
- **Dialog `discard` (local mode):** open the first `.item-card`, change the first `.modal .field input`, press Escape → `.confirm-content`. Take the discard copy from `EDITOR_COPY.discard`; selecting by structure (`.confirm-content`) is enough.
- **Dialog `delete-ai-key` (API mode, mocked):** a separate page with `page.route` before `goto`:
  - `GET /healthz` → `200`, `content-type: application/json`, body `{"status":"ok"}` (no `auth` field, so `needsAuth` is false; `src/lib/boot.ts:23`).
  - The item/location endpoints the app calls at startup in API mode → empty JSON lists. The implementer reads the exact paths and response shapes from `src/data/repo.http.ts` (base `/api`), and anything else loaded on boot, then fulfils them. If an unmocked `/api/**` request is seen, route it to a 404 JSON response and log it in `info`.
  - `GET /api/ai-settings` → an `AiSettingsView` (`src/shared/ai/catalog.ts:28`): a valid `provider`/`model` pair from the catalog, `keyHint: "…abcd"`, `hasKey: true`, `modelSupported: true`, `updatedAt` ISO. The response envelope must match what `src/data/aiSettings.ts` parses.
  - Steps: click the header button with aria-label `SETTINGS_COPY.open` (`Header.tsx:41`; read the string from `src/features/settings/copy.ts`), wait for the delete-key `.btn-danger` button to be enabled, click it → `.confirm-content`.
  - **Fallback**, only if API-mode mocking proves unworkable within the small budget: in the local-mode page, inject the exact nested DOM that `Modal` + `Confirm` + `Btn` produce (`.modal-backdrop > .modal > … > .modal-backdrop > .modal > .confirm-content > div > button.btn.btn-secondary + button.btn.btn-danger-fill`) into `document.body`. The real built stylesheet then applies. Record in impl-log that the fallback was used and why.
- **Measurements:** reuse the compositing/contrast math of `contrastOf` in `mobile-verify.cjs` (copy the function; do not import, because that file runs on load). Take screenshots per dialog/theme/viewport, plus a `-hover` shot at 1280.
- **Output:** `summary.json` = `{ failures: [...], info: [...], unchanged: { light: {...}, dark: {...} }, out }`, printed to stdout. Failure lines look like `[danger-bg] delete-ai-key light 390: rgba(0, 0, 0, 0)`.

## Approach
1. Write `scripts/confirm-verify.cjs` per the spec above. Run `pnpm format` so oxfmt accepts it.
2. **After run (current branch):** `pnpm build`, `pnpm preview --port 5199 --strictPort` in the background, run the script with `--out <scratchpad>/bug001-after`. Expect exit 0.
3. **Before run (pre-fix):** `git worktree add --detach <scratchpad>/bug001-pre 7d6df33`, then `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm preview --port 5198 --strictPort` there. Run the **branch's** script with `--base http://localhost:5198 --out <scratchpad>/bug001-before`. Expect exit 1 with `danger-bg` failures for all three dialogs in both themes and `contrast` failures in light. If a dialog cannot be reached on `7d6df33` (for example, a selector differs), record it in impl-log. At least `discard` and `delete-item` must show the failure. Remove the worktree afterwards (`git worktree remove`).
4. Diff the `unchanged` block before vs after. Write impl-log: commands, SHAs (`7d6df33`, HEAD), both exit codes, the failure lines verbatim, the `unchanged` comparison, and screenshot paths (light/dark at 390 at minimum). Screenshots stay in the scratchpad: they are not committed.
5. **Contingency (only on a failing after-run):** make the minimal edit to the existing `.btn.btn-danger-fill, .btn.btn-danger-fill:hover` rule in `src/index.css`. Examples: add a `.dark` variant only if the dark fill is wrong, or raise specificity only if a later rule wins. Re-run both checks. Record the reason in impl-log. Do not touch other button styles.
6. Run all checks.

Rules: R6 n/a (no UI copy). R7: diff = one new script (+ the contingency edit only if needed). R8: the regression check exists, and the checks must pass. R9: covered by 390px + dark in the script. R10: `vite.config.ts` and Figma files are untouched. R1–R5: no data, schema, secrets or storage changes. The API-mode mocks live only in the test script and contain no real keys (R3).

## Specialist input used
None. There are no consult files. T-024's `plan.md`, `audit.md` and `review.md` are used as evidence for the root cause and the colour choice.

## Assumptions
- A committed reviewer script in `scripts/` that uses the session's global Playwright counts as the D42 "one-off Playwright check". It adds no repo dependency, and the same precedent was accepted for `scripts/mobile-verify.cjs` in T-024. If Ming prefers it outside the repo, the script can be moved without other changes.
- `7d6df33` is the pre-fix `main` (orchestrator note). Its build serves the same DOM structure for the confirm dialogs.
- The danger colour is the fixed `#a4453e` / `rgb(164, 69, 62)` in **both** modes, as chosen in T-024 for contrast, rather than the dark `--danger` `#e27c73`. That colour fails 4.5:1 with white text.
- The orange focus/hover ring (`box-shadow`) on the danger button is acceptable, because it is the shared `.btn:hover` cue. Only background, border and text are asserted.
- `src/index.css` is a hotspot shared with other open UI tickets. The contingency edit, if needed, stays inside the T-024 rule to avoid conflicts.

## Blocking questions
None.

## Split proposal
None.
