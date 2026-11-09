Status: READY

# Plan — F-201: Harden the item editor

## Feature summary
`docs/feature-list.md`, F-201 · Item editor hardening · P0 · M1 · M:
> - Save button shows a loading state and stays disabled while saving.
> - Validation: name required (max 120 chars), price ≥ 0, purchase date not in the future.
> - Unsaved-changes guard when closing the modal.
> - **AC:** no double submits; error toasts use the messages from `useWardrobe.message()`.

Ticket scope (quoted):
> - The save button shows "Đang lưu…" and is disabled while saving.
> - Validation with inline messages: name required and at most 120 characters (DB check); price ≥ 0; purchase date not in the future.
> - Unsaved-changes guard on every close path: X button, "Huỷ", Escape and a backdrop click (`Modal` handles the last two).

Ticket technical note: "Keep 0 → null (it means "unknown"), and block negative values in the form."
DB check (`supabase/migrations/20261106000000_init.sql`): `name text not null check (char_length(name) between 1 and 120)`, `price … check (price is null or price >= 0)`.
No entry in `work/decisions.md` changes F-201. Follow-up carried from F-601.2 (`review.md`): "extract a shared `validateItem` and use it in the CSV mapper".

Out of scope: photo handling (F-202.x), back-dated wear (F-501), moving existing editor copy (proposed F-004.4).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | No double submits | `App.test.tsx › F-201 editor › double-clicking save adds one item and shows "Đang lưu…"`: a duplicate saved with two synchronous clicks gives 17 cards, not 18; the save button reads "Đang lưu…" and is `disabled` between the click and the toast. Code check: `App.save` uses a ref guard, not only state. |
| 2 | Error toasts use `useWardrobe.message()` | `App.test.tsx › F-201 editor › a failed save shows the repo error as a toast`: `Storage.prototype.setItem` throws `new Error("Hết dung lượng")` → toast "Hết dung lượng", the editor stays open, button returns to "Lưu món đồ". Code check: every `catch` in `App.tsx` editor paths calls `notify(wardrobe.message(e))` (already true; must stay so). |
| 3 | Closing with unsaved changes asks for confirmation on all four close paths | `App.test.tsx › F-201 editor › unsaved-changes guard` (one `it` per path: X button, "Huỷ", Escape, backdrop `mouseDown`): after editing the name, the path shows "Bỏ thay đổi?"; "Tiếp tục sửa" keeps the editor with the edit; repeating and choosing "Bỏ thay đổi" closes it and the card keeps its old name. Plus `closes without asking when nothing changed` (all four paths) and `wear +1 alone does not count as an unsaved change`. Unit: `dirty.test.ts`. |
| 4 | A negative price cannot be submitted | `validate.test.ts` price cases (−1 → error, 0 → ok) and `App.test.tsx › F-201 editor › a negative price shows an inline error and is not saved` (price −1 → inline "Giá không được âm", no "Đã lưu thay đổi" toast, editor open; price 0 → saves). |
| 5 | (scope) Inline validation: name required / ≤ 120 chars, date not in the future | `validate.test.ts` boundaries (120/121 code points, today/tomorrow in UTC+7, empty name, whitespace-only name); `App.test.tsx › F-201 editor › name and future-date errors are inline` and the updated `saving a new item without a name shows an inline error`. |
| 6 | (scope) Escape on a stacked dialog closes only that dialog | `App.test.tsx › F-201 editor › Escape on the delete confirm closes only the confirm` and Escape on the discard dialog in AC3's tests (editor stays open). |
| 7 | Checks green | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (coverage thresholds incl. new `validate.ts`, `dirty.ts`), `pnpm build`. |

