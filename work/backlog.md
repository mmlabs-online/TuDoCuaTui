# Backlog

States: BACKLOG → PLANNING → IN_PROGRESS → REVIEW → DONE → MERGED · plus REWORK, BLOCKED, ESCALATED.
**Row order is run order** (`docs/plan-M1.md` §3). `/run` with no ID picks the first row that is runnable:
every `Depends on` ticket is `MERGED`, every `Needs Ming` item is ticked, and nobody holds a claim.
Gate `plan-approval` = the loop stops after PLAN until Ming approves (High tier).
This board is changed only on `main` (D16); each ticket's `ticket.md` is the source of truth for its state.

| ID | Title | State | Priority | Size | Areas | Depends on | Gate | Attempts | Updated |
|---|---|---|---|---|---|---|---|---|---|
| F-003 | Add CI pipeline | MERGED | P0 | S | architecture | — | none | 1 | 2026-11-07 |
| F-001 | Verify the Supabase backend end-to-end | MERGED | P0 | S | db | — | none | 2 | 2026-11-07 |
| F-101 | Polish the login screen | MERGED | P1 | S | ui, security | — | plan-approval | 1 | 2026-11-07 |
| F-005 | Set up Vitest and test the data layer | MERGED | P0 | M | data, architecture | F-003 | none | 1 | 2026-11-07 |
| F-005.2 | Test the Supabase repo and useWardrobe with a fake client | MERGED | P0 | M | data | F-005 | none | 2 | 2026-11-09 |
| F-002 | Generate DB types from the local schema | MERGED | P0 | S | db | F-001 | none | 1 | 2026-11-09 |
| F-006 | Add RLS and storage policy tests | MERGED | P1 | M | db, security | F-001 | none | 1 | 2026-11-07 |
| F-007 | Deploy to production with per-PR previews | MERGED | P0 | S | architecture, security | F-001 | plan-approval | 1 | 2026-11-09 |
| F-004.1 | Extract UI primitives and constants from `App.tsx` | MERGED | P0 | S | ui | F-005 | none | 1 | 2026-11-09 |
| F-401 | Make search diacritic-insensitive | MERGED | P0 | S | data | F-005 | none | 2 | 2026-11-09 |
| F-601.1 | CSV parser | MERGED | P0 | S | data | F-005 | none | 2 | 2026-11-09 |
| F-604 | Real CSV export | MERGED | P0 | S | data | F-005 | none | 1 | 2026-11-07 |
| F-004.2 | Extract the items feature from `App.tsx` | MERGED | P0 | M | ui | F-004.1 | none | 1 | 2026-11-09 |
| F-601.2 | CSV row mapping and validation | MERGED | P0 | M | data | F-601.1, F-401 | none | 1 | 2026-11-09 |
| T-003 | Close RLS gaps found by F-006 (only if confirmed) | MERGED | P1 | S | db, security | F-006 | plan-approval | 2 | 2026-11-08 |
| T-004 | Move TuDoCuaTui onto the shared stoktok Supabase project | MERGED | P0 | M | db, security | T-003 | plan-approval | 2 | 2026-11-08 |
| T-006 | Replace magic-link login with email + password | MERGED | P0 | S | ui, security | F-101 | plan-approval | 2 | 2026-11-09 |
| T-007 | Self-host via Cloudflare Tunnel with stoktok-style release/deploy CI/CD | MERGED | P0 | M | architecture, security | F-007 | plan-approval | 2 | 2026-11-10 |
| T-008 | Show the release version in the UI | MERGED | P1 | S | ui | T-007 | plan-approval | 1 | 2026-11-10 |
| T-005.1 | Connect Google Drive through a Supabase Edge Function | BLOCKED | P0 | M | architecture, security | T-004 | plan-approval | 0 | 2026-11-08 |
| T-005.2 | Upload and delete item photos via Google Drive | BACKLOG | P0 | M | data, db, security | T-005.1 | plan-approval | 0 | 2026-11-08 |
| T-005.3 | Display item photos from Google Drive | BACKLOG | P0 | M | data, security | T-005.2 | none | 0 | 2026-11-08 |
| T-005.4 | Remove Supabase Storage for photos | BACKLOG | P0 | S | db, security | T-005.3 | plan-approval | 0 | 2026-11-08 |
| F-004.3 | Extract modals and shrink `App.tsx` under 250 lines | MERGED | P0 | M | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-201 | Harden the item editor | MERGED | P0 | M | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-202.2 | Lazy-load grid images and refresh expired signed URLs | BACKLOG | P0 | S | data | F-004.2, T-005.3 | none | 0 | 2026-11-07 |
| F-202.1 | Accept phone photo formats with size check and progress | BACKLOG | P0 | M | ui, data | F-004.2, T-005.3 | none | 0 | 2026-11-07 |
| T-002 | Fix date-only wear math and align local wear rules | MERGED | P0 | S | data | F-005, F-004.2 | none | 1 | 2026-11-09 |
| F-1002 | Camera capture on photo inputs | MERGED | P0 | S | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-601.3 | CSV import preview and import run | MERGED | P0 | M | ui, data | F-601.2, F-004.3 | none | 1 | 2026-11-09 |
| F-602 | JSON backup and restore | BACKLOG | P0 | M | data, db | F-004.3 | none | 0 | 2026-11-07 |
| T-001 | Hide mock AI controls until M3 | BACKLOG | P0 | S | ui | F-004.3 | none | 0 | 2026-11-07 |
| F-603 | Bulk photo import | BACKLOG | P0 | M | ui, data | F-601.3, F-202.1 | none | 0 | 2026-11-07 |
