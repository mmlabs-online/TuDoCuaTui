// @ts-check
// GET /api/backup and POST /api/restore (F-602.1): the caller's whole wardrobe as JSON, and the way back.
// Ownership is the per-request RLS setting (see db.js) plus `user_id = $caller` on every query, never ids from the file.
// Restore adds and overwrites, never deletes, never touches item_photos, and never provokes a SQL error on purpose.
// Logs carry fixed fields and counts only: never body content, ids or names.
import { createHash } from "node:crypto";
import { withUser } from "./db.js";
import { dbLogFields, mapDbError } from "./errors.js";
import { readJson, sendError, sendJson } from "./http.js";
import { rejectUnread } from "./photos.js";
import { BACKUP_CAPS, parseBackup } from "./validate.js";

const HOUR_MS = 60 * 60 * 1000;
export const RESTORE_MAX_BYTES = BACKUP_CAPS.bytes;
/** Per user and all users together (one process). */
export const RESTORE_LIMITS = { restore: { max: 10, windowMs: HOUR_MS } };
export const RESTORE_GLOBAL_LIMITS = { restore: { max: 60, windowMs: HOUR_MS } };
/** A slow sender must not hold the single restore slot. */
export const RESTORE_BODY_TIMEOUTS = { totalMs: 60_000, idleMs: 10_000 };

/** Fixed namespace for ids derived on restore (random, never used elsewhere). */
const REMAP_NAMESPACE = "6f1d5a0e-3c7b-4e52-9a64-7d2b8c1e4f90";
/** Derived-id attempts per row before the restore gives up (a squatter would have to own all of them). */
const DERIVED_ATTEMPTS = 5;
const CHUNK = 500;
const LOG_CHUNK = 5000;

