# Solo log

| Date | Summary | Files | Checks |
|---|---|---|---|
| 2026-11-12 | Drive secrets as deployment-repo repository secrets, no GitHub environment (D28) | deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml, deploy/deployment-repo/README.md, scripts/deploy-envfile.test.ts, scripts/drive-connect.mjs, scripts/drive-connect.test.ts, work/ming-todo.md, work/decisions.md, work/solo-log.md | typecheck, format:check, test, build (see commit) |
| 2026-11-17 | One-terminal dev loop script (`scripts/start-dev.sh`: tunnel, dev token, runtime DB password, API, `pnpm dev`) + README line. Over the /solo limits (~95 lines, handles the production DB password at runtime); Ming chose /solo anyway, no separate review | scripts/start-dev.sh, README.md, work/solo-log.md | typecheck, format:check, test (1257 passed), build: green |
| 2026-11-17 | `scripts/start-dev.sh`: always get a fresh dev token first and stop unless it succeeds, then tunnel, DB password, API, UI (Ming) | scripts/start-dev.sh, README.md, work/solo-log.md | `bash -n`, format:check green; no code or test change |
| 2026-11-18 | Sign-in screen: "Hiện mật khẩu" checkbox under the password field toggles it between hidden and visible | src/features/auth/SignInScreen.tsx, src/features/auth/SignInScreen.test.tsx, src/features/auth/copy.ts, work/solo-log.md | typecheck, format:check, test (1659 passed), build: green (native WSL copy) |
| 2026-11-22 | Give ItemGrid without-IntersectionObserver test a 15s timeout (clear M-41, spaceM debt #71) | src/features/items/ItemGrid.test.tsx, work/solo-log.md | typecheck, format:check, test, build: green |
| 2026-11-23 | D55: F-706.4 no longer depends on F-707.4 for build and merge; D52 release rule kept (Ming, option 2) | work/decisions.md, work/tickets/F-706.4/ticket.md, work/backlog.md, work/solo-log.md | docs/board only, no checks needed |
