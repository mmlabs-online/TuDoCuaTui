# F-604: Real CSV export

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data |
| Gate | none |
| Depends on | F-005 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
The CSV export opens correctly in Excel and Google Sheets and can be re-imported.

## Feature reference
`docs/feature-list.md` F-604. Decisions: `work/decisions.md`.

## Scope
- `toCsv(items)`: every field (name, category, status, colors, seasons, brand, size, location, price,
  purchase_date, material, tags, notes) plus `wear_count` and `last_worn` (YYYY-MM-DD).
- RFC 4180 quoting: double any `"` and quote fields that contain `,`, `"` or a newline. Multi-values are
  joined with `|`. Keep the UTF-8 BOM (it already exists).
- Headers use the English ids that F-601.2 accepts.

## Out of scope
- JSON (F-602).

## Acceptance criteria
- [ ] A value with `"`, `,` and a newline survives an export → `parseCsv` round trip.
- [ ] The file opens in Excel with Vietnamese text intact.
- [ ] Re-import through F-601 works (checked when F-601.2 lands).

## Technical notes
- Files: `src/features/import-export/csv/serialize.ts` (+ test), the `download` helper.
- Today's export wraps values in `"` without escaping, and is missing seasons, material, tags, notes,
  purchase date and last worn. The BOM is already there.
- Local mode `lastWorn` is an ISO timestamp, while Supabase mode uses a date only: normalise both to YYYY-MM-DD.
- Expected tier: Medium.

## Test plan
- Unit: quoting edge cases; round trip with `parseCsv`.
- Manual: open in Excel (Windows) and Google Sheets.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