## Ming verification after merge
- Manual (ticket test plan): on the deployed app, double-click "Lưu món đồ" with DevTools network throttling ("Slow 3G") in Supabase mode → one item, button shows "Đang lưu…".
- At a 390px viewport and in dark mode (R9): inline error text is readable (danger colour) and the discard dialog fits; on a real phone, the date picker does not offer future dates (`max`).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/items/validate.ts` | **Create.** `NAME_MAX = 120`; `nameError(name)`, `priceError(price)`, `dateError(date, today)`; `validateItem(item, today): ItemErrors`; `hasErrors(errors)`. Returns error **codes**, no copy. | Ticket technical note; shared rules (F-601.2 follow-up) |
| `src/features/items/validate.test.ts` | **Create.** Unit tests (table below). | R8; ticket test plan |
| `src/features/items/dirty.ts` | **Create.** `EDITABLE_FIELDS` and `isDirty(initial, current)` comparing only user-editable fields. | Unsaved-changes guard is pure logic (planner rule 6) |
| `src/features/items/dirty.test.ts` | **Create.** Unit tests (table below). | R8 |
| `src/features/items/copy.ts` | **Create.** `EDITOR_COPY`: new F-201 strings only (saving label, validation messages, discard dialog). | R6 ("UI copy in one place per feature"); orchestrator note: keep new editor copy in one place |
| `src/features/items/Editor.tsx` | Add `saving` prop; save button disabled + "Đang lưu…"; validate on save and render inline errors; `requestClose` guard wired to Modal, X and "Huỷ"; discard `Confirm`; `min={0}` on price, `max={today}` on date, `aria-invalid`. | Ticket scope |
| `src/components/Modal.tsx` | Only the topmost open Modal reacts to Escape (module-level stack). | Escape on a dialog stacked over the editor must not also trigger the editor's close guard (and today it closes the editor under the delete confirm) |
| `src/components/Confirm.tsx` | Optional props `title`, `body`, `cancelLabel`, `confirmLabel`, `icon`, `kind`; defaults = today's delete copy, so the existing delete usage is unchanged. | Reuse for the discard dialog instead of a second dialog component |
| `src/components/Field.tsx` | Optional `error?: string` rendered under the control as `<small role="alert">` in `var(--danger)`. | Inline messages |
| `src/App.tsx` | `save`: ref guard (`savingRef`) against double submit; drop the `name.trim()` toast check (validation moves to the Editor); pass `saving` to `Editor`. ~6 lines. | AC1; validation lives in one place |
| `src/App.test.tsx` | Add `describe("F-201 editor")` tests; update `saving a new item without a name shows a validation toast` → inline error (behaviour change by this ticket). | AC verification |
| `src/features/import-export/csv/map.ts` | Use `NAME_MAX` and `nameError` from `@/features/items/validate` instead of its local copy of the name rule. Messages and behaviour unchanged; `map.test.ts` untouched and green. | F-601.2 follow-up ("extract a shared `validateItem` once F-201 lands") |
| `vitest.config.ts` | Add `src/features/items/validate.ts` and `src/features/items/dirty.ts` to `coverage.include` and `coverage.thresholds` (same `thresholds` object). Nothing else (R10: Figma plugins are in `vite.config.ts`, not this file). | R8, same treatment as `filters.ts` |

No other files. `src/index.css` is not touched (error styling via inline `style={{ color: "var(--danger)" }}` + Tailwind `text-xs`, as `App.tsx` already does for the load-error banner).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `validate.test.ts › nameError › empty and whitespace-only → "nameRequired"` | `""`, `"   "` |
| `validate.test.ts › nameError › 120 code points ok, 121 → "nameTooLong"` | Boundary; uses Vietnamese letters (`"ệ".repeat(120)` NFC) so code points, not UTF-16 units or bytes, are counted |
| `validate.test.ts › nameError › trims before counting` | `" " + "a".repeat(120) + " "` ok (itemToRow trims before insert) |
| `validate.test.ts › priceError › −1 → "priceNegative", 0 ok, 890000 ok` | Ticket boundaries −1/0 |
| `validate.test.ts › priceError › NaN / Infinity → "priceInvalid"` | `+e.target.value` edge |
| `validate.test.ts › dateError › empty ok; today ok; tomorrow → "dateFuture"` | Boundary, `today` passed in |
| `validate.test.ts › dateError › timestamp in UTC+7` | `"2026-11-09T18:00:00Z"` with today `"2026-11-10"` ok (UTC+7 date = 11-10); with today `"2026-11-09"` → `"dateFuture"` |
| `validate.test.ts › dateError › garbage → "dateInvalid"` | `"abc"` |
| `validate.test.ts › validateItem / hasErrors` | Valid item → `{}` and `hasErrors` false; several bad fields → all three codes |
| `dirty.test.ts › isDirty › same values → false` | Fresh copy (`{...item}`, copied arrays) |
| `dirty.test.ts › isDirty › each editable field change → true` | name, category, status, colors, seasons, brand, size, location, price, purchaseDate, material, tags, notes, photo |
| `dirty.test.ts › isDirty › wearCount, lastWorn, id, createdAt, photoPath changes → false` | Wear buttons save immediately; duplicate's id reset is not a form edit |
| `dirty.test.ts › isDirty › array order and same-content arrays` | `["Đen","Trắng"]` vs a new array with same order → false; different order → true (chip order is user-visible) |
| `App.test.tsx › F-201 editor › double-clicking save adds one item and shows "Đang lưu…"` | AC1 |
| `App.test.tsx › F-201 editor › a failed save shows the repo error as a toast` | AC2 |
| `App.test.tsx › F-201 editor › unsaved-changes guard › X button` / `› Huỷ` / `› Escape` / `› backdrop click` | AC3 (Escape also checks the discard dialog closes alone) |
| `App.test.tsx › F-201 editor › closes without asking when nothing changed` | AC3 negative, all four paths |
| `App.test.tsx › F-201 editor › wear +1 alone does not count as an unsaved change` | AC3 edge |
| `App.test.tsx › F-201 editor › a negative price shows an inline error and is not saved` | AC4 |
| `App.test.tsx › F-201 editor › name and future-date errors are inline` | Scope: 121-char name, tomorrow's date |
| `App.test.tsx › F-201 editor › Escape on the delete confirm closes only the confirm` | Modal stack |
| `App.test.tsx › saving a new item without a name shows an inline error` (updated) | Replaces the toast assertion: inline "Vui lòng nhập tên món đồ", heading "Món đồ mới" still shown |

Existing `map.test.ts` must pass unchanged.

## Approach
1. **`validate.ts`** (pure, no React, no copy):
   ```ts
   export const NAME_MAX = 120;
   export type ItemErrorCode = "nameRequired" | "nameTooLong" | "priceNegative" | "priceInvalid" | "dateInvalid" | "dateFuture";
   export type ItemErrors = Partial<Record<"name" | "price" | "purchaseDate", ItemErrorCode>>;
   export function nameError(name: string): ItemErrorCode | null      // trim; [...s].length (code points = Postgres char_length)
   export function priceError(price: number): ItemErrorCode | null    // !Number.isFinite → priceInvalid; < 0 → priceNegative
   export function dateError(date: string, today: string): ItemErrorCode | null // "" ok; toDateOnly(date) "" → dateInvalid; > today → dateFuture
   export function validateItem(item: Pick<Item, "name" | "price" | "purchaseDate">, today: string): ItemErrors
   export const hasErrors = (e: ItemErrors) => Object.keys(e).length > 0;
   ```
   `dateError` uses `toDateOnly` from `@/features/import-export/csv/serialize` (UTC+7 rule already tested there). `today` is always a parameter; callers compute it with `toDateOnly(new Date().toISOString())` (same as `map.ts`).
2. **`dirty.ts`**: `EDITABLE_FIELDS` = the 14 form fields listed in the tests; `isDirty(a, b)` compares strings/numbers with `===` and arrays element-wise.
3. **`copy.ts`** (`EDITOR_COPY`): `save: "Lưu món đồ"`, `saving: "Đang lưu…"`, `errors: { nameRequired: "Vui lòng nhập tên món đồ", nameTooLong: (max) => \`Tên tối đa ${max} ký tự\`, priceNegative: "Giá không được âm", priceInvalid: "Giá không hợp lệ", dateInvalid: "Ngày mua không hợp lệ", dateFuture: "Ngày mua không được ở tương lai" }`, `discard: { title: "Bỏ thay đổi?", body: "Các thay đổi chưa lưu sẽ bị mất.", cancel: "Tiếp tục sửa", confirm: "Bỏ thay đổi" }`. Other existing editor strings stay where they are (F-004.4, if created, moves them).
4. **`Modal.tsx`**: module-level `const stack: symbol[] = []`; in the effect, push a per-instance id (from `useRef(Symbol())`) on mount, remove it on cleanup; the keydown handler calls `onClose` only when its id is the last in the stack. Keep `[onClose]` dependency semantics correct: register the stack entry in a mount-only effect and the listener in the `[onClose]` effect (so re-renders do not reorder the stack). Backdrop behaviour unchanged.
5. **`Confirm.tsx`**: optional props with today's strings/icon (`"trash"`) / `kind="danger-fill"` as defaults; delete usage in `App.tsx` stays untouched.
6. **`Field.tsx`**: `error?: string` → `{error && <small role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</small>}` after `children`.
7. **`Editor.tsx`**:
   - New prop `saving: boolean`.
   - `const [initial] = useState(item)` snapshot at mount (blank item for "new", the opened item for edits). Duplicate keeps the same mount, so a fresh duplicate counts as dirty (name differs) — correct, since it is unsaved.
   - `const [showErrors, setShowErrors] = useState(false)`; `today = toDateOnly(new Date().toISOString())`; `errors = validateItem(item, today)`; pass `error={showErrors ? msg(errors.name) : undefined}` to the name, price and date `Field`s (`msg` maps code → `EDITOR_COPY.errors`).
   - `handleSave`: `if (hasErrors(errors)) { setShowErrors(true); return; } onSave();`. No validation toast.
   - `const [discardOpen, setDiscardOpen] = useState(false)`; `requestClose = () => (isDirty(initial, item) ? setDiscardOpen(true) : onClose())`. Use `requestClose` for `<Modal onClose>`, the X button and "Huỷ". Render `<Confirm title… body… cancelLabel… confirmLabel… onCancel={() => setDiscardOpen(false)} onConfirm={onClose} />` when `discardOpen` (inside the Editor fragment, after `</Modal>`; it stacks on top thanks to step 4).
   - Save button: `disabled={saving}`, label `saving ? EDITOR_COPY.saving : EDITOR_COPY.save`.
   - Price input: `min={0}`, `inputMode="numeric"`, `aria-invalid` when an error is shown; date input: `max={today}`, `aria-invalid`.
8. **`App.tsx`**: `const savingRef = useRef(false)`; `save`: `if (!editor || savingRef.current) return; savingRef.current = true; setSaving(true); try {…} catch (e) { notify(wardrobe.message(e)); } finally { savingRef.current = false; setSaving(false); }`. Remove the `name.trim()` toast line. Pass `saving={saving}` to `<Editor>`. Nothing else in `App.tsx` changes.
9. **`map.ts`**: delete local `NAME_MAX`; `import { NAME_MAX, nameError } from "@/features/items/validate"`; replace the two-branch name check with `const ne = nameError(name); if (ne === "nameRequired") fail(…nameRequired); else if (ne === "nameTooLong") fail(…nameTooLong(NAME_MAX));`. CSV messages unchanged.
10. **Tests** (table above), then `vitest.config.ts` coverage entries, then all checks.

Rules: **R1** no data access added; save still goes through `useWardrobe`/`WardrobeRepo`; tests run in local mode. **R5** wear fields excluded from dirtiness, nothing derived stored. **R6** new Vietnamese copy only in `src/features/items/copy.ts`; code/ids English. **R7** only the files above. **R8** unit tests + coverage thresholds for both new modules. **R9** inline errors and the discard dialog reuse existing `field`/`Confirm` styles; Ming checks 390px + dark. **R10** `vite.config.ts`, `AGENTS.md`, `.figma/` untouched. R2/R3/R4 not affected.

Size estimate: ~350–400 changed lines (≈ half tests). One slice.

## Specialist input used
None (no consults).

## Assumptions
- **Validation messages are inline only, no toast.** The existing characterisation test "saving a new item without a name shows a validation toast" is updated to assert the inline message; this is the behaviour the ticket asks for ("inline messages"). Errors appear after the first save attempt and then update live. Reversible.
- **Validation lives in the Editor only**; `App.save` no longer checks the name. `Editor` is the only caller of `onSave`. The DB check and `itemToRow` remain the last line of defence.
- **Price 0 stays "unknown"** (`itemToRow` → `null`), per the ticket note; no change to `mappers.ts`.
- **Close paths are not disabled while saving.** If the user closes during a save, the save still finishes and the toast shows; the discard dialog unmounts with the editor on success.
- **Discard dialog after save success / delete:** those paths call `setEditor(null)` directly in `App`, so no guard prompt.
- **Duplicate counts as unsaved** (snapshot is the original item), so closing a fresh duplicate asks to discard it.
- **`dateError` imports `toDateOnly` from `import-export/csv/serialize`** (cross-feature import). Moving date helpers to `src/lib/` is a follow-up, not done here.
- **`map.ts` refactor shares only the name rule.** Its price parser only accepts digits (never negative), and its date rule also parses `dd/mm/yyyy` with CSV-specific messages; sharing those would change behaviour, so they stay.
- **Hotspots:** `src/App.tsx` and `src/features/items/Editor.tsx`. No other ticket is `IN_PROGRESS`/`REVIEW`/`DONE` (backlog 2026-11-09). F-202.1/F-202.2, F-1002, T-001, T-002 and a possible F-004.4 will touch `Editor.tsx`/`App.tsx` later and must rebase on this. `Modal.tsx`/`Confirm.tsx`/`Field.tsx` are shared components; their changes are additive with defaults.

## Blocking questions
None.

## Split proposal
None (≈ 350–400 lines including tests; one implement/review cycle).
