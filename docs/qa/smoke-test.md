# Smoke test: Supabase backend end-to-end

## Purpose
Prove that the Supabase backend from PR #1 works with the real app: sign in, add an item with a photo, edit, wear today / undo, duplicate (photo copied), delete (storage file removed). Feature F-001.

Two runs share the same steps:
- **Run A, local stack:** safe, runs on your machine in Docker. Do this first.
- **Run B, hosted project (M-2):** the real Supabase project, on desktop Chrome and on a phone.

Each failure becomes a ticket with `/ticket`. Link it in the Notes column of the results table.

Text is English. Vietnamese appears only for exact UI labels and toasts.

## Prerequisites
- `pnpm install` done. `.env.local` exists (copy from `.env.example`).
- `.env.local` needs two values, by name: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Restart `pnpm dev` after every change to `.env.local`.
- Never paste key values into this document, a ticket, or a commit.

### Run A values
Docker Desktop is running. Run from the repo root (use Git Bash on Windows, from a normal drive path, not a WSL path):

```bash
npx supabase start      # first run pulls ~10 images and is slow
npx supabase status     # prints the URL and the anon/publishable key
```

Copy the API URL and the anon (publishable) key from `npx supabase status` into `.env.local` by hand.

If `start` fails on the `vector` or analytics container (Docker socket not exposed on Windows), use `npx supabase start -x vector,logflare`.

This repo uses its own ports so it does not collide with other Supabase stacks:

| Service | URL / port |
|---|---|
| API (`VITE_SUPABASE_URL`) | `http://127.0.0.1:55321` |
| Database | `55322` |
| Studio (SQL editor, Storage) | `http://127.0.0.1:55323` |
| Mail (Mailpit/Inbucket, magic links) | `http://127.0.0.1:55324` |

Reset to a clean database at any time with `npx supabase db reset`. When done:

```bash
npx supabase stop --no-backup
```

### Run B values
Project URL and anon key from the Supabase dashboard (Project Settings → API) go into `.env.local`. Prerequisites M-1: migration applied with `npx supabase db push`, and Auth → URL Configuration contains `http://localhost:8443`. Use the SQL editor in the dashboard and Storage → `wardrobe` for the checks.

### Differences between runs
| | Run A | Run B |
|---|---|---|
| Magic link | Mailpit at `http://127.0.0.1:55324` | Real inbox |
| SQL checks | Local Studio `http://127.0.0.1:55323` → SQL Editor | Dashboard → SQL Editor |
| Storage view | Local Studio → Storage → `wardrobe` | Dashboard → Storage → `wardrobe` |
| Browser | Desktop Chrome | Desktop Chrome, then a phone |

## Find your ids
The SQL checks use these placeholders. Run these to find the values:

- `<uid>`: your user id.
  ```sql
  select id, email from auth.users;
  ```
- `<orig_id>` and `<copy_id>`: item ids, newest first.
  ```sql
  select id, name, created_at from items order by created_at desc;
  ```
  `<orig_id>` is the item you added in step 2. `<copy_id>` is the copy from step 6.
- `<id>` (Check b only): the id of any item you wear in that check, from the same query.

## Steps
Record the result of each step in the results table at the end.

### Step 1: Sign in
- **Do:** open `http://localhost:8443`, enter your email, press "Gửi link đăng nhập", open the link from the mail inbox (Run A: Mailpit).
- **Expected UI:** the app opens signed in, with an empty wardrobe and the empty-state text "Thêm món đồ đầu tiên hoặc import bộ sưu tập sẵn có."
- **Expected DB:** `select id, email from auth.users;` lists your email.

### Step 2: Add an item with a photo
- **Do:** press "Thêm món đồ", fill in a name, attach one photo, press "Lưu món đồ".
- **Expected UI:** the item appears in the list with its photo.
- **Expected DB:**
  ```sql
  select id, name, user_id from items where user_id = '<uid>';
  select item_id, storage_path, is_primary from item_photos where item_id = '<orig_id>';
  select name from storage.objects where bucket_id = 'wardrobe' and name like '<uid>/%';
  ```
  One `items` row, one `item_photos` row with `is_primary = true`, and a storage object whose name starts with `<uid>/<orig_id>/`.

### Step 3: Edit
- **Do:** open the item, change the name and one other field, press "Lưu món đồ".
- **Expected UI:** the list shows the new values. Reload the page: they persist.
- **Expected DB:** `select name from items where id = '<orig_id>';` returns the new name. The photo row is unchanged.

### Step 4: Wear today
- **Do:** open the item, press "Mặc hôm nay".
- **Expected UI:** toast "Đã ghi nhận mặc hôm nay"; the wear count goes up by 1.
- **Expected DB:** `select count(*) from wear_logs where item_id = '<orig_id>';` returns 1.

