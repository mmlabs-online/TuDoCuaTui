// @ts-check
// /api router. Called by app.js only after the access check, with the raw pathname (never decoded).
import { dbLogFields, mapDbError } from "./errors.js";
import { readJson, sendError, sendJson } from "./http.js";
import { deleteDriveFiles, handlePhoto, servePhoto } from "./photos.js";
import { listItems, listLocations, removeItem, saveItem, wearItem } from "./items.js";
import { isUuid, parseItemInput, parseWearInput } from "./validate.js";

/** @param {string[]} parts @returns {{ route: string, allow: string } | null} */
function match(parts) {
  const [empty, api, a, b, c] = parts;
  if (empty !== "" || api !== "api") return null;
  if (parts.length === 3 && a === "items") return { route: "/api/items", allow: "GET" };
  if (parts.length === 3 && a === "locations") return { route: "/api/locations", allow: "GET" };
  if (parts.length === 4 && a === "items" && b) {
    return { route: "/api/items/:id", allow: "PUT, DELETE" };
  }
  if (parts.length === 4 && a === "photos" && b) return { route: "/api/photos/:id", allow: "GET" };
  if (parts.length === 5 && a === "items" && b && c === "photo") {
    return { route: "/api/items/:id/photo", allow: "PUT, DELETE" };
  }
  if (parts.length === 5 && a === "items" && b && c === "wear") {
    return { route: "/api/items/:id/wear", allow: "POST" };
  }
  return null;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   pool: import("./items.js").Pool | null,
 *   drive: ReturnType<typeof import("./drive.js").createDriveClient> | null, pathname: string, query: string, id: string,
 *   log: (entry: Record<string, unknown>) => void, now: () => number,
 *   setRoute: (template: string) => void,
 * }} ctx
 */
export async function handleApi(
  req,
  res,
  { pool, drive, pathname, query, id, log, now, setRoute },
) {
  const parts = pathname.split("/");
  const m = match(parts);
  if (!m) {
    setRoute("/api");
    return sendError(res, 404, "not_found");
  }
  setRoute(m.route);
  const method = req.method ?? "";
  if (!m.allow.split(", ").includes(method)) {
    return sendError(res, 405, "method_not_allowed", {}, { Allow: m.allow });
  }
  const write = method !== "GET";
  const site = req.headers["sec-fetch-site"];
  if (write && (site === "cross-site" || site === "same-site")) {
    return sendError(res, 403, "forbidden_origin");
  }
  const itemId = parts[3];
  if (itemId !== undefined && !isUuid(itemId)) {
    return sendError(res, 400, "invalid_input", { field: "id", reason: "idInvalid" });
  }
  if (m.route === "/api/photos/:id") {
    return servePhoto(req, res, {
      pool,
      drive,
      photoId: /** @type {string} */ (itemId),
      id,
      log,
    });
  }
  if (m.route === "/api/items/:id/photo") {
    return handlePhoto(req, res, {
      pool,
      drive,
      itemId: /** @type {string} */ (itemId),
      query,
      id,
      log,
    });
  }

  /** @type {unknown} */
  let input;
  if (method === "PUT" || method === "POST") {
    const body = await readJson(req);
    if (!body.ok) {
      /** @type {Record<string, string>} */
      const headers = body.status === 413 ? { Connection: "close" } : {};
      // The rest of an over-cap upload is never read: close the socket once the 413 is flushed.
      if (body.status === 413) res.once("finish", () => req.socket.destroy());
      return sendError(res, body.status, body.code, {}, headers);
    }
    const parsed =
      method === "PUT" ? parseItemInput(body.value) : parseWearInput(body.value, now());
    if (!parsed.ok) {
      return sendError(res, 400, "invalid_input", { field: parsed.field, reason: parsed.reason });
    }
    input = parsed.value;
  }
  if (!pool) return sendError(res, 503, "db_unavailable");

  try {
    if (m.route === "/api/items" || m.route === "/api/locations") {
      return m.route === "/api/items"
        ? sendJson(res, 200, { items: await listItems(pool) })
        : sendJson(res, 200, { locations: await listLocations(pool) });
    }
    if (method === "DELETE") {
      const photos = await removeItem(pool, itemId);
      await deleteDriveFiles(drive, photos, log);
      res.writeHead(204, { "Cache-Control": "no-store" });
      return res.end();
    }
    if (method === "PUT") {
      const item = await saveItem(pool, itemId, /** @type {Record<string, any>} */ (input));
      return item ? sendJson(res, 200, { item }) : sendError(res, 404, "not_found");
    }
    const w = /** @type {{ delta: 1 | -1, today: string }} */ (input);
    const stats = await wearItem(pool, itemId, w.delta, w.today);
    return stats ? sendJson(res, 200, stats) : sendError(res, 404, "not_found");
  } catch (err) {
    const mapped = mapDbError(err);
    log({ event: "db_error", id, ...dbLogFields(err) });
    const extra = mapped.code === "internal" ? { requestId: id } : {};
    return sendError(res, mapped.status, mapped.code, extra);
  }
}
