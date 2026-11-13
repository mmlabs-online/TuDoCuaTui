# Impl log — T-010

## Attempt 1

### Files touched
| File | Required because |
|---|---|
| `src/data/aiSettings.ts` (new) | R1: HTTP client + local stub + `AiSettingsError` |
| `src/data/aiSettings.test.ts` (new) | R8 |
| `src/features/settings/form.ts` (new) | pure form helpers |
| `src/features/settings/form.test.ts` (new) | R8 |
| `src/features/settings/copy.ts` (new) | R6 copy + `aiErrorMessage` |
| `src/features/settings/copy.test.ts` (new) | R8, AC 3 |
| `src/features/settings/AiSettingsModal.tsx` (new) | the screen |
| `src/features/settings/AiSettingsModal.test.tsx` (new) | AC 1-3 |
| `src/features/layout/Header.tsx` | optional `onSettings` gear button |
| `src/components/Icon.tsx` | `settings` icon |
| `src/App.tsx` | state + wiring, API mode only |
| `src/App.test.tsx` | two AC 4 tests |
| `src/index.css` | `.ai-settings-*` rules (variables only) |

### Tests added
aiSettings, form, copy, AiSettingsModal, 2 in App.test.tsx (cases per plan).

### Checks
- `pnpm typecheck`: clean
- `pnpm format:check`: all matched files use the correct format
- `pnpm test`: 69 files passed, 6 skipped; 794 passed, 102 skipped
- `pnpm test:coverage`: passed; statements 80.65%, branches 83.89%, functions 82.65%, lines 80.03%
- `pnpm build`: built OK

### Out-of-plan files
None.

### Follow-ups
- `copy.ts` exports `AI_ERRORS` (needed by tests); no other follow-ups.

### Scope self-check
Only plan files changed; no server/, db/, src/shared/ai changes; strings `ai_settings`/`AI_KEK` absent from client code (boundary test green).
