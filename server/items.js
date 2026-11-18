// @ts-check
// All SQL for the /api endpoints. Values only ever travel as $n parameters.
import { withUser } from "./db.js";

/** @typedef {import("./user.js").UserId} UserId */
/** @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool */

/** Wire shape of an items_with_stats row (A9). @param {Record<string, any>} r */
export function toItemRow(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    status: r.status,
    brand: r.brand,
    size: r.size,
    material: r.material,
    price: r.price === null ? null : Number(r.price),
    purchase_date: r.purchase_date,
    location_id: r.location_id,
    colors: r.colors,
    seasons: r.seasons,
    tags: r.tags,
    notes: r.notes,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    wear_count: r.wear_count,
    last_worn: r.last_worn,
    location_name: r.location_name,
    primary_photo_path: null,
    primary_photo_id: r.primary_photo_id,
  };
}

/** @param {Pool} pool @param {UserId} userId */
export async function listItems(pool, userId) {
  const r = await withUser(
    pool,
    userId,
    (c) =>
      c.query("select * from items_with_stats where user_id = $1 order by created_at desc, id", [
        userId,
      ]),
    { readOnly: true },
  );
  return r.rows.map(toItemRow);
}

/** @param {Pool} pool @param {UserId} userId @returns {Promise<string[]>} */
export async function listLocations(pool, userId) {
  const r = await withUser(
    pool,
    userId,
    (c) =>
      c.query("select name from locations where user_id = $1 order by sort_order, name", [userId]),
    { readOnly: true },
  );
  return r.rows.map((/** @type {{ name: string }} */ x) => x.name);
}

/** Thrown inside the transaction to roll it back when the id belongs to another user. */
class NotOwned extends Error {}

/** @param {any} client @param {UserId} userId @param {string} id */
async function getItemOn(client, userId, id) {
  const r = await client.query("select * from items_with_stats where id = $1 and user_id = $2", [
    id,
    userId,
  ]);
  return r.rows[0] ? toItemRow(r.rows[0]) : null;
}

/**
 * Idempotent upsert; location get-or-create runs in the same transaction. An id owned by another user
 * changes nothing and returns null: the `where items.user_id = excluded.user_id` clause makes the upsert a
 * no-op (rowCount 0); a 42501 from RLS is mapped the same way in case that clause is ever dropped.
 * @param {Pool} pool @param {UserId} userId @param {string} id @param {Record<string, any>} v
 */
export async function saveItem(pool, userId, id, v) {
  try {
    return await withUser(pool, userId, async (client) => {
      let locationId = null;
      if (v.location_name) {
        const l = await client.query(
          "insert into locations (user_id, name) values ($1, $2) on conflict (user_id, name) do update set name = excluded.name returning id",
          [userId, v.location_name],
        );
        locationId = l.rows[0].id;
      }
      /** @type {{ rowCount: number }} */
      let saved;
      try {
        saved = await client.query(
          `insert into items (id, user_id, name, category, status, brand, size, material, price, purchase_date,
             location_id, colors, seasons, tags, notes)
           values ($1, $15, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           on conflict (id) do update set
             name = excluded.name, category = excluded.category, status = excluded.status,
             brand = excluded.brand, size = excluded.size, material = excluded.material,
             price = excluded.price, purchase_date = excluded.purchase_date,
             location_id = excluded.location_id, colors = excluded.colors, seasons = excluded.seasons,
             tags = excluded.tags, notes = excluded.notes
             where items.user_id = excluded.user_id
           returning id`,
          [
            id,
            v.name,
            v.category,
            v.status,
            v.brand,
            v.size,
            v.material,
            v.price,
            v.purchase_date,
            locationId,
            v.colors,
            v.seasons,
            v.tags,
            v.notes,
            userId,
          ],
        );
      } catch (err) {
        // RLS: the conflicting row belongs to someone else (A5).
        if (/** @type {{ code?: string }} */ (err)?.code === "42501") throw new NotOwned();
        throw err;
      }
      if (saved.rowCount === 0) throw new NotOwned();
      return getItemOn(client, userId, id);
    });
  } catch (err) {
    if (err instanceof NotOwned) return null;
    throw err;
  }
}

/** @param {Pool} pool @param {UserId} userId @param {string} id */
export function getItem(pool, userId, id) {
  return withUser(pool, userId, (c) => getItemOn(c, userId, id), { readOnly: true });
}

/**
 * Locks the item row first (items -> item_photos, the order every photo writer uses, T-005.2), then deletes it.
 * Returns the photo rows the cascade removed, so the caller can delete their Drive files.
 * Another user's id deletes nothing and returns [].
 * @param {Pool} pool @param {UserId} userId @param {string} id @returns {Promise<{ id: string, drive_file_id: string | null }[]>}
 */
export function removeItem(pool, userId, id) {
  return withUser(pool, userId, async (client) => {
    await client.query("select id from items where id = $1 and user_id = $2 for update", [
      id,
      userId,
    ]);
    const photos = (
      await client.query(
        "select id, drive_file_id from item_photos where item_id = $1 and user_id = $2",
        [id, userId],
      )
    ).rows;
    await client.query("delete from items where id = $1 and user_id = $2", [id, userId]);
    return photos;
  });
}

/**
 * @param {Pool} pool @param {UserId} userId @param {string} id @param {1 | -1} delta @param {string} today
 * @returns {Promise<{ wear_count: number, last_worn: string | null, already: boolean } | null>}
 */
export function wearItem(pool, userId, id, delta, today) {
  return withUser(pool, userId, async (c) => {
    let already = false;
    if (delta === 1) {
      const r = await c.query(
        `insert into wear_logs (user_id, item_id, worn_on)
         select $1::uuid, i.id, $3::date from items i where i.id = $2 and i.user_id = $1
         on conflict (item_id, worn_on) do nothing returning id`,
        [userId, id, today],
      );
      already = r.rowCount === 0;
    } else {
      await c.query(
        "delete from wear_logs where user_id = $2 and id = (select id from wear_logs where item_id = $1 and user_id = $2 order by worn_on desc limit 1)",
        [id, userId],
      );
    }
    const s = await c.query(
      "select wear_count, last_worn from items_with_stats where id = $1 and user_id = $2",
      [id, userId],
    );
    if (!s.rows[0]) return null;
    return { wear_count: s.rows[0].wear_count, last_worn: s.rows[0].last_worn, already };
  });
}

/**
 * Outfit-suggestion candidates (F-704.3): the caller's own active items among `ids` in one of `categories`, read
 * from the DB so the AI never sees an id or a field the client sent. Rows come back in the order of `ids`.
 * @param {Pool} pool @param {UserId} userId @param {string[]} ids @param {string[]} categories
 * @returns {Promise<import("./ai/outfitSuggest.js").Candidate[]>}
 */
export async function loadSuggestCandidates(pool, userId, ids, categories) {
  const r = await withUser(
    pool,
    userId,
    (c) =>
      c.query(
        `select id, name, category, colors, seasons, material, wear_count, last_worn
         from items_with_stats
         where user_id = $1 and id = any($2::uuid[]) and status = 'active' and category = any($3)`,
        [userId, ids, categories],
      ),
    { readOnly: true },
  );
  /** @type {Map<string, import("./ai/outfitSuggest.js").Candidate>} */
  const byId = new Map(r.rows.map((/** @type {{ id: string }} */ x) => [x.id, x]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
