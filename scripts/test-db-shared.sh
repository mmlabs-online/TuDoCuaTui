#!/usr/bin/env bash
# Local-only: run the DB tests as if stoktok's default-privilege revoke had run before TuDo's migrations.
# Never touches a hosted project. Run from the repo root: bash scripts/test-db-shared.sh
set -eu
cd "$(dirname "$0")/.."

SIM="supabase/migrations/20200101000000_sim_stoktok_default_privileges.sql"
trap 'rm -f "$SIM"' EXIT
trap 'exit 130' INT TERM

# Copied verbatim from stoktok 20261023000200_v1_rls_grants.sql lines 17-19.
cat > "$SIM" <<'SQL'
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
SQL

npx supabase db reset

n=$(docker exec supabase_db_tudocuatui psql -U postgres -d postgres -tAX -c "select count(*) from pg_default_acl d, aclexplode(d.defaclacl) a where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and a.grantee in ('anon'::regrole, 'authenticated'::regrole)")
if [ "$n" != "0" ]; then
  echo "simulation not active (default ACL rows for anon/authenticated: $n)" >&2
  exit 1
fi
echo "stoktok default privileges simulated: OK"

npx supabase test db

echo "Done. Run 'npx supabase db reset' to return to the default variant."
