#!/usr/bin/env bash
# T-007: tests for check-public-supabase-env.sh. Run from anywhere: bash scripts/check-public-supabase-env.test.sh
# JWTs are built here at runtime from fake payloads; no real key is stored.
set -uo pipefail
script="$(cd "$(dirname "$0")" && pwd)/check-public-supabase-env.sh"
fails=0
total=0

b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
jwt() { printf '%s.%s.%s' "$(printf '{"alg":"HS256"}' | b64url)" "$(printf '%s' "$1" | b64url)" "c2ln"; }

# expect <name> <expected exit> <url> <key> [<text that must not appear in output>...]
expect() {
  local name="$1" want="$2" url="$3" key="$4"
  shift 4
  total=$((total + 1))
  local out code
  out="$(VITE_SUPABASE_URL="$url" VITE_SUPABASE_ANON_KEY="$key" bash "$script" 2>&1)"
  code=$?
  if [ "$code" -ne "$want" ]; then
    echo "FAIL $name: exit $code, expected $want"; fails=$((fails + 1)); return
  fi
  local s
  for s in "$@"; do
    if [ -n "$s" ] && [[ "$out" == *"$s"* ]]; then
      echo "FAIL $name: output contains a value passed in"; fails=$((fails + 1)); return
    fi
  done
  echo "ok   $name"
}

url=https://abc.supabase.co
anon="$(jwt '{"role":"anon"}')"
anon_sp="$(jwt '{ "role" : "anon", "iss":"x" }')"
svc="$(jwt '{"role":"service_role"}')"

total=$((total + 1))
out="$(VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= bash "$script" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && [[ "$out" == *"local mode"* ]]; then echo "ok   both empty -> local mode"; else echo "FAIL both empty"; fails=$((fails + 1)); fi
total=$((total + 1))
out="$(env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY bash "$script" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && [[ "$out" == *"local mode"* ]]; then echo "ok   both unset -> local mode"; else echo "FAIL both unset"; fails=$((fails + 1)); fi

expect "only url" 1 "$url" ""
expect "only key" 1 "" "sb_publishable_abc123"
expect "http url" 1 "http://abc.supabase.co" "sb_publishable_abc123"
expect "url with path" 1 "https://abc.supabase.co/rest/v1" "sb_publishable_abc123"
expect "url with space" 1 "https://abc .supabase.co" "sb_publishable_abc123"
expect "https url + publishable" 0 "$url" "sb_publishable_abc123" "sb_publishable_abc123" "$url"
expect "sb_secret" 1 "$url" "sb_secret_abc123" "sb_secret_abc123"
expect "sb_other" 1 "$url" "sb_other_abc123" "sb_other_abc123"
expect "jwt anon" 0 "$url" "$anon" "$anon"
expect "jwt anon with spaces in json" 0 "$url" "$anon_sp" "$anon_sp"
expect "jwt service_role" 1 "$url" "$svc" "$svc"
expect "malformed: abc" 1 "$url" "abc" "abc"
expect "malformed: two segments" 1 "$url" "aaa.bbb" "aaa.bbb"
expect "malformed: non-base64 payload" 1 "$url" "aaa.!!!.ccc" "!!!"

echo "$((total - fails))/$total passed"
[ "$fails" -eq 0 ]
