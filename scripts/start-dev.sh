#!/usr/bin/env bash
# Dev only: start the full local dev loop in one terminal (D44/D45).
#   1. the Postgres tunnel container (production DB on 127.0.0.1:15432, D45)
#   2. a dev token, if the current one is missing or expired (scripts/dev-token.sh)
#   3. the Node API server in the background, with DATABASE_URL given at runtime only
#   4. `pnpm dev` in the foreground; Ctrl-C stops both
#
# Guardrails (D45): this script never runs server/migrate.js. The DB password is read with `read -s` and only
# exported to the server process; it is never written to a file or passed as an argument.
# DATABASE_URL must NOT be set in .env.local (Node's --env-file does not override an exported variable anyway).
#
# Env (all optional): TUDO_DB_USER / TUDO_DB_NAME (default tudocuatui), TUDO_DB_PORT (default 15432),
# TUDO_PG_TUNNEL (default pg-tunnel-pg-tunnel-1), TUDO_DEV_TOKEN_FILE (default ~/.config/tudocuatui/dev-token),
# TUDO_DEV_DRIVE_ENV (default ~/.config/tudocuatui/dev-drive.env, used when it exists).
set -eu
set -o pipefail

cd "$(dirname "$0")/.."

DB_USER="${TUDO_DB_USER:-tudocuatui}"
DB_NAME="${TUDO_DB_NAME:-tudocuatui}"
DB_PORT="${TUDO_DB_PORT:-15432}"
TUNNEL="${TUDO_PG_TUNNEL:-pg-tunnel-pg-tunnel-1}"
TOKEN_FILE="${TUDO_DEV_TOKEN_FILE:-$HOME/.config/tudocuatui/dev-token}"
DRIVE_ENV="${TUDO_DEV_DRIVE_ENV:-$HOME/.config/tudocuatui/dev-drive.env}"

fail() { echo "start-dev: $*" >&2; exit 1; }

[ -f .env.local ] || fail ".env.local not found (MM_IDENTITY_ISSUER, TUDO_OWNER_SUB, ...)."
if grep -q '^[[:space:]]*DATABASE_URL=' .env.local; then
  fail "remove DATABASE_URL from .env.local; this script asks for the password at runtime (D45)."
fi
command -v pnpm >/dev/null || fail "pnpm not found (run: mise install)."

# 1. Postgres tunnel
if [ "$(docker inspect -f '{{.State.Running}}' "$TUNNEL" 2>/dev/null || true)" != "true" ]; then
  echo "Starting $TUNNEL ..."
  docker start "$TUNNEL" >/dev/null || fail "cannot start $TUNNEL."
fi

# 2. Dev token: fetch a new one when missing or expiring within 2 minutes
token_ok() {
  [ -s "$TOKEN_FILE" ] || return 1
  TOKEN_FILE="$TOKEN_FILE" node -e '
    const t = require("fs").readFileSync(process.env.TOKEN_FILE, "utf8").trim();
    try {
      const p = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
      process.exit(typeof p.exp === "number" && p.exp * 1000 > Date.now() + 120000 ? 0 : 1);
    } catch { process.exit(1); }'
}
if ! token_ok; then
  echo "Dev token missing or expired: signing in to Identity."
  scripts/dev-token.sh
fi

# 3. Node API server on the production DB
IFS= read -rsp "Postgres password ($DB_USER@127.0.0.1:$DB_PORT/$DB_NAME): " pw </dev/tty
echo
[ -n "$pw" ] || fail "empty password."
# URL-encode the password so characters like @ : / # % do not break the URL.
pw_enc="$(printf '%s' "$pw" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write(encodeURIComponent(s)));')"
unset pw
export DATABASE_URL="postgres://$DB_USER:$pw_enc@127.0.0.1:$DB_PORT/$DB_NAME"
unset pw_enc

env_args="--env-file=.env.local"
[ -f "$DRIVE_ENV" ] && env_args="$env_args --env-file=$DRIVE_ENV"

server_pid=""
cleanup() {
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# shellcheck disable=SC2086
node $env_args server/index.js > >(sed -u 's/^/[api] /') 2>&1 &
server_pid=$!
unset DATABASE_URL

echo "Waiting for the API (/readyz) ..."
ready=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 2 http://127.0.0.1:3000/readyz 2>/dev/null; then ready=1; break; fi
  kill -0 "$server_pid" 2>/dev/null || fail "the API server exited; see the [api] lines above."
  sleep 1
done
[ -n "$ready" ] || fail "the API did not become ready in 30 s (database or tunnel?)."

# 4. UI
echo
echo "Open http://localhost:8443  (production data: every change is real, D45)."
echo "Token expired? In another terminal: scripts/dev-token.sh, then press \"Thử lại\"."
echo
pnpm dev
