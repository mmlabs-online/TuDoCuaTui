#!/usr/bin/env bash
# T-007: image checks shared by ci.yml and release.yml.
# usage: check-image.sh <image-ref> [expected-supabase-url]
#   With expected-supabase-url the bundle must contain it (build with VITE_* build args);
#   without it the bundle must be in local mode (no Supabase URL baked in).
set -uo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: check-image.sh <image-ref> [expected-supabase-url]" >&2
  exit 2
fi
IMAGE="$1"
EXPECTED_URL="${2:-}"
ROOT=/usr/share/nginx/html

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
if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqF sb_secret_ $ROOT"; then
  echo "::error::sb_secret_ found in the served files"; exit 1
fi
maps=$(docker run --rm --entrypoint sh "$IMAGE" -c "find $ROOT -name '*.map'")
if [ -n "$maps" ]; then echo "::error::source maps in image: $maps"; exit 1; fi

echo "== bundle mode"
if [ -n "$EXPECTED_URL" ]; then
  if ! docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqF -- '$EXPECTED_URL' $ROOT/assets"; then
    echo "::error::expected Supabase URL not found in the bundle"; exit 1
  fi
else
  if docker run --rm --entrypoint sh "$IMAGE" -c "grep -rqF ci-dummy.invalid $ROOT/assets"; then
    echo "::error::the CI dummy Supabase URL is in an image built without build args (not local mode)"; exit 1
  fi
fi

echo "== smoke"
NAME="tudocuatui-smoke-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
# Same hardening as the deployment compose file.
docker run -d --name "$NAME" --cap-drop ALL --security-opt no-new-privileges "$IMAGE" >/dev/null

ok=0
for _ in $(seq 1 30); do
  if docker exec "$NAME" wget -q --spider http://127.0.0.1:3000/ 2>/dev/null; then ok=1; break; fi
  sleep 1
done
docker logs "$NAME"
if [ "$ok" -ne 1 ]; then echo "::error::smoke failed: health check did not pass"; exit 1; fi
if ! docker exec "$NAME" wget -q -O - http://127.0.0.1:3000/some/deep/path | grep -q 'id="root"'; then
  echo "::error::smoke failed: a deep path did not return index.html"; exit 1
fi
if docker exec "$NAME" wget -q -O /dev/null http://127.0.0.1:3000/assets/does-not-exist.js 2>/dev/null; then
  echo "::error::smoke failed: a missing asset did not return 404"; exit 1
fi
echo "image ok"
