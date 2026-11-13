# Data model — Wardrobe app

Backend: self-hosted Postgres behind the Node API (D23); the authoritative schema is `db/migrations/` (tables without the `tudo_` prefix, photos on Google Drive via `item_photos`, D27). Single user without login for now: no `user_id`/RLS until in-app auth arrives (D25). The diagram below is the Supabase-era design and is kept as history.

```mermaid
erDiagram
  auth_users ||--o{ tudo_locations : owns
  auth_users ||--o{ tudo_items : owns
  tudo_locations  ||--o{ tudo_locations : "parent_id (ngăn trong tủ)"
  tudo_locations  ||--o{ tudo_items : "location_id"
  tudo_items      ||--o{ tudo_item_photos : has
  tudo_items      ||--o{ tudo_wear_logs : "worn on"

  tudo_items {
    uuid id PK
    uuid user_id FK
    text name
    tudo_item_category category
    tudo_item_status status
    text brand
    text size
    text material
    numeric price "VND"
    date purchase_date
    uuid location_id FK
    text[] colors
    tudo_season[] seasons
    text[] tags
    text notes
  }
  tudo_locations {
    uuid id PK
    text name
    uuid parent_id FK
    int sort_order
  }
  tudo_item_photos {
    uuid id PK
    uuid item_id FK
    text storage_path "user/item/uuid.jpg"
    bool is_primary
  }
  tudo_wear_logs {
    uuid id PK
    uuid item_id FK
    date worn_on "unique per item/day"
  }
```

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Colors / seasons / tags | `text[]` / `tudo_season[]` columns + GIN index, not join tables | Personal-scale data; simpler queries and CSV import. Move to tables only if tags need rename/merge. |
| Locations | Separate table, with an optional `parent_id` | Filter/rename consistently; supports nested locations like "Tủ phòng ngủ → Ngăn 2". |
| Wear count / last worn | Derived from `tudo_wear_logs` via the `tudo_items_with_stats` view | No counter drift; enables stats later (cost per wear, wear by month). |
| Photos | Private bucket `wardrobe`, resized client-side to 1200px JPEG, served by signed URLs | Privacy; small files; storage RLS keyed on the first path segment = user id. |
| Price | `numeric(14,0)` VND | No float errors, no decimals needed. |
| Filtering | Client-side over the full list | Hundreds of items load in one query; instant UI. Revisit at more than 2k items. |

## Status / category / season ids
- category: `top, bottom, dress, set, shoes, ao_dai, outer, bikini, accessory, other` (D29; `bag`, `sport`, `home` retired, kept in the enum)
- status: `active, stored, laundry, lent, out`
- season: `spring, summer, autumn, winter`
- colors: `den, trang, xam, kem, be, nau, do, hong, cam, vang, xanhla, reu, xanhduong, navy, tim, hoatiet`

## Backlog (v2)
- `outfits`, `outfit_items`; "mặc cả bộ" writes one wear_log per item.
- AI auto-tag: Edge Function `tag-item-photo` that calls a vision LLM server-side (the key never reaches the client).
- Stats page: wears per month, cost per wear = price / wear_count.
