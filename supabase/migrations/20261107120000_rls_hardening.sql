-- T-003: close the two RLS gaps confirmed by F-006.
--   GAP-1: locations.parent_id could point at another user's location.
--   GAP-2: item_photos.storage_path was not checked against the caller's folder (path squatting;
--          storage_path is unique, so a squatted path would make the owner's upload fail).
-- Supersedes the WITH CHECK of 20261106000000_init.sql (locations policy, item_photos policy).
-- Only WITH CHECK changes. USING stays as is on purpose: a row that violates the new check stays
-- visible to its owner, so the owner can repair it.
-- The folder check is the same expression the storage bucket policies use.
--
-- Why a helper: an inline "exists (select ... from public.locations ...)" inside a locations policy
-- raises 42P17 (infinite recursion). private.owns_location is plpgsql (never inlined) and SECURITY
-- INVOKER (runs under the caller's own RLS, no extra privileges). search_path is empty and all names are
-- schema-qualified. Schema private is not exposed by PostgREST; only authenticated may use it.
-- It returns false for another user's location and for a nonexistent id (no existence oracle).
--
-- Precheck for an existing hosted project (read-only, both must return 0 rows):
--   select c.id from public.locations c join public.locations p on p.id = c.parent_id
--     where p.user_id <> c.user_id;
--   select id from public.item_photos
--     where (storage.foldername(storage_path))[1] is distinct from user_id::text;

create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- True when the caller owns the location. SECURITY INVOKER: runs under the caller's RLS.
-- plpgsql so it is never inlined into the policy (an inline self-reference raises 42P17).
create function private.owns_location(p_location_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and l.user_id = (select auth.uid())
  );
end;
$$;

revoke all on function private.owns_location(uuid) from public, anon;
grant execute on function private.owns_location(uuid) to authenticated;

alter policy "locations: owner full access" on public.locations
  with check (
    locations.user_id = (select auth.uid())
    and (locations.parent_id is null or private.owns_location(locations.parent_id))
  );

alter policy "item_photos: owner full access" on public.item_photos
  with check (
    item_photos.user_id = (select auth.uid())
    and (storage.foldername(item_photos.storage_path))[1] = (select auth.uid())::text
    and exists (select 1 from public.items i
                where i.id = item_photos.item_id and i.user_id = (select auth.uid()))
  );

-- Rollback (manual), in this order (the policy depends on the function):
--   alter policy "locations: owner full access" on public.locations
--     with check (user_id = (select auth.uid()));
--   alter policy "item_photos: owner full access" on public.item_photos
--     with check (
--       user_id = (select auth.uid())
--       and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
--     );
--   drop function private.owns_location(uuid);
--   drop schema private;
