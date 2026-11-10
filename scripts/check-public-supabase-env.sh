#!/usr/bin/env bash
# T-007: release guard (R3). Only the public Supabase URL and anon/publishable key may be baked into the
# image. Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment. Never prints a value.
# Both empty: local mode, exit 0. Otherwise both must be set, the URL https://<host>, the key anon/publishable.
set -uo pipefail

url="${VITE_SUPABASE_URL:-}"
key="${VITE_SUPABASE_ANON_KEY:-}"

fail() { echo "::error::$1"; exit 1; }

if [ -z "$url" ] && [ -z "$key" ]; then
  echo "::warning::VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are empty: this release runs in local mode"
  exit 0
fi
if [ -z "$url" ] || [ -z "$key" ]; then
  fail "set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or neither"
fi
if ! [[ "$url" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  fail "VITE_SUPABASE_URL must look like https://<host> (no path, no spaces)"
fi

case "$key" in
  sb_secret_*) fail "VITE_SUPABASE_ANON_KEY is a secret key: use the anon/publishable key only" ;;
  sb_publishable_*) ;;
  sb_*) fail "VITE_SUPABASE_ANON_KEY is an sb_ key that is not sb_publishable_..." ;;
  *)
    if ! [[ "$key" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
      fail "VITE_SUPABASE_ANON_KEY is neither an sb_publishable_ key nor a JWT"
    fi
    payload="$(printf '%s' "$key" | cut -d. -f2 | tr '_-' '/+')"
    while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="$payload="; done
    if ! printf '%s' "$payload" | base64 -d 2>/dev/null | grep -Eq '"role"[[:space:]]*:[[:space:]]*"anon"'; then
      fail "VITE_SUPABASE_ANON_KEY is a JWT whose role is not anon"
    fi
    ;;
esac
echo "Supabase build args look public (https URL, anon/publishable key): this release runs in Supabase mode"
