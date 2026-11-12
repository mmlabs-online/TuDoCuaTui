// @ts-check
// PUT / DELETE /api/items/:id/photo (D27). The browser sends the resized JPEG; Drive file ids never leave the server.
// Lock rule: every writer of item_photos locks the items row first (items -> item_photos), so writers never deadlock.
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DriveError } from "./drive.js";
import { dbLogFields, mapDbError } from "./errors.js";
import { sendError, sendJson } from "./http.js";
import { getItem } from "./items.js";
import { isUuid } from "./validate.js";

const MAX_BYTES = 2 * 1024 * 1024;
const BODY_DEADLINE_MS = 30_000;
const MAX_IN_FLIGHT = 3;
let inFlight = 0;

/** @typedef {{ id: string, drive_file_id: string | null }} PhotoRef */

/**
 * The request body is not (fully) read: answer, then close the socket once the response is flushed.
 * @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res
 * @param {number} status @param {string} code @param {Record<string, string>} [headers]
 */
function rejectUnread(req, res, status, code, headers = {}) {
  res.once("finish", () => req.socket.destroy());
  return sendError(res, status, code, {}, { Connection: "close", ...headers });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{ ok: true, bytes: Buffer } | { ok: false, status: number, code: string }>}
 */
function readBody(req) {
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
      req.pause();
      resolve(r);
    };
    const bad = { ok: /** @type {const} */ (false), status: 400, code: "invalid_photo" };
    const timer = setTimeout(
      () => finish({ ok: false, status: 408, code: "request_timeout" }),
      BODY_DEADLINE_MS,
    );
    req.on("data", (chunk) => {
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
 * Runs `fn` in a transaction with the item row locked. `fn` gets the client; a missing item returns null.
 * @param {import("./items.js").Pool} pool @param {string} itemId
 * @param {(client: any) => Promise<void>} fn @returns {Promise<boolean>} false when the item does not exist
 */
async function withLockedItem(pool, itemId, fn) {
  if (!pool.connect) throw new Error("pool has no connect()");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const lock = await client.query("select id from items where id = $1 for update", [itemId]);
    if (lock.rowCount === 0) {
      await client.query("rollback");
      client.release();
      return false;
    }
    await fn(client);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    client.release(/** @type {any} */ (err));
    throw err;
  }
  client.release();
  return true;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   pool: import("./items.js").Pool | null,
 *   drive: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   itemId: string, query: string, id: string, log: (entry: Record<string, unknown>) => void,
 * }} ctx
 */
export async function handlePhoto(req, res, { pool, drive, itemId, query, id, log }) {
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
  if (put && inFlight >= MAX_IN_FLIGHT) {
    return rejectUnread(req, res, 503, "photos_unavailable", { "Retry-After": "5" });
  }

  try {
    if (!put) {
      /** @type {PhotoRef[]} */
      let old = [];
      await withLockedItem(pool, itemId, async (c) => {
        old = (
          await c.query(
            "delete from item_photos where item_id = $1 and id = $2 returning id, drive_file_id",
            [itemId, expected],
          )
        ).rows;
      });
      await deleteDriveFiles(drive, old, log);
      res.writeHead(204, { "Cache-Control": "no-store" });
      return res.end();
    }

    inFlight++;
    try {
      return await putPhoto(req, res, { pool, drive, itemId, id, log });
    } finally {
      inFlight--;
    }
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    return sendError(res, mapped.status, mapped.code, extra);
  }
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {any} ctx */
async function putPhoto(req, res, { pool, drive, itemId, log }) {
  const body = await readBody(req);
  if (!body.ok) {
    return body.status === 400
      ? sendError(res, 400, body.code)
      : rejectUnread(req, res, body.status, body.code);
  }
  const { bytes } = body;
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return sendError(res, 400, "invalid_photo");
  }
  const exists = await pool.query("select 1 from items where id = $1", [itemId]);
  if (exists.rowCount === 0) return sendError(res, 404, "not_found");

  const photoId = randomUUID();
  /** @type {{ id: string }} */
  let file;
  try {
    file = await drive.createFile({
      name: `${photoId}.jpg`,
      mimeType: "image/jpeg",
      bytes,
      appProperties: { app: "tudo", photoId, itemId },
    });
  } catch (err) {
    const code = /** @type {DriveError} */ (err)?.code;
    log({ event: "photo_upload_failed", code });
    const config = ["drive_auth", "drive_forbidden", "drive_not_found", "drive_folder_not_found"];
    return config.includes(code)
      ? sendError(res, 503, "photos_unavailable")
      : sendError(res, 502, "photo_upload_failed");
  }

  /** @type {PhotoRef[]} */
  let old = [];
  let found;
  try {
    found = await withLockedItem(pool, itemId, async (c) => {
      old = (
        await c.query("delete from item_photos where item_id = $1 returning id, drive_file_id", [
          itemId,
        ])
      ).rows;
      await c.query(
        "insert into item_photos (id, item_id, drive_file_id, is_primary) values ($1, $2, $3, true)",
        [photoId, itemId, file.id],
      );
    });
  } catch (err) {
    await deleteDriveFiles(drive, [{ id: photoId, drive_file_id: file.id }], log);
    throw err;
  }
  if (!found) {
    await deleteDriveFiles(drive, [{ id: photoId, drive_file_id: file.id }], log);
    return sendError(res, 404, "not_found");
  }
  await deleteDriveFiles(drive, old, log);
  const item = await getItem(pool, itemId);
  return item ? sendJson(res, 200, { item }) : sendError(res, 404, "not_found");
}

const PHOTO_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "private, max-age=31536000, immutable",
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
 *   drive: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   photoId: string, id: string, log: (entry: Record<string, unknown>) => void, deadlineMs?: number,
 * }} ctx
 */
export async function servePhoto(req, res, { pool, drive, photoId, id, log, deadlineMs = 30_000 }) {
  if (!drive) return sendError(res, 503, "photos_unavailable");
  if (!pool) return sendError(res, 503, "db_unavailable");
  let driveFileId;
  try {
    const r = await pool.query("select drive_file_id from item_photos where id = $1", [photoId]);
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