### Step 5: Undo
- **Do:** press "−1".
- **Expected UI:** toast "Đã điều chỉnh số lần mặc"; the wear count goes back to 0.
- **Expected DB:** the same `wear_logs` count query returns 0.

### Step 6: Duplicate
- **Do:** open the original item, press "Nhân bản", then press "Lưu món đồ". The copy is only written on save.
- **Expected UI:** a second item with the same photo appears.
- **Expected DB:** find `<copy_id>`, then run:
  ```sql
  select item_id, storage_path from item_photos where item_id in ('<orig_id>', '<copy_id>');
  select name from storage.objects where bucket_id = 'wardrobe' and name like '<uid>/%';
  ```
  Two `item_photos` rows with different `storage_path` values. Folder segment 2 of each path is its own item id (`<uid>/<orig_id>/...` and `<uid>/<copy_id>/...`). Two storage objects, one per folder.

### Step 7: Delete
- **Before deleting:** open the original item and press "Mặc hôm nay" once (step 5 undid the only wear, so this gives the cascade check something to delete). Run `select count(*) from wear_logs where item_id = '<orig_id>';`. It must return 1.
- **Do:** open the original item, press "Xoá", confirm with "Xoá món đồ".
- **Expected UI:** the original disappears; the copy stays and its photo still shows after the original is deleted.
- **Expected DB:**
  ```sql
  select count(*) from item_photos where item_id = '<orig_id>';
  select name from storage.objects where bucket_id = 'wardrobe' and name like '<uid>/<orig_id>/%';
  select count(*) from wear_logs where item_id = '<orig_id>';
  ```
  `item_photos` count is 0, no storage objects under `<uid>/<orig_id>/`, `wear_logs` count is 0 (cascade; it was 1 before the delete). The copy's folder `<uid>/<copy_id>/` still has its object.

## Extra checks (from the ticket)

### Check a: silent photo-removal failure
`removePhotos()` ignores errors from `storage.remove` and from deleting `item_photos`, so a failed delete would be silent.
- After step 7, check the Storage bucket `wardrobe` (dashboard or local Studio) and run the step 7 queries.
- **Expected:** the bucket has no object under `<uid>/<orig_id>/`, and `item_photos` has no row for `<orig_id>`.
- **If either remains:** that is a bug. File it with `/ticket`.

### Check b: wear twice on the same day
- **Do:** on an item, press "Mặc hôm nay" twice in a row (before any undo).
- **Expected with current code:** `select worn_on, count(*) from wear_logs where item_id = '<id>' group by worn_on order by worn_on desc;` shows today's local date (YYYY-MM-DD) once with count 1 (unique per item per day; do not filter on `current_date`, the DB runs in UTC and can differ from your local date), but the toast "Đã ghi nhận mặc hôm nay" shows again on the second press. This is known behaviour, not a new bug. Record it as "as expected".

### Check c: wear pill between 00:00 and 07:00 local time
- **Do:** with an item worn today, look at its wear pill between 00:00 and 07:00 local time.
- **Expected with current code (T-002):** the pill shows "-1 ngày" until T-002 lands. Record the result; do not file a duplicate of T-002.

## SQL checks reference
Collected here for convenience. Replace `<uid>`, `<orig_id>`, `<copy_id>` as described above.

```sql
-- photos before/after duplicate
select item_id, storage_path from item_photos where item_id in ('<orig_id>', '<copy_id>');

-- files in storage for this user
select name from storage.objects where bucket_id = 'wardrobe' and name like '<uid>/%';

-- after delete: expect 0 rows / 0
select count(*) from item_photos where item_id = '<orig_id>';
select name from storage.objects where bucket_id = 'wardrobe' and name like '<uid>/<orig_id>/%';

-- wear_logs: 1 after wearing once just before delete (step 7), 0 after delete (cascade)
select count(*) from wear_logs where item_id = '<orig_id>';
```

## Results
Fill in `pass`, `fail` or `n/a`. Each failure → `/ticket`; put the ticket id in Notes.

| Step | Run A result | Run B desktop | Run B phone | Notes / ticket |
|---|---|---|---|---|
| 1 Sign in | | | | |
| 2 Add item with photo | | | | |
| 3 Edit | | | | |
| 4 Wear today | | | | |
| 5 Undo ("−1") | | | | |
| 6 Duplicate (photo copied) | | | | |
| 7 Delete (storage + rows gone) | | | | |
| Check a: silent removePhotos | | | | |
| Check b: wear twice | | | | |
| Check c: pill 00:00-07:00 | | | | |
