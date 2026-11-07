# Backlog

States: BACKLOG → PLANNING → IN_PROGRESS → REVIEW → DONE → MERGED · plus REWORK, BLOCKED, ESCALATED.
**Row order is run order** (`docs/plan-M1.md` §3). `/run` with no ID picks the first row that is runnable:
every `Depends on` ticket is `MERGED`, every `Needs Ming` item is ticked, and nobody holds a claim.
Gate `plan-approval` = the loop stops after PLAN until Ming approves (High tier).

| ID | Title | State | Priority | Size | Areas | Depends on | Gate | Attempts | Updated |
|---|---|---|---|---|---|---|---|---|---|
| F-003 | Add CI pipeline | IN_PROGRESS | P0 | S | architecture | — | none | 0 | 2026-11-07 |
| F-001 | Verify the Supabase backend end-to-end | BACKLOG | P0 | S | db | — | none | 0 | 2026-11-07 |
| F-101 | Polish the login screen | BACKLOG | P1 | S | ui, security | — | plan-approval | 0 | 2026-11-07 |
| F-005 | Set up Vitest and test the data layer | BACKLOG | P0 | M | data, architecture | F-003 | none | 0 | 2026-11-07 |
| F-002 | Generate DB types from the local schema | BACKLOG | P0 | S | db | F-001 | none | 0 | 2026-11-07 |
| F-006 | Add RLS and storage policy tests | BACKLOG | P1 | M | db, security | F-001 | none | 0 | 2026-11-07 |
| F-007 | Deploy to production with per-PR previews | BACKLOG | P0 | S | architecture, security | F-001 | plan-approval | 0 | 2026-11-07 |
| F-004.1 | Extract UI primitives and constants from `App.tsx` | BACKLOG | P0 | S | ui | F-005 | none | 0 | 2026-11-07 |
| F-401 | Make search diacritic-insensitive | BACKLOG | P0 | S | data | F-005 | none | 0 | 2026-11-07 |
| F-601.1 | CSV parser | BACKLOG | P0 | S | data | F-005 | none | 0 | 2026-11-07 |
| F-604 | Real CSV export | BACKLOG | P0 | S | data | F-005 | none | 0 | 2026-11-07 |
| F-004.2 | Extract the items feature from `App.tsx` | BACKLOG | P0 | M | ui | F-004.1 | none | 0 | 2026-11-07 |
| F-601.2 | CSV row mapping and validation | BACKLOG | P0 | M | data | F-601.1, F-401 | none | 0 | 2026-11-07 |
| T-003 | Close RLS gaps found by F-006 (only if confirmed) | BACKLOG | P1 | S | db, security | F-006 | plan-approval | 0 | 2026-11-07 |
| F-004.3 | Extract modals and shrink `App.tsx` under 250 lines | BACKLOG | P0 | M | ui | F-004.2 | none | 0 | 2026-11-07 |
| F-201 | Harden the item editor | BACKLOG | P0 | M | ui | F-004.2 | none | 0 | 2026-11-07 |
| F-202.2 | Lazy-load grid images and refresh expired signed URLs | BACKLOG | P0 | S | data | F-004.2 | none | 0 | 2026-11-07 |
| F-202.1 | Accept phone photo formats with size check and progress | BACKLOG | P0 | M | ui, data | F-004.2 | none | 0 | 2026-11-07 |
| T-002 | Fix date-only wear math and align local wear rules | BACKLOG | P0 | S | data | F-005, F-004.2 | none | 0 | 2026-11-07 |
| F-1002 | Camera capture on photo inputs | BACKLOG | P0 | S | ui | F-004.2 | none | 0 | 2026-11-07 |
| F-601.3 | CSV import preview and import run | BACKLOG | P0 | M | ui, data | F-601.2, F-004.3 | none | 0 | 2026-11-07 |
| F-602 | JSON backup and restore | BACKLOG | P0 | M | data, db | F-004.3 | none | 0 | 2026-11-07 |
| T-001 | Hide mock AI controls until M3 | BACKLOG | P0 | S | ui | F-004.3 | none | 0 | 2026-11-07 |
| F-603 | Bulk photo import | BACKLOG | P0 | M | ui, data | F-601.3, F-202.1 | none | 0 | 2026-11-07 |
