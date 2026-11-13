#!/usr/bin/env bash
# T-007/T-015: image checks shared by ci.yml and release.yml (Node server image, D26).
# usage: check-image.sh <image-ref>
#   EXPECTED_VERSION (env, default "dev") is the release tag the image must show (vX.Y.Z or dev).
#   CHECK_IMAGE_DATABASE_URL (env, CI only; release.yml never sets it): a throwaway Postgres URL reachable from
#   the host network. Enables the "db smoke" section (migrate + /readyz from inside the image).
set -uo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: check-image.sh <image-ref>" >&2
  exit 2
fi
IMAGE="$1"
ROOT=/app/dist
EXPECTED_VERSION="${EXPECTED_VERSION:-dev}"
if ! [[ "$EXPECTED_VERSION" =~ ^(dev|v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "::error::EXPECTED_VERSION must be dev or vX.Y.Z" >&2; exit 2
fi
NAME="tudocuatui-smoke-$$"
DBNAME="tudocuatui-dbsmoke-$$"
trap 'docker rm -f "$NAME" "$DBNAME" >/dev/null 2>&1' EXIT
# Dummy Access values: not secret, only so the server starts. The JWKS is never fetched (no header = 401).
ACCESS=(-e CF_ACCESS_TEAM_DOMAIN=ci-dummy.cloudflareaccess.com -e CF_ACCESS_AUD=ci-dummy)

echo "== no secrets in image"
if docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | cut -d= -f1 | grep -Ei 'KEY|SECRET|TOKEN|PASSWORD'; then
  echo "::error::secret-like env name in image"; exit 1
fi
if docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -q 'VITE_'; then
  echo "::error::VITE_ variable in image config"; exit 1
fi
if docker history --no-trunc "$IMAGE" | grep -q 'VITE_'; then
  echo "::error::VITE_ in image history"; exit 1
fi
user="$(docker image inspect "$IMAGE" --format '{{.Config.User}}')"
case "$user" in ""|0|root|0:*|root:*) echo "::error::image runs as root (user '$user')"; exit 1 ;; esac
found=$(docker run --rm --user 0 --entrypoint sh "$IMAGE" -c "find / -xdev -name '.env*' -not -path '/proc/*' 2>/dev/null; true")
if [ -n "$found" ]; then echo "::error::.env files in image: $found"; exit 1; fi
if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqE 'sb_secret_[A-Za-z0-9_-]{8,}' $ROOT"; then
  echo "::error::a secret key value (sb_secret_...) found in the served files"; exit 1
fi
if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqE 'GOCSPX-[A-Za-z0-9_-]{10,}|1//0[A-Za-z0-9_-]{20,}' /app/server /app/dist /app/package.json"; then
  echo "::error::a Google client secret or refresh token value found in the image"; exit 1
fi
maps=$(docker run --rm --entrypoint sh "$IMAGE" -c "find $ROOT -name '*.map'")
if [ -n "$maps" ]; then echo "::error::source maps in image: $maps"; exit 1; fi

echo "== image config"
cmd=$(docker image inspect "$IMAGE" --format '{{json .Config.Cmd}}')
if [ "$cmd" != '["node","server/index.js"]' ]; then
  echo "::error::image Cmd is $cmd, expected [\"node\",\"server/index.js\"]"; exit 1
fi
envs=$(docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(NODE_ENV|DATABASE_URL|CF_ACCESS_|TUDO_|GOOGLE_|DRIVE_|AI_)' || true)
if [ "$envs" != "NODE_ENV=production" ]; then
  echo "::error::image env must set exactly NODE_ENV=production among app variables, got: $envs"; exit 1
fi
if ! docker image inspect "$IMAGE" --format '{{json .Config.ExposedPorts}}' | grep -q '"3000/tcp"'; then
  echo "::error::image does not expose 3000/tcp"; exit 1
fi

echo "== layout"
if ! docker run --rm --entrypoint sh "$IMAGE" -c '
  set -e
  grep -q "\"type\": *\"module\"" /app/package.json
  ls /app/db/migrations/*.sql >/dev/null
  test -d /app/node_modules/pg && test -d /app/node_modules/jose
  test -f /app/dist/index.html
  test ! -e /app/node_modules/vite && test ! -e /app/src && test ! -e /app/server/test
  test -z "$(find /app/server -name "*.test.*")"
'; then
  echo "::error::image layout is wrong (see docs: package.json type=module, migrations, pg/jose, dist; no vite, src, tests)"; exit 1
fi

echo "== bundle"
if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqi supabase $ROOT/assets"; then
  echo "::error::Supabase code in the bundle (removed in T-016)"; exit 1
fi

echo "== version"
got=$(docker run --rm --entrypoint sh "$IMAGE" -c "cat $ROOT/version.txt")
if [ "$got" != "$EXPECTED_VERSION" ]; then
  echo "::error::version.txt is '$got', expected '$EXPECTED_VERSION'"; exit 1
fi
if [ "$EXPECTED_VERSION" != dev ]; then
  if ! docker run --rm --entrypoint sh "$IMAGE" -c 'grep -rqF -- "$1" "$2"' _ "$EXPECTED_VERSION" "$ROOT/assets"; then
    echo "::error::$EXPECTED_VERSION not found in the bundle"; exit 1
  fi
fi

echo "== start checks"
# No network and a 30 s cap: each of these must exit 2 straight away.
expect_exit() { # <expected> <description> <docker run args...>
  local want="$1" what="$2"; shift 2
  timeout 30 docker run --rm --network none "$@" >/dev/null 2>&1
  local got=$?
  if [ "$got" -ne "$want" ]; then echo "::error::$what: exit $got, expected $want"; exit 1; fi
}
expect_exit 2 "server without Access values" "$IMAGE"
expect_exit 2 "server with TUDO_ACCESS_DISABLED=1 (must be refused in production)" -e TUDO_ACCESS_DISABLED=1 "$IMAGE"
expect_exit 2 "migrate without DATABASE_URL" "$IMAGE" node server/migrate.js
expect_exit 2 "drive smoke without Google env" "$IMAGE" node server/drive-smoke.js
expect_exit 2 "server with partial Google config" "${ACCESS[@]}" -e GOOGLE_CLIENT_ID=ci-dummy.apps.googleusercontent.com "$IMAGE"
expect_exit 2 "server with malformed AI_KEK" "${ACCESS[@]}" -e AI_KEK=not-a-kek "$IMAGE"

# probe <path>: prints the HTTP status, then the body, fetched from inside the container.
probe() {
  docker exec "$1" node -e 'fetch("http://127.0.0.1:3000"+process.argv[1]).then(async r=>{console.log(r.status);process.stdout.write(await r.text())},()=>{console.log("000")})' "$2" 2>/dev/null
}
status() { probe "$1" "$2" | head -n 1; }

echo "== smoke"
# Same hardening as the deployment compose file; no DB here, so /readyz must be 503.
docker run -d --name "$NAME" --cap-drop ALL --security-opt no-new-privileges --network none \
  "${ACCESS[@]}" "$IMAGE" >/dev/null

ok=0
for _ in $(seq 1 30); do
  if [ "$(status "$NAME" /healthz)" = 200 ]; then ok=1; break; fi
  sleep 1
done
docker logs "$NAME"
if [ "$ok" -ne 1 ]; then echo "::error::smoke failed: /healthz did not return 200"; exit 1; fi
got=$(status "$NAME" /readyz)
if [ "$got" != 503 ]; then echo "::error::smoke failed: /readyz without a database is $got, expected 503"; exit 1; fi
if ! probe "$NAME" /some/deep/path | grep -q 'id="root"'; then
  echo "::error::smoke failed: a deep path did not return index.html"; exit 1
fi
got=$(status "$NAME" /assets/does-not-exist.js)
if [ "$got" != 404 ]; then echo "::error::smoke failed: a missing asset is $got, expected 404"; exit 1; fi
served=$(probe "$NAME" /version.txt | tail -n +2 | tr -d '\n')
if [ "$served" != "$EXPECTED_VERSION" ]; then
  echo "::error::smoke failed: served /version.txt is '$served', expected '$EXPECTED_VERSION'"; exit 1
fi
got=$(status "$NAME" /api/items)
if [ "$got" != 401 ]; then echo "::error::smoke failed: /api/items without Access header is $got, expected 401"; exit 1; fi
health=starting
for _ in $(seq 1 30); do
  health=$(docker inspect -f '{{.State.Health.Status}}' "$NAME")
  [ "$health" = healthy ] && break
  sleep 1
done
if [ "$health" != healthy ]; then echo "::error::image HEALTHCHECK is '$health', expected healthy"; exit 1; fi

if [ -n "${CHECK_IMAGE_DATABASE_URL:-}" ]; then
  echo "== db smoke"
  # The URL is never printed.
  if ! docker run --rm --network host -e DATABASE_URL="$CHECK_IMAGE_DATABASE_URL" "$IMAGE" node server/migrate.js; then
    echo "::error::db smoke: migrate failed inside the image"; exit 1
  fi
  again=$(docker run --rm --network host -e DATABASE_URL="$CHECK_IMAGE_DATABASE_URL" "$IMAGE" node server/migrate.js 2>&1)
  if ! printf '%s' "$again" | grep -q 'up to date'; then
    echo "::error::db smoke: second migrate run did not report 'up to date'"; exit 1
  fi
  docker run -d --name "$DBNAME" --network host -e DATABASE_URL="$CHECK_IMAGE_DATABASE_URL" \
    -e PORT=3000 "${ACCESS[@]}" "$IMAGE" >/dev/null
  ok=0
  for _ in $(seq 1 30); do
    if [ "$(status "$DBNAME" /readyz)" = 200 ]; then ok=1; break; fi
    sleep 1
  done
  docker logs "$DBNAME" 2>&1 | grep -v DATABASE_URL
  if [ "$ok" -ne 1 ]; then echo "::error::db smoke: /readyz did not return 200"; exit 1; fi
  got=$(status "$DBNAME" /api/locations)
  if [ "$got" != 401 ]; then echo "::error::db smoke: /api/locations without Access header is $got, expected 401"; exit 1; fi
fi
echo "image ok"