/** RFC 4122 name-based UUID, version 5 (SHA-1). @param {string} name @param {string} namespace */
export function uuidv5(name, namespace) {
  const h = createHash("sha1")
    .update(Buffer.from(namespace.replace(/-/g, ""), "hex"))
    .update(name, "utf8")
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Same inputs, same id: restoring one file twice into one account lands on the same rows. */
export const derivedId = (
  /** @type {string} */ userId,
  /** @type {string} */ oldId,
  /** @type {number} */ attempt,
) => uuidv5(`${userId}:${oldId}:${attempt}`, REMAP_NAMESPACE);

/** Thrown inside the transaction to roll everything back when no free id is left for a row. */
export class RestoreConflict extends Error {}

/** @typedef {import("./items.js").Pool} Pool */

/**
 * @param {Pool} pool @param {string} userId @param {number} nowMs
 */
export async function exportBackup(pool, userId, nowMs) {
  const { locs, items, logs } = await withUser(
    pool,
    userId,
    async (c) => ({
      locs: (
        await c.query(
          `select id, name, parent_id, sort_order, created_at from locations where user_id = $1
           order by date_trunc('milliseconds', created_at), id`,
          [userId],
        )
      ).rows,
      items: (
        await c.query(
          `select id, name, category, status, brand, size, material, price, purchase_date, location_id,
             colors, seasons, tags, notes, created_at, updated_at, primary_photo_id
           from items_with_stats where user_id = $1 order by date_trunc('milliseconds', created_at), id`,
          [userId],
        )
      ).rows,
      logs: (
        await c.query(
          "select id, item_id, worn_on from wear_logs where user_id = $1 order by item_id, worn_on, id",
          [userId],
        )
      ).rows,
    }),
    { readOnly: true },
  );
  return {
    version: 1,
    exportedAt: new Date(nowMs).toISOString(),
    locations: locs.map((/** @type {Record<string, any>} */ r) => ({
      id: r.id,
      name: r.name,
      parent_id: r.parent_id,
      sort_order: r.sort_order,
      created_at: r.created_at.toISOString(),
    })),
    items: items.map((/** @type {Record<string, any>} */ r) => ({
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
      photo_id: r.primary_photo_id,
    })),
    wearLogs: logs.map((/** @type {Record<string, any>} */ r) => ({
      id: r.id,
      item_id: r.item_id,
      worn_on: r.worn_on,
    })),
  };
}

const ITEM_SET = `x(id uuid, name text, category text, status text, brand text, size text, material text,
  price numeric, purchase_date date, location_id uuid, colors text[], seasons text[], tags text[], notes text,
  created_at timestamptz, updated_at timestamptz)`;

const INSERT_ITEMS = `insert into items (id, user_id, name, category, status, brand, size, material, price,
    purchase_date, location_id, colors, seasons, tags, notes, created_at, updated_at)
  select x.id, $1::uuid, x.name, x.category::item_category, x.status::item_status, x.brand, x.size, x.material,
    x.price, x.purchase_date, x.location_id, x.colors, x.seasons, x.tags, x.notes, x.created_at, x.updated_at
  from jsonb_to_recordset($2::jsonb) as ${ITEM_SET} where true
  on conflict do nothing returning id`;

// created_at / updated_at are never set here; the guard keeps the updated_at trigger from firing on no-ops.
const UPDATE_ITEMS = `update items i set name = x.name, category = x.category::item_category,
    status = x.status::item_status, brand = x.brand, size = x.size, material = x.material, price = x.price,
    purchase_date = x.purchase_date, location_id = x.location_id, colors = x.colors, seasons = x.seasons,
    tags = x.tags, notes = x.notes
  from jsonb_to_recordset($2::jsonb) as ${ITEM_SET}
  where i.id = x.id and i.user_id = $1::uuid
    and (i.name, i.category, i.status, i.brand, i.size, i.material, i.price, i.purchase_date, i.location_id,
         i.colors, i.seasons, i.tags, i.notes)
      is distinct from
        (x.name, x.category::item_category, x.status::item_status, x.brand, x.size, x.material, x.price,
         x.purchase_date, x.location_id, x.colors, x.seasons, x.tags, x.notes)
  returning i.id`;

const LOG_SET = "x(id uuid, item_id uuid, worn_on date)";

/**
 * @param {Pool} pool @param {string} userId
 * @param {Exclude<ReturnType<typeof parseBackup>, { ok: false }>["value"]} backup
 */
export async function restoreBackup(pool, userId, backup) {
  return withUser(pool, userId, async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtextextended('restore:' || $1::text, 0))", [
      userId,
    ]);

    // ---- locations: keep the id if the caller owns it, else merge by name, else insert (new id if taken) ----
    /** @type {Map<string, { id: string, name: string, sort_order: number, parent_id: string | null }>} */
    const byId = new Map();
    /** @type {Map<string, string>} */
    const byName = new Map();
    for (const r of (
      await c.query("select id, name, sort_order, parent_id from locations where user_id = $1", [
        userId,
      ])
    ).rows) {
      byId.set(r.id, r);
      byName.set(r.name, r.id);
    }
    const locs = { inserted: 0, updated: 0, unchanged: 0, merged: 0, remapped: 0 };
    /** @type {Map<string, string>} file id -> target id */
    const locMap = new Map();
    /** Rows whose parent may be set: owned by id or inserted here (merged rows are never modified). */
    const settable = new Set();
    /** @type {Set<string>} */
    const touched = new Set();
    /** Rows the caller already owned under the file id. */
    const owned = new Set();
    for (const f of backup.locations) {
      const mine = byId.get(f.id);
      if (mine) {
        locMap.set(f.id, f.id);
        settable.add(f.id);
        owned.add(f.id);
        const holder = byName.get(f.name);
        const rename = mine.name !== f.name && holder === undefined;
        if (rename || mine.sort_order !== f.sort_order) {
          await c.query(
            "update locations set name = $3, sort_order = $4 where id = $1 and user_id = $2",
            [f.id, userId, rename ? f.name : mine.name, f.sort_order],
          );
          if (rename) {
            byName.delete(mine.name);
            byName.set(f.name, f.id);
            mine.name = f.name;
          }
          mine.sort_order = f.sort_order;
          touched.add(f.id);
        }
        continue;
      }
      const same = byName.get(f.name);
      if (same !== undefined) {
        locMap.set(f.id, same);
        locs.merged++;
        if (same !== f.id) locs.remapped++;
        continue;
      }
      let target = null;
      for (let a = -1; a < DERIVED_ATTEMPTS && target === null; a++) {
        const cand = a < 0 ? f.id : derivedId(userId, f.id, a);
        if (a >= 0 && byId.has(cand)) {
          target = cand; // an earlier run put it here
          locMap.set(f.id, cand);
          locs.merged++;
          locs.remapped++;
          break;
        }
        const ins = await c.query(
          `insert into locations (id, user_id, name, sort_order, created_at) values ($1, $2, $3, $4, $5)
           on conflict do nothing returning id`,
          [cand, userId, f.name, f.sort_order, f.created_at],
        );
        if (ins.rowCount === 1) {
          target = cand;
          byId.set(cand, { id: cand, name: f.name, sort_order: f.sort_order, parent_id: null });
          byName.set(f.name, cand);
          locMap.set(f.id, cand);
          settable.add(cand);
          locs.inserted++;
          if (cand !== f.id) locs.remapped++;
        }
      }
      if (target === null) throw new RestoreConflict();
    }
    for (const f of backup.locations) {
      const target = /** @type {string} */ (locMap.get(f.id));
      if (!settable.has(target)) continue;
      const want = f.parent_id === null ? null : (locMap.get(f.parent_id) ?? null);
      const row = /** @type {{ parent_id: string | null }} */ (byId.get(target));
      if (want === target || row.parent_id === want) continue;
      await c.query("update locations set parent_id = $3 where id = $1 and user_id = $2", [
        target,
        userId,
        want,
      ]);
      row.parent_id = want;
      touched.add(target);
    }
    locs.updated = [...owned].filter((id) => touched.has(id)).length;
    locs.unchanged = owned.size - locs.updated;

    // ---- items: set-based; a taken id is retried with derived ids, so a rerun lands on the same rows ----
    /** @type {Map<string, string>} file id -> target id */
    const itemMap = new Map();
    const items = { inserted: 0, updated: 0, unchanged: 0, remapped: 0 };
    /** @param {(typeof backup.items)[number]} it @param {string} id */
    const record = (it, id) => ({
      id,
      name: it.name,
      category: it.category,
      status: it.status,
      brand: it.brand,
      size: it.size,
      material: it.material,
      price: it.price,
      purchase_date: it.purchase_date,
      location_id: it.location_id === null ? null : (locMap.get(it.location_id) ?? null),
      colors: it.colors,
      seasons: it.seasons,
      tags: it.tags,
      notes: it.notes,
      created_at: it.created_at,
      updated_at: it.updated_at,
    });
    let pending = backup.items.map((it) => ({ it, cand: it.id }));
    for (let a = -1; a < DERIVED_ATTEMPTS && pending.length > 0; a++) {
      /** @type {typeof pending} */
      const next = [];
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const ins = await c.query(INSERT_ITEMS, [
          userId,
          JSON.stringify(chunk.map((p) => record(p.it, p.cand))),
        ]);
        const inserted = new Set(ins.rows.map((/** @type {{ id: string }} */ r) => r.id));
        const have = await c.query(
          "select id from items where user_id = $1 and id = any($2::uuid[])",
          [userId, chunk.map((p) => p.cand)],
        );
        const ownedIds = new Set(have.rows.map((/** @type {{ id: string }} */ r) => r.id));
        const old = chunk.filter((p) => ownedIds.has(p.cand) && !inserted.has(p.cand));
        const changed = new Set();
        if (old.length > 0) {
          const upd = await c.query(UPDATE_ITEMS, [
            userId,
            JSON.stringify(old.map((p) => record(p.it, p.cand))),
          ]);
          for (const r of upd.rows) changed.add(r.id);
        }
        for (const p of chunk) {
          if (!ownedIds.has(p.cand)) {
            next.push({ it: p.it, cand: derivedId(userId, p.it.id, a + 1) });
            continue;
          }
          itemMap.set(p.it.id, p.cand);
          if (p.cand !== p.it.id) items.remapped++;
          if (inserted.has(p.cand)) items.inserted++;
          else if (changed.has(p.cand)) items.updated++;
          else items.unchanged++;
        }
      }
      pending = next;
    }
    if (pending.length > 0) throw new RestoreConflict();

    // ---- wear logs: keep the id when free; a taken id gets a database id (the (item, day) pair keeps reruns no-ops) ----
    const logs = { inserted: 0, unchanged: 0 };
    for (let i = 0; i < backup.wearLogs.length; i += LOG_CHUNK) {
      const rows = backup.wearLogs.slice(i, i + LOG_CHUNK).map((w) => ({
        id: w.id,
        item_id: itemMap.get(w.item_id),
        worn_on: w.worn_on,
      }));
      const ins = await c.query(
        `insert into wear_logs (id, user_id, item_id, worn_on)
         select x.id, $1::uuid, x.item_id, x.worn_on from jsonb_to_recordset($2::jsonb) as ${LOG_SET} where true
         on conflict do nothing returning id`,
        [userId, JSON.stringify(rows)],
      );
      const inserted = new Set(ins.rows.map((/** @type {{ id: string }} */ r) => r.id));
      const rest = rows.filter((r) => !inserted.has(r.id));
      logs.inserted += inserted.size;
      if (rest.length === 0) continue;
      const have = await c.query(
        "select item_id, worn_on from wear_logs where user_id = $1 and item_id = any($2::uuid[])",
        [userId, [...new Set(rest.map((r) => r.item_id))]],
      );
      const pairs = new Set(
        have.rows.map(
          (/** @type {{ item_id: string, worn_on: string }} */ r) => `${r.item_id}|${r.worn_on}`,
        ),
      );
      const fresh = rest.filter((r) => !pairs.has(`${r.item_id}|${r.worn_on}`));
      logs.unchanged += rest.length - fresh.length;
      if (fresh.length > 0) {
        const again = await c.query(
          `insert into wear_logs (user_id, item_id, worn_on)
           select $1::uuid, x.item_id, x.worn_on from jsonb_to_recordset($2::jsonb) as ${LOG_SET} where true
           on conflict do nothing returning id`,
          [userId, JSON.stringify(fresh)],
        );
        logs.inserted += again.rowCount;
        logs.unchanged += fresh.length - again.rowCount;
      }
    }

    // ---- photos are never restored: count the items the file says had one and that have none now ----
    const withPhoto = backup.items.filter((it) => it.photo_id !== null);
    let photosMissing = 0;
    for (let i = 0; i < withPhoto.length; i += LOG_CHUNK) {
      const r = await c.query(
        "select count(*)::int as n from items_with_stats where user_id = $1 and id = any($2::uuid[]) and primary_photo_id is null",
        [userId, withPhoto.slice(i, i + LOG_CHUNK).map((it) => itemMap.get(it.id))],
      );
      photosMissing += r.rows[0].n;
    }
    return { locations: locs, items, wearLogs: logs, photosMissing };
  });
}

