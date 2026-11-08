-- T-003 (renamed by T-004, shared project D17): close the two RLS gaps confirmed by F-006.
--   GAP-1: tudo_locations.parent_id could point at another user's location.
--   GAP-2: tudo_item_photos.storage_path was not checked against the caller's folder (path squatting;
--          storage_path is unique, so a squatted path would make the owner's upload fail).
-- Supersedes the WITH CHECK of 20261106000000_init.sql (locations policy, item_photos policy).
-- Only WITH CHECK changes. USING stays as is on purpose: a row that violates the new check stays
-- visible to its owner, so the owner can repair it.
-- The folder check is the same expression the storage bucket policies use.
--
-- Why a helper: an inline "exists (select ... from public.tudo_locations ...)" inside a locations policy
-- raises 42P17 (infinite recursion). tudo_private.tudo_owns_location is plpgsql (never inlined) and SECURITY
-- INVOKER (runs under the caller's own RLS, no extra privileges). search_path is empty and all names are
-- schema-qualified. Schema tudo_private is not exposed by PostgREST; only authenticated may use it.
-- It returns false for another user's location and for a nonexistent id (no existence oracle).
--
-- Precheck for an existing hosted project (read-only, both must return 0 rows):
--   select c.id from public.tudo_locations c join public.tudo_locations p on p.id = c.parent_id
--     where p.user_id <> c.user_id;
--   select id from public.tudo_item_photos
--     where (storage.foldername(storage_path))[1] is distinct from user_id::text;

create schema tudo_private;
revoke all on schema tudo_private from public;
grant usage on schema tudo_private to authenticated;

-- True when the caller owns the location. SECURITY INVOKER: runs under the caller's RLS.
-- plpgsql so it is never inlined into the policy (an inline self-reference raises 42P17).
create function tudo_private.tudo_owns_location(p_location_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.tudo_locations l
    where l.id = p_location_id
      and l.user_id = (select auth.uid())
  );
end;
$$;

revoke all on function tudo_private.tudo_owns_location(uuid) from public, anon;
grant execute on function tudo_private.tudo_owns_location(uuid) to authenticated;

alter policy "tudo_locations: owner full access" on public.tudo_locations
  with check (
    tudo_locations.user_id = (select auth.uid())
    and (tudo_locations.parent_id is null or tudo_private.tudo_owns_location(tudo_locations.parent_id))
  );

alter policy "tudo_item_photos: owner full access" on public.tudo_item_photos
  with check (
    tudo_item_photos.user_id = (select auth.uid())
    and (storage.foldername(tudo_item_photos.storage_path))[1] = (select auth.uid())::text
    and exists (select 1 from public.tudo_items i
                where i.id = tudo_item_photos.item_id and i.user_id = (select auth.uid()))
  );

-- Rollback (manual), in this order (the policy depends on the function):
--   alter policy "tudo_locations: owner full access" on public.tudo_locations
--     with check (user_id = (select auth.uid()));
--   alter policy "tudo_item_photos: owner full access" on public.tudo_item_photos
--     with check (
--       user_id = (select auth.uid())
--       and exists (select 1 from public.tudo_items i where i.id = item_id and i.user_id = (select auth.uid()))
--     );
--   drop function tudo_private.tudo_owns_location(uuid);
--   drop schema tudo_private;
