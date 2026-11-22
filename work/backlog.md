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
| T-011 | Register a `tudocuatui` database on the shared Postgres | MERGED | P0 | S | db, security | T-007 | plan-approval | 0 | 2026-11-10 |
| T-012 | Postgres schema and migration runner for the self-hosted database | MERGED | P0 | M | db, architecture | T-011 | plan-approval | 1 | 2026-11-10 |
| T-013 | Node API server serving the SPA and `/api` | MERGED | P0 | L | architecture, security, data | T-012 | plan-approval | 1 | 2026-11-11 |
| T-013.2 | `/api` endpoints for every WardrobeRepo operation | MERGED | P0 | M | architecture, security, data | T-013 | plan-approval | 1 | 2026-11-11 |
| T-014 | HTTP `WardrobeRepo` and no-login mode in the app | MERGED | P0 | M | ui, data | T-013.2 | none | 1 | 2026-11-11 |
| T-015 | Switch the image and deploy from nginx to the Node server | MERGED | P0 | M | architecture, security | T-013, T-011 | plan-approval | 0 | 2026-11-11 |
| T-016 | Remove Supabase from the app | MERGED | P1 | S | security, architecture | T-014, T-015 | plan-approval | 1 | 2026-11-13 |
| T-019 | Sign in with mmlabs Identity (api.mmlabs.online) — umbrella | MERGED | P1 | L | architecture, security, db | T-016; Ming M-22 | plan-approval | 0 | 2026-11-17 |
| T-019.11 | Auth screens UI: sign-in, sign-up, verify email (not wired) | MERGED | P1 | M | ui, security | T-016 | plan-approval | 1 | 2026-11-13 |
| T-019.1 | Ownership expand migration and owner backfill | MERGED | P1 | M | db, security | T-016 | plan-approval | 1 | 2026-11-14 |
| T-019.2 | Scope items, locations, wear logs and photos by user_id (contract migration) | MERGED | P1 | M | db, security, architecture | T-019.1 | plan-approval | 1 | 2026-11-14 |
| T-019.3 | Per-user AI settings | MERGED | P1 | S | db, security | T-019.2 | plan-approval | 1 | 2026-11-14 |
| T-019.4 | Row level security with per-request app.user_id | MERGED | P1 | M | db, security | T-019.2, T-019.3 | plan-approval | 2 | 2026-11-14 |
| T-019.5 | Identity JWT verifier and TUDO_AUTH_MODE switch | MERGED | P1 | M | security, architecture | T-019.2 | plan-approval | 1 | 2026-11-14 |
| T-019.6 | Photos under bearer auth (blob URLs) | MERGED | P1 | S | security, ui | T-019.5 | none | 3 | 2026-11-15 |
| T-019.7 | SPA sign-in and sign-out with the Identity token | MERGED | P1 | M | security, ui, architecture | T-019.5, T-019.6, T-019.11 | plan-approval | 2 | 2026-11-13 |
| T-019.8 | CSP and HSTS for the SPA | MERGED | P1 | S | security | T-019.7 | none | 0 | 2026-11-13 |
| T-019.13 | Abuse limits before Access removal | MERGED | P1 | S | security, architecture | T-019.5 | plan-approval | 0 | 2026-11-14 |
| T-019.14 | Per-user photo quotas (Ming's Drive for everyone) | MERGED | P1 | S | security, db | T-019.5 | plan-approval | 0 | 2026-11-15 |
| BUG-001 | Confirm button invisible in confirm dialogs | MERGED | P0 | XS | ui | — | none | 1 | 2026-11-16 |
| T-019.9 | Cutover cleanup: remove Cloudflare Access code | MERGED | P1 | S | security, architecture | T-019.4, T-019.7, T-019.8, T-019.13, T-019.14; Ming M-21 | plan-approval | 1 | 2026-11-16 |
| T-019.10 | Join flow UX | MERGED | P1 | S | security, ui | T-019.7, T-019.13 | plan-approval | 1 | 2026-11-13 |
| T-019.12 | Forgot password and /reset-password page | MERGED | P1 | S | ui, security | T-019.7 | plan-approval | 0 | 2026-11-14 |
| T-020 | Remove the Google Drive photo privacy notice | MERGED | P1 | XS | ui | T-019.10 | none | 0 | 2026-11-16 |
| T-021 | Per-user Google Drive folders for photos | MERGED | P2 | M | architecture, db, security | T-019.14 | plan-approval | 2 | 2026-11-16 |
| T-022 | Hotfix — CSP blocks photo upload (connect-src data:/blob:) | MERGED | P0 | XS | security | T-019.8 | none | 0 | 2026-11-16 |
| T-024 | Mobile layout and readability | MERGED | P1 | M | ui | — | none | 0 | 2026-11-16 |
| T-023 | Lower the password minimum to 6 characters | MERGED | P1 | S | ui, security | — | plan-approval | 1 | 2026-11-16 |
| T-025 | Remove Figma Make and the local/demo mode | MERGED | P1 | L | ui, data, architecture, security | — | plan-approval | 2 | 2026-11-17 |
| T-026 | Accept 12-hour Identity access tokens | MERGED | P1 | S | security, architecture | — | plan-approval | 1 | 2026-11-17 |
| T-009 | Store per-user AI provider settings and an encrypted API key | MERGED | P1 | M | db, security, architecture | T-004 | plan-approval | 2 | 2026-11-10 |
| T-018 | Store AI provider settings and an encrypted API key on the Node server (slice T-018.1) | MERGED | P1 | M | db, security, architecture | T-009, T-013.2, T-015 | plan-approval | 1 | 2026-11-13 |
| T-018.2 | AI key test endpoint and the AI_KEK deploy wiring | MERGED | P1 | M | security, architecture | T-018 | plan-approval | 1 | 2026-11-13 |
| T-010 | Settings screen: AI provider, API key and model | MERGED | P1 | S | ui, security | T-018.2 | none | 1 | 2026-11-13 |
| F-701 | Edge Function `tag-item-photo` using the user's AI settings | MERGED | P1 | M | architecture, security | T-018.2 | plan-approval | 1 | 2026-11-14 |
| F-701.1 | Gemini provider for AI photo tagging and the key test | MERGED | P2 | S | security, architecture | F-701 | plan-approval | 1 | 2026-11-17 |
| F-702 | "✨ Tự điền từ ảnh" in the editor (real AI) | MERGED | P1 | S | ui | F-701, T-010 | none | 1 | 2026-11-17 |
| T-005.1 | Connect the Node server to Google Drive | MERGED | P0 | M | architecture, security | T-013.2, T-015 | plan-approval | 1 | 2026-11-11 |
| T-005.5 | Drive connect script and deploy secrets for TuDo photos | MERGED | P0 | S | security | T-005.1 | plan-approval | 1 | 2026-11-11 |
| T-005.2 | Upload and delete item photos via Google Drive (API mode) | MERGED | P0 | M | data, db, security | T-005.1 | plan-approval | 1 | 2026-11-12 |
| T-005.3 | Display item photos from Google Drive | MERGED | P0 | M | data, security | T-005.2 | none | 2 | 2026-11-12 |
| T-005.6 | Orphan sweep for Drive photos | MERGED | P1 | S | data, security | T-005.2 | none | 2 | 2026-11-12 |
| T-017 | Replace the item category list | MERGED | P0 | M | ui, data, db | — | plan-approval | 1 | 2026-11-12 |
| T-005.4 | Remove Supabase Storage for photos | SUPERSEDED | P0 | S | db, security | T-005.3 | plan-approval | 0 | 2026-11-10 |
| F-004.3 | Extract modals and shrink `App.tsx` under 250 lines | MERGED | P0 | M | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-201 | Harden the item editor | MERGED | P0 | M | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-202.2 | Lazy-load grid images and refresh expired signed URLs | SUPERSEDED | P0 | S | data | F-004.2, T-005.3 | none | 0 | 2026-11-12 |
| F-202.1 | Accept phone photo formats with size check and progress | MERGED | P0 | M | ui, data | F-004.2, T-005.2 | none | 2 | 2026-11-17 |
| T-002 | Fix date-only wear math and align local wear rules | MERGED | P0 | S | data | F-005, F-004.2 | none | 1 | 2026-11-09 |
| F-1002 | Camera capture on photo inputs | MERGED | P0 | S | ui | F-004.2 | none | 1 | 2026-11-09 |
| F-601.3 | CSV import preview and import run | MERGED | P0 | M | ui, data | F-601.2, F-004.3 | none | 1 | 2026-11-09 |
| F-602 | JSON backup and restore (slice F-602.1: server) | MERGED | P0 | M | data, db, architecture, security | F-004.3 | plan-approval | 2 | 2026-11-17 |
| F-602.2 | JSON backup and restore in the app (client) | MERGED | P0 | M | ui, data | F-602 | none | 1 | 2026-11-17 |
| T-001 | Hide mock AI controls until M3 | MERGED | P0 | S | ui | F-004.3 | none | 1 | 2026-11-10 |
| F-603 | Bulk photo import | MERGED | P0 | M | ui, data | F-601.3, F-202.1 | none | 2 | 2026-11-17 |
| F-603.2 | Resize photos off the main thread for bulk import | MERGED | P0 | S | data, security | F-603 | none | 1 | 2026-11-17 |
| F-703 | Tag photos with AI during bulk import | MERGED | P1 | S | ui, data | F-701, F-603, F-603.2 | none | 1 | 2026-11-18 |
| T-027.1 | Make the bulk photo import runner stop and retry sensibly | MERGED | P1 | S | ui, data | F-703 | none | 1 | 2026-11-18 |
| T-027.2 | Harden the photo worker | MERGED | P2 | S | data, security | F-603.2 | none | 1 | 2026-11-18 |
| T-027.3 | Polish the bulk photo import UI | MERGED | P2 | S | ui | T-027.1 | none | 1 | 2026-11-18 |
| F-704.1 | "Hôm nay mặc gì?" — rule-based outfit suggestions | MERGED | P2 | M | ui, data | — | none | 1 | 2026-11-18 |
| F-704.2 | Use today's weather in outfit suggestions | MERGED | P2 | M | data, security, architecture | F-704.1 | plan-approval | 1 | 2026-11-18 |
| F-704.3 | AI-ranked outfit suggestions | MERGED | P2 | M | data, security, architecture | F-704.1 | plan-approval | 1 | 2026-11-18 |
| F-704.4 | "✨ Gợi ý bằng AI" toggle in "Hôm nay mặc gì?" | MERGED | P2 | M | ui, data | F-704.3 | none | 1 | 2026-11-18 |
| F-704.5 | "✨ Gợi ý bằng AI" toggle in the outfits modal | MERGED | P2 | M | ui | F-704.4 | none | 2 | 2026-11-18 |
| T-028.1 | Harden the Identity token verifier (JWKS outage → 503, refuse key-carrying headers) | MERGED | P1 | S | security, architecture | — | plan-approval | 2 | 2026-11-19 |
| T-028.2 | Share the sign-in session across tabs and renew tokens before they expire | MERGED | P1 | M | security, architecture | T-028.1 | plan-approval | 2 | 2026-11-19 |
| T-028.3 | "Continue as {email}" on the sign-in page and a verify-email screen | MERGED | P1 | M | ui, security | T-028.2 | plan-approval | 2 | 2026-11-19 |
| T-028.4 | GET /api/auth/me | MERGED | P2 | S | security | T-028.1 | plan-approval | 1 | 2026-11-19 |
| BUG-002 | Item grid renders every item at once instead of 12 at a time | MERGED | P1 | S | ui | — | none | 1 | 2026-11-17 |
| BUG-003 | Hero banner photos are cut off on mobile | MERGED | P2 | XS | ui | — | none | 2 | 2026-11-17 |
| BUG-004 | Search box overflows and scrolls sideways on mobile | MERGED | P1 | XS | ui | — | none | 1 | 2026-11-17 |
| BUG-005 | AI settings button uses a sun-like icon instead of an "AI" icon | MERGED | P1 | XS | ui | — | none | 1 | 2026-11-17 |
| BUG-006 | App UI tests time out intermittently on CI | MERGED | P1 | XS | architecture | — | none | 1 | 2026-11-18 |
| BUG-007 | Signing out in one tab wipes another tab's saved account | MERGED | P2 | XS | security | — | plan-approval | 1 | 2026-11-19 |
| BUG-010 | Chrome autofills the saved account password into the AI "API key" field | MERGED | P0 | XS | ui, security | — | none | 1 | 2026-11-21 |
| BUG-008 | Stale "Tiếp tục với" list after a retry, and no re-list after a join-lookup sign-out | BLOCKED | P2 | XS | ui, security | — | plan-approval | 0 | 2026-11-19 |
| BUG-009 | Editor test "a result for a replaced photo is ignored" fails intermittently | MERGED | P2 | XS | architecture | — | none | 2 | 2026-11-19 |
| T-029 | Finish cross-tab sign-out (broadcast on lost sessions, fallback, retry sign-out) | BACKLOG | P2 | M | security, architecture | BUG-007 | plan-approval | 0 | 2026-11-19 |
| T-030 | Decide whether a 403 from the API signs the user out | BACKLOG | P2 | XS | security | — | none | 0 | 2026-11-19 |
| T-031 | Auth and server tidy-ups from T-028 | BACKLOG | P3 | S | security | BUG-008 | plan-approval | 0 | 2026-11-19 |
| T-032 | AI outfits tidy-ups from F-704 | BACKLOG | P3 | S | ui | — | none | 0 | 2026-11-19 |
| BUG-011 | Never-worn items show "hơn 1 năm" and a new item counts as "≥ 90 ngày chưa mặc" | MERGED | P1 | S | ui, data | — | none | 1 | 2026-11-21 |
| BUG-012 | Outfit suggestion says "Mùa Đông" in hot weather | MERGED | P1 | XS | ui, data | — | none | 2 | 2026-11-22 |
| BUG-013 | Cold weather suggests an off-shoulder party dress and heels with no warning | MERGED | P2 | S | ui, data | BUG-012 | none | 1 | 2026-11-20 |
| BUG-014 | "−1" wear button is enabled at 0 wears and still sends a request | BACKLOG | P2 | XS | ui | — | none | 0 | 2026-11-20 |
| BUG-015 | Last-worn label says "0 ngày trước" in the editor but "hôm nay" on the card | BACKLOG | P2 | XS | ui | — | none | 0 | 2026-11-20 |
| BUG-016 | Modals have no dialog semantics or focus handling | BACKLOG | P2 | S | ui, ux | — | none | 0 | 2026-11-20 |
| BUG-017 | Full-size photos used for small grid thumbnails; rendering slows down | BACKLOG | P2 | M | ui, data, architecture | — | none | 0 | 2026-11-20 |
| F-705 | Sticker spike on 10 hard items | BACKLOG | P1 | M | architecture, security | — | none | 0 | 2026-11-22 |
| F-706.1 | Credit ledger with reserve, commit and refund | MERGED | P1 | M | db, security, architecture | — | plan-approval | 2 | 2026-11-22 |
| F-706.2 | App-wide monthly spend meter and model price table | MERGED | P1 | M | db, security, architecture | — | plan-approval | 1 | 2026-11-22 |
| F-706.3 | Owner-only shared AI key storage, replacement and test | PLANNING | P1 | M | db, security, architecture | — | plan-approval | 0 | 2026-11-22 |
| F-706.5 | Owner-only admin API for grants, credits, approvals and spend | BACKLOG | P1 | M | security, architecture, db | F-706.1 | plan-approval | 0 | 2026-11-22 |
| F-706.6 | Owner admin screen for the shared key, grants and approvals | BACKLOG | P1 | M | ui, ux, security | F-706.3, F-706.5 | plan-approval | 0 | 2026-11-22 |
| F-707.1 | Occasion enum and rule prefilter in the outfit pool | BACKLOG | P1 | S | data | BUG-012, BUG-013 | none | 0 | 2026-11-22 |
| F-707.2 | Suggest route accepts the occasion and enforces 20 candidates | BACKLOG | P1 | S | security, data | F-707.1 | plan-approval | 0 | 2026-11-22 |
| F-707.3 | Same-day suggestion cache in Postgres | BACKLOG | P1 | M | db, security, data | F-707.2 | plan-approval | 0 | 2026-11-22 |
| F-707.4 | Occasion picker; AI runs only on an explicit tap | BACKLOG | P1 | M | ui, ux, data | F-707.3 | none | 0 | 2026-11-22 |
| F-706.4 | Cut AI over to the shared key, credits and spend cap | BACKLOG | P1 | M | security, architecture, data | F-706.1, F-706.2, F-706.3, F-707.4 | plan-approval | 0 | 2026-11-22 |
| F-706.7 | User credit UI and retire the BYOK form | BACKLOG | P1 | M | ui, ux, data | F-706.1, F-706.2, F-706.3 | none | 0 | 2026-11-22 |
| F-708.1 | Sticker table and Drive storage | BACKLOG | P1 | M | db, security, architecture | F-705, F-706.4 | plan-approval | 0 | 2026-11-22 |
| F-708.2 | Image provider adapter with input and output downscaling | BACKLOG | P1 | M | security, architecture | F-705, F-706.4 | plan-approval | 0 | 2026-11-22 |
| F-708.3 | Sticker generate route with cache, credits and idempotency | BACKLOG | P1 | M | security, architecture, data | F-708.1, F-708.2 | plan-approval | 0 | 2026-11-22 |
| F-708.4 | Serve stickers and clean them up with their item or photo | BACKLOG | P1 | M | security, architecture | F-708.3 | plan-approval | 0 | 2026-11-22 |
| F-709.1 | Avatar presets: hair, skin and body picker | BACKLOG | P1 | M | ui, ux | F-705 | none | 0 | 2026-11-22 |
| F-709.2 | Sticker compositor with fixed layer order | BACKLOG | P1 | S | ui | F-705 | none | 0 | 2026-11-22 |
| F-709.3 | "Xem trên chibi" from a suggested outfit | BACKLOG | P1 | M | ui, ux, data | F-708.4, F-709.1, F-709.2 | none | 0 | 2026-11-22 |
| F-706.8 | Delete legacy BYOK ciphertext | BACKLOG | P1 | S | db, security | F-706.4, F-706.7 | plan-approval | 0 | 2026-11-22 |
| F-708.5 | Server batch job to prepare the whole wardrobe | BACKLOG | P2 | M | security, architecture, data | F-708.3 | plan-approval | 0 | 2026-11-22 |
| F-708.6 | Batch UI: cost preview, confirmation and progress | BACKLOG | P2 | S | ui, ux, data | F-708.5 | none | 0 | 2026-11-22 |
| F-710 | Real-photo outfit collage (fallback) | BACKLOG | P2 | M | ui, ux, data | F-705 | none | 0 | 2026-11-22 |
