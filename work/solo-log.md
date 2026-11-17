# Solo log

| Date | Summary | Files | Checks |
|---|---|---|---|
| 2026-11-12 | Drive secrets as deployment-repo repository secrets, no GitHub environment (D28) | deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml, deploy/deployment-repo/README.md, scripts/deploy-envfile.test.ts, scripts/drive-connect.mjs, scripts/drive-connect.test.ts, work/ming-todo.md, work/decisions.md, work/solo-log.md | typecheck, format:check, test, build (see commit) |
| 2026-11-17 | One-terminal dev loop script (`scripts/start-dev.sh`: tunnel, dev token, runtime DB password, API, `pnpm dev`) + README line. Over the /solo limits (~95 lines, handles the production DB password at runtime); Ming chose /solo anyway, no separate review | scripts/start-dev.sh, README.md, work/solo-log.md | typecheck, format:check, test (1257 passed), build: green |
