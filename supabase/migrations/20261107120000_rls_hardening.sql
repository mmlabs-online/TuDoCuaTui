-- T-003: close the two RLS gaps confirmed by F-006.
--   GAP-1: locations.parent_id could point at another user's location.
--   GAP-2: item_photos.storage_path was not checked against the caller's folder (path squatting;
--          storage_path is unique, so a squatted path would make the owner's upload fail).
-- Supersedes the WITH CHECK of 20261106000000_init.sql (locations policy, item_photos policy).
-- Only WITH CHECK changes. USING stays as is on purpose: a row that violates the new check stays
-- visible to its owner, so the owner can repair it.
-- The folder check is the same expression the storage bucket policies use.
--
-- Precheck for an existing hosted project (read-only, both must return 0 rows):
--   select c.id from public.locations c join public.locations p on p.id = c.parent_id
--     where p.user_id <> c.user_id;
--   select id from public.item_photos
--     where (storage.foldername(storage_path))[1] is distinct from user_id::text;

alter policy "locations: owner full access" on public.locations
  with check (
    user_id = (select auth.uid())
    and (parent_id is null or exists (
      select 1 from public.locations p
      where p.id = parent_id and p.user_id = (select auth.uid())))
  );

alter policy "item_photos: owner full access" on public.item_photos
  with check (
    user_id = (select auth.uid())
    and (storage.foldername(storage_path))[1] = (select auth.uid())::text
    and exists (select 1 from public.items i
                where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- Rollback (manual):
--   alter policy "locations: owner full access" on public.locations
--     with check (user_id = (select auth.uid()));
--   alter policy "item_photos: owner full access" on public.item_photos
--     with check (
--       user_id = (select auth.uid())
--       and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
--     );
