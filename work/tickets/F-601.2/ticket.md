# F-601.2: CSV row mapping and validation

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data |
| Gate | none |
| Depends on | F-601.1, F-401 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-09T07:51:07Z |
| PR | — |

## Goal
Turn parsed rows into valid items, with a clear error per invalid row.

## Feature reference
`docs/feature-list.md` F-601 (split F-601.2). Decisions: `work/decisions.md`.

## Scope
- Header aliases in Vietnamese and English, matched through `normalize`: `Tên`/`name`, `Loại`/`category`,
  `Trạng thái`/`status`, `Màu`/`colors`, `Mùa`/`seasons`, `Hãng`/`brand`, `Size`/`size`,
  `Vị trí`/`location`, `Giá`/`price`, `Ngày mua`/`purchase_date`, `Chất liệu`/`material`, `Tag`/`tags`,
  `Ghi chú`/`notes`.
- Category, status, season and color accept a Vietnamese label or an id, case- and diacritic-insensitive.
  Multi-values are split on `;` or `|`.
- Validation reuses the F-201 rules: name required and ≤ 120 characters, price ≥ 0 (accept `890000`,
  `890.000`, `890,000`), date in ISO or `dd/mm/yyyy` and not in the future, unknown color/category/status
  is an error.
- `mapRows(parsed) → { valid: Item[], errors: { row, field, message }[], ignoredColumns: string[] }`.

## Out of scope
- UI and the import run (F-601.3).

## Acceptance criteria
- [ ] The UI template CSV maps to a valid item.
- [ ] The F-604 export maps back with no errors (round-trip test, after F-604 lands).
- [ ] Invalid rows are reported and never block valid rows.

## Technical notes
- Files: `src/features/import-export/csv/map.ts` (+ test).
- Notes from the code:
  - `itemToRow` passes unknown colors straight to the DB (`COLOR_TO_DB[c] ?? c`) and the DB has no
    constraint, so this ticket is the only guard.
  - `wear_count` / `last_worn` columns (from F-604) are ignored on import and listed in `ignoredColumns`
    (decision D7).
  - Locations: `ensureLocation` matches the name exactly, so "Tủ ngăn 1" and "tủ ngăn 1" become two
    locations. Proposed: map a CSV location to an existing location whose `normalize`d name matches
    (decision D8).
- Expected tier: Medium.

## Test plan
- Unit: aliases, every enum label and id, separators, each validation rule, price formats, date formats.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
