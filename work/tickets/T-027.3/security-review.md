# Security review — T-027.3

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-18

**Overall result: PASS. No 🔴 blockers; 3 🟡 non-blocking notes.** The auditor read the current files on the branch
(no shell, so no git diff) against plan.md and impl-log.md.

### Findings
1. **Auth flow behaviour is unchanged.** `src/features/auth/copy.ts:1` imports `formatWait` from `@/lib/formatWait`;
   `authErrorMessage` still calls `e.rate_limited(formatWait(error.retryAfterSeconds ?? NaN))` (line 139). The other
   auth messages are plain copy and `authErrorMessage` (lines 131–149) has no other dependency.
   `src/features/auth/copy.test.ts:48-51` still checks 120 s → "2 phút" and no wait → "ít phút".
   `src/lib/formatWait.test.ts` keeps the 10 boundary cases (1, 59, 60, 61, 900, 3600, 3601, 0, -5, NaN); there is
   exactly one `function formatWait` in `src`.
2. **The shared helper is safe.** `src/lib/formatWait.ts:1-7` is one pure function: no imports, side effects,
   network or storage. Auth depends only on `src/lib` (it already used `@/lib/theme`), not on feature code.
3. **`boundary.test.ts` still means something.** Lines 43–57 scan non-test files in `features/auth` for risky calls
   (`copy.ts` has none); lines 59–73 check nothing outside `features/auth` mentions it except `main.tsx` (neither
   `src/lib/formatWait.ts` nor its test does). No allow-list widened; the test file is unchanged.
4. **Error text is safer than before.** `photoJobErrorText` (`src/data/photoImport.ts:150-155`): `ApiError` shows its
   `API_ERROR_COPY` message (`apiErrors.ts:47-55`); `PhotoPrepError` its `EDITOR_COPY` message (`photoPrep.ts:56`);
   `PhotoSaveError` with an `ApiError` cause the same Vietnamese text as before; `PhotoSaveError` with any other cause
   now the fixed `photoNotSaved` (before: the raw `cause.message`, `apiErrors.ts:83-84`); anything else `generic`
   instead of the raw `.message`. No tokens or personal data; the only identifier shown is the server `requestId`
   in `internal` errors, as before.
5. **Stop message and row AI label are fixed copy.** `STOP_MESSAGE` (`ImportPhotosTab.tsx:24-31`) uses `PHOTOS.*`
   copy plus `formatWait(cooldownSec)`; the row label (lines 228–235) uses `AI.rowTagging` / `AI.state[...]`.
   Rendered as React text, no `innerHTML`.
6. **AI settings load only through the existing client.** `ImportModal.tsx:50` passes `undefined` settings off the
   Photos tab, so `useAiLoad` (`src/features/items/useAiLoad.ts:15`) returns early; otherwise it calls the existing
   `settings.get()`. The tagger is still gated on `availability.kind === "ready"` (line 55).
7. **R1 and R3 hold.** No `fetch`, direct API calls, `VITE_*` variables or secrets in the changed files. `withAiStop`
   (`photoImport.ts:170`) only refactors the return value. CSS changes are layout only.

### Non-blocking notes (🟡)
- 🟡 `photoImport.ts:151-152`: an `internal` `ApiError` cause still shows the server request id ("mã …") in the failed
  list. Unchanged and intended (support reference).
- 🟡 `formatWait.ts` equivalence rests on the moved boundary table and `auth/copy.test.ts:48-51`; the reviewer should
  confirm via `git diff main -- src/features/auth src/lib` that the auth diff is only the import swap and the removed
  test block (plan assumption A3).
- 🟡 Risk tier: `src/features/auth/copy.ts` and `copy.test.ts` match `src/features/auth/**` (High). No behaviour change;
  Ming approved the plan. The PR description should say auth files were touched (import swap only).

### Risks
None new; the change slightly reduces raw-message display (finding 4).

### Open questions
None.
