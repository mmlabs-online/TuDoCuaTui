// @ts-check
// PUT / DELETE /api/items/:id/photo (D27). The browser sends the resized JPEG; Drive file ids never leave the server.
// Lock rule: every writer of item_photos locks the items row first (items -> item_photos), so writers never deadlock.
// Step 2, only in putPhoto: after the items row, a per-user advisory xact lock serialises the stored-photo recount.
// No holder asks for another items lock, and deletes never take it (they only lower the count).
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { withUser } from "./db.js";
import { DriveError } from "./drive.js";
import { dbLogFields, mapDbError } from "./errors.js";
import { sendError, sendJson } from "./http.js";
import { getItem } from "./items.js";
import { storedAllows } from "./photoQuota.js";
import { isUuid } from "./validate.js";

export const MAX_BYTES = 2 * 1024 * 1024;
/** Upload body limits: cut at `totalMs` overall or after `idleMs` without a chunk (slow senders free their slot). */
export const BODY_TIMEOUTS = { totalMs: 15_000, idleMs: 5_000 };

/** @typedef {{ id: string, drive_file_id: string | null }} PhotoRef */

/**
 * The request body is not (fully) read: answer, then close the socket once the response is flushed.
 * @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res
 * @param {number} status @param {string} code @param {Record<string, string>} [headers]
 */
export function rejectUnread(req, res, status, code, headers = {}) {
  res.once("finish", () => req.socket.destroy());
  return sendError(res, status, code, {}, { Connection: "close", ...headers });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {{ totalMs: number, idleMs: number }} [timeouts]
 * @returns {Promise<{ ok: true, bytes: Buffer } | { ok: false, status: number, code: string }>}
 */
export function readBody(req, { totalMs, idleMs } = BODY_TIMEOUTS) {
  const declared = req.headers["content-length"];
  return new Promise((resolve) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    let done = false;
    /** @param {{ ok: true, bytes: Buffer } | { ok: false, status: number, code: string }} r */
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(idle);
      req.pause();
      resolve(r);
    };
    const bad = { ok: /** @type {const} */ (false), status: 400, code: "invalid_photo" };
    const timeout = () => finish({ ok: false, status: 408, code: "request_timeout" });
    const timer = setTimeout(timeout, totalMs);
    let idle = setTimeout(timeout, idleMs);
    req.on("data", (chunk) => {
      clearTimeout(idle);
      idle = setTimeout(timeout, idleMs);
      total += chunk.length;
      if (total > MAX_BYTES) finish({ ok: false, status: 413, code: "payload_too_large" });
      else chunks.push(chunk);
    });
    req.on("end", () =>
      finish(
        declared !== undefined && Number(declared) !== total
          ? bad
          : { ok: true, bytes: Buffer.concat(chunks) },
      ),
    );
    req.on("error", () => finish(bad));
    req.on("close", () => finish(bad));
  });
}

/**
 * Best-effort: a failed Drive delete only leaves a tagged file behind. Logs the photo row id, never Drive ids or text.
 * @param {ReturnType<typeof import("./drive.js").createDriveClient> | null} drive
 * @param {PhotoRef[]} photos @param {(entry: Record<string, unknown>) => void} log
 */
export async function deleteDriveFiles(drive, photos, log) {
  for (const p of photos) {
    if (!p.drive_file_id) continue;
    try {
      if (!drive) throw new DriveError("drive_not_configured");
      await drive.deleteFile(p.drive_file_id);
    } catch (err) {
      log({ event: "photo_orphan", photoId: p.id, code: /** @type {DriveError} */ (err)?.code });
    }
  }
}

/**
 * Runs `fn` in a transaction with the caller's item row locked. `fn` gets the client.
 * @param {import("./items.js").Pool} pool @param {import("./user.js").UserId} userId @param {string} itemId
 * @param {(client: any) => Promise<void>} fn @returns {Promise<boolean>} false when the caller has no such item
 */
