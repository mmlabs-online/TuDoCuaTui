// @ts-check
// All SQL for the /api endpoints. Values only ever travel as $n parameters.

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

/** @param {Pool} pool */
export async function listItems(pool) {
  const r = await pool.query("select * from items_with_stats order by created_at desc, id");
  return r.rows.map(toItemRow);
}

/** @param {Pool} pool @returns {Promise<string[]>} */
export async function listLocations(pool) {
  const r = await pool.query("select name from locations order by sort_order, name");
  return r.rows.map((/** @type {{ name: string }} */ x) => x.name);
}

/**
 * Idempotent upsert; location get-or-create runs in the same transaction.
 * @param {Pool} pool @param {string} id @param {Record<string, any>} v
 */
export async function saveItem(pool, id, v) {
  if (!pool.connect) throw new Error("pool has no connect()");
  const client = await pool.connect();
  try {
    await client.query("begin");
    let locationId = null;
    if (v.location_name) {
      const l = await client.query(
        "insert into locations (name) values ($1) on conflict (name) do update set name = excluded.name returning id",
        [v.location_name],
      );
      locationId = l.rows[0].id;
    }
    await client.query(
      `insert into items (id, name, category, status, brand, size, material, price, purchase_date,
         location_id, colors, seasons, tags, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (id) do update set
         name = excluded.name, category = excluded.category, status = excluded.status,
         brand = excluded.brand, size = excluded.size, material = excluded.material,
         price = excluded.price, purchase_date = excluded.purchase_date,
         location_id = excluded.location_id, colors = excluded.colors, seasons = excluded.seasons,
         tags = excluded.tags, notes = excluded.notes`,
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
      ],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    client.release(/** @type {any} */ (err));
    throw err;
  }
  client.release();
  return getItem(pool, id);
}

/** @param {Pool} pool @param {string} id */
export async function getItem(pool, id) {
  const r = await pool.query("select * from items_with_stats where id = $1", [id]);
  return r.rows[0] ? toItemRow(r.rows[0]) : null;
}

/**
 * Locks the item row first (items -> item_photos, the order every photo writer uses, T-005.2), then deletes it.
 * Returns the photo rows the cascade removed, so the caller can delete their Drive files.
 * @param {Pool} pool @param {string} id @returns {Promise<{ id: string, drive_file_id: string | null }[]>}
 */
export async function removeItem(pool, id) {
  if (!pool.connect) throw new Error("pool has no connect()");
  const client = await pool.connect();
  let photos = [];
  try {
    await client.query("begin");
    await client.query("select id from items where id = $1 for update", [id]);
    photos = (
      await client.query("select id, drive_file_id from item_photos where item_id = $1", [id])
    ).rows;
    await client.query("delete from items where id = $1", [id]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    client.release(/** @type {any} */ (err));
    throw err;
  }
  client.release();
  return photos;
}

/**
 * @param {Pool} pool @param {string} id @param {1 | -1} delta @param {string} today
 * @returns {Promise<{ wear_count: number, last_worn: string | null, already: boolean } | null>}
 */
export async function wearItem(pool, id, delta, today) {
  let already = false;
  if (delta === 1) {
    const r = await pool.query(
      "insert into wear_logs (item_id, worn_on) values ($1, $2) on conflict (item_id, worn_on) do nothing returning id",
      [id, today],
    );
    already = r.rowCount === 0;
  } else {
    await pool.query(
      "delete from wear_logs where id = (select id from wear_logs where item_id = $1 order by worn_on desc limit 1)",
      [id],
    );
  }
  const s = await pool.query("select wear_count, last_worn from items_with_stats where id = $1", [
    id,
  ]);
  if (!s.rows[0]) return null;
  return { wear_count: s.rows[0].wear_count, last_worn: s.rows[0].last_worn, already };
}