/**
 * Both routes. The router has already checked method and the cross-site header.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   route: string, pool: Pool | null, userId: string, id: string,
 *   backup: {
 *     slots: { tryAcquire(userId: string): (() => void) | null },
 *     limiter: { check(userId: string, kind: string): boolean },
 *     timeouts: { totalMs: number, idleMs: number },
 *   },
 *   log: (entry: Record<string, unknown>) => void, now: () => number,
 * }} ctx
 */
export async function handleBackup(req, res, { route, pool, userId, id, backup, log, now }) {
  /** @param {unknown} err */
  const dbFail = (err) => {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, route, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    sendError(res, mapped.status, mapped.code, extra);
  };

  if (route === "/api/backup") {
    if (!pool) return sendError(res, 503, "db_unavailable");
    try {
      return sendJson(res, 200, await exportBackup(pool, userId, now()));
    } catch (err) {
      return dbFail(err);
    }
  }

  const started = Date.now();
  /** @param {string} code @param {unknown} [counts] */
  const done = (code, counts) =>
    log({ event: "restore", id, code, ms: Date.now() - started, ...(counts ? { counts } : {}) });
  /** The body is not (fully) read: answer, then close the socket. */
  /** @param {number} status @param {string} code @param {Record<string, string>} [headers] */
  const reject = (status, code, headers) => {
    done(code);
    return rejectUnread(req, res, status, code, headers);
  };
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return reject(415, "unsupported_media_type");
  if (Number(req.headers["content-length"]) > RESTORE_MAX_BYTES) {
    return reject(413, "payload_too_large");
  }
  // Acquire before the limiter and before any await: a busy answer never consumes quota.
  const release = backup.slots.tryAcquire(userId);
  if (!release) return reject(503, "restore_busy", { "Retry-After": "5" });
  try {
    if (!backup.limiter.check(userId, "restore")) return reject(429, "rate_limited");
    const body = await readJson(req, { limit: RESTORE_MAX_BYTES, timeouts: backup.timeouts });
    if (!body.ok) {
      if (body.status === 413 || body.status === 408) return reject(body.status, body.code);
      done(body.code);
      return sendError(res, body.status, body.code);
    }
    const parsed = parseBackup(body.value);
    if (!parsed.ok) {
      done("invalid_input");
      return sendError(res, 400, "invalid_input", { field: parsed.field, reason: parsed.reason });
    }
    if (!pool) {
      done("db_unavailable");
      return sendError(res, 503, "db_unavailable");
    }
    const summary = await restoreBackup(pool, userId, parsed.value);
    done("ok", summary);
    return sendJson(res, 200, { summary });
  } catch (err) {
    if (err instanceof RestoreConflict) {
      done("restore_conflict");
      return sendError(res, 409, "restore_conflict");
    }
    done(mapDbError(err).code);
    return dbFail(err);
  } finally {
    release();
  }
}