function withLockedItem(pool, userId, itemId, fn) {
  return withUser(pool, userId, async (client) => {
    const lock = await client.query(
      "select id from items where id = $1 and user_id = $2 for update",
      [itemId, userId],
    );
    if (lock.rowCount === 0) return false;
    await fn(client);
    return true;
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   pool: import("./items.js").Pool | null,
 *   userId: import("./user.js").UserId,
 *   drive: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   folders: ReturnType<typeof import("./driveFolders.js").createFolderResolver> | null,
 *   photoSlots: { tryAcquire(userId: string): (() => void) | null },
 *   photoQuota: ReturnType<typeof import("./photoQuota.js").createPhotoQuota>,
 *   bodyTimeouts: { totalMs: number, idleMs: number },
 *   itemId: string, query: string, id: string, log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handlePhoto(
  req,
  res,
  { pool, userId, drive, folders, photoSlots, photoQuota, bodyTimeouts, itemId, query, id, log },
) {
  const put = req.method === "PUT";
  if (put) {
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "image/jpeg") return rejectUnread(req, res, 415, "unsupported_media_type");
    if (Number(req.headers["content-length"]) > MAX_BYTES) {
      return rejectUnread(req, res, 413, "payload_too_large");
    }
  }
  /** @type {string | undefined} */
  let expected;
  if (!put) {
    // Required: the photo id the caller saw, so a stale view cannot delete a newer photo.
    const all = new URLSearchParams(query).getAll("photo");
    if (all.length !== 1 || !isUuid(all[0])) {
      return sendError(res, 400, "invalid_input", { field: "photo", reason: "idInvalid" });
    }
    expected = all[0];
  }
  if (!drive) return rejectUnread(req, res, 503, "photos_unavailable");
  if (!pool) return rejectUnread(req, res, 503, "db_unavailable");
  // Daily count first, before the body is read. No await between the reserve and the acquire.
  const ticket = put ? photoQuota.reserve(userId) : null;
  if (ticket && !ticket.ok) {
    return rejectUnread(req, res, 429, "rate_limited", {
      "Retry-After": String(ticket.retryAfterSec),
    });
  }
  const release = put ? photoSlots.tryAcquire(userId) : null;
  if (put && !release) {
    if (ticket?.ok) ticket.refund();
    return rejectUnread(req, res, 503, "photos_unavailable", { "Retry-After": "5" });
  }
  // The reservation stays only when Drive stored a file; every other outcome is refunded.
  let charged = false;

  try {
    if (!put) {
      /** @type {PhotoRef[]} */
      let old = [];
      const found = await withLockedItem(pool, userId, itemId, async (c) => {
        old = (
          await c.query(
            "delete from item_photos where item_id = $1 and id = $2 and user_id = $3 returning id, drive_file_id",
            [itemId, expected, userId],
          )
        ).rows;
      });
      if (!found) return sendError(res, 404, "not_found");
      await deleteDriveFiles(drive, old, log);
      res.writeHead(204, { "Cache-Control": "no-store" });
      return res.end();
    }

    return await putPhoto(req, res, {
      pool,
      userId,
      drive,
      folders,
      photoQuota,
      bodyTimeouts,
      itemId,
      log,
      onDriveStored: () => {
        charged = true;
      },
    });
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    return sendError(res, mapped.status, mapped.code, extra);
  } finally {
    if (!charged && ticket?.ok) ticket.refund();
    release?.();
  }
}

/** Zero rows for a missing item; otherwise the user's stored photos and the ones on this item. */
const QUOTA_SQL =
  "select (select count(*)::int from item_photos where user_id = $2) as total, (select count(*)::int from item_photos where user_id = $2 and item_id = $1) as on_item from items where id = $1 and user_id = $2";

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {any} ctx */
async function putPhoto(
  req,
  res,
  { pool, userId, drive, folders, photoQuota, bodyTimeouts, itemId, log, onDriveStored },
) {
  const body = await readBody(req, bodyTimeouts);
  if (!body.ok) {
    return body.status === 400
      ? sendError(res, 400, body.code)
      : rejectUnread(req, res, body.status, body.code);
  }
  const { bytes } = body;
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return sendError(res, 400, "invalid_photo");
  }
  const cap = photoQuota.storedCap(userId);
  const exists = await withUser(pool, userId, (c) => c.query(QUOTA_SQL, [itemId, userId]), {
    readOnly: true,
  });
  if (exists.rowCount === 0) return sendError(res, 404, "not_found");
  if (!storedAllows({ total: exists.rows[0].total, onItem: exists.rows[0].on_item, cap })) {
    return sendError(res, 409, "photo_quota_exceeded");
  }

  const photoId = randomUUID();
  /** @type {{ id: string }} */
  let file;
  let folderId;
  try {
    // Per-user subfolder (T-021). No fallback to the root: a failure here fails the request like a failed upload.
    folderId = await folders.resolve(userId);
    file = await drive.createFile({
      name: `${photoId}.jpg`,
      mimeType: "image/jpeg",
      bytes,
      parentId: folderId,
      appProperties: { app: "tudo", photoId, itemId, userId },
    });
    onDriveStored();
  } catch (err) {
    const code = /** @type {DriveError} */ (err)?.code;
    // A cached folder that Drive no longer has: forget it, fail this request, the next upload makes a new one.
    if (code === "drive_not_found" && folderId) folders.forget(userId);
    log({ event: "photo_upload_failed", code });
    const config = ["drive_auth", "drive_forbidden", "drive_not_found", "drive_folder_not_found"];
    return config.includes(code)
      ? sendError(res, 503, "photos_unavailable")
      : sendError(res, 502, "photo_upload_failed");
  }

  /** @type {PhotoRef[]} */
  let old = [];
  let found;
  let over = false;
  try {
    found = await withLockedItem(pool, userId, itemId, async (c) => {
      if (cap !== null) {
        // Authoritative recount under a per-user lock; a flag, not a throw, so the pooled connection survives.
        await c.query(
          "select pg_advisory_xact_lock(hashtextextended('photo-quota:' || $1::text, 0))",
          [userId],
        );
        const r = (await c.query(QUOTA_SQL, [itemId, userId])).rows[0];
        if (!storedAllows({ total: r.total, onItem: r.on_item, cap })) {
          over = true;
          return;
        }
      }
      old = (
        await c.query(
          "delete from item_photos where item_id = $1 and user_id = $2 returning id, drive_file_id",
          [itemId, userId],
        )
      ).rows;
      await c.query(
        "insert into item_photos (id, user_id, item_id, drive_file_id, is_primary) values ($1, $2, $3, $4, true)",
        [photoId, userId, itemId, file.id],
      );
    });
  } catch (err) {
    await deleteDriveFiles(drive, [{ id: photoId, drive_file_id: file.id }], log);
    throw err;
  }
  if (!found || over) {
    await deleteDriveFiles(drive, [{ id: photoId, drive_file_id: file.id }], log);
    return found ? sendError(res, 409, "photo_quota_exceeded") : sendError(res, 404, "not_found");
  }
  await deleteDriveFiles(drive, old, log);
  const item = await getItem(pool, userId, itemId);
  return item ? sendJson(res, 200, { item }) : sendError(res, 404, "not_found");
}

const PHOTO_HEADERS = {
  "Content-Type": "image/jpeg",
  // no-cache: the browser revalidates every use, so a 304 is only ever reached through the owner check below (D34).
  "Cache-Control": "private, no-cache",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/**
 * GET /api/photos/:id: streams the stored JPEG. Headers are constants (never Drive's); errors and logs carry no ids.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   pool: import("./items.js").Pool | null,
 *   userId: import("./user.js").UserId,
 *   drive: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   photoId: string, id: string, log: (entry: Record<string, unknown>) => void, deadlineMs?: number,
 * }} ctx
 */
export async function servePhoto(
  req,
  res,
  { pool, userId, drive, photoId, id, log, deadlineMs = 30_000 },
) {
  if (!drive) return sendError(res, 503, "photos_unavailable");
  if (!pool) return sendError(res, 503, "db_unavailable");
  let driveFileId;
  try {
    const r = await withUser(
      pool,
      userId,
      (c) =>
        c.query("select drive_file_id from item_photos where id = $1 and user_id = $2", [
          photoId,
          userId,
        ]),
      { readOnly: true },
    );
    driveFileId = r.rows[0]?.drive_file_id;
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    return sendError(res, mapped.status, mapped.code, extra);
  }
  if (!driveFileId) return sendError(res, 404, "not_found");

  const etag = `"${photoId}"`;
  const { "Content-Type": _type, ...cacheHeaders } = PHOTO_HEADERS;
  const inm = String(req.headers["if-none-match"] ?? "");
  if (inm.trim() === "*" || inm.split(",").some((t) => t.trim() === etag)) {
    res.writeHead(304, { ...cacheHeaders, ETag: etag });
    return res.end();
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deadlineMs);
  res.once("close", () => {
    clearTimeout(timer);
    ctl.abort();
  });
  /** @type {Awaited<ReturnType<NonNullable<typeof drive>["getMedia"]>>} */
  let media;
  try {
    media = await drive.getMedia(driveFileId, { signal: ctl.signal });
  } catch (err) {
    clearTimeout(timer);
    const code = /** @type {DriveError} */ (err)?.code;
    log({ event: "photo_read_failed", code });
    if (res.headersSent || res.destroyed) return;
    if (code === "drive_not_found") return sendError(res, 404, "not_found");
    const config = ["drive_auth", "drive_forbidden", "drive_folder_not_found"];
    return config.includes(code)
      ? sendError(res, 503, "photos_unavailable")
      : sendError(res, 502, "photo_fetch_failed");
  }
  res.writeHead(200, {
    ...PHOTO_HEADERS,
    ETag: etag,
    ...(media.contentLength !== null && { "Content-Length": media.contentLength }),
  });
  try {
    await pipeline(Readable.fromWeb(/** @type {any} */ (media.body)), res, { signal: ctl.signal });
  } catch {
    log({ event: "photo_read_failed", code: "stream" });
  } finally {
    clearTimeout(timer);
  }
}
