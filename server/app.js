// @ts-check
// Request router: health, readiness, /api guard, static SPA. Injectable for tests.
import { randomUUID } from "node:crypto";
import { ping } from "./db.js";
import { SECURITY_HEADERS, sendError, sendJson } from "./http.js";
import { serveStatic } from "./static.js";

/**
 * @param {{
 *   pool: { query(sql: string): Promise<unknown> } | null,
 *   distDir: string,
 *   access: { verify(req: import("node:http").IncomingMessage): Promise<{ ok: boolean, code?: string }> } | null,
 *   log: (entry: Record<string, unknown>) => void,
 * }} deps
 */
export function createApp({ pool, distDir, access, log }) {
  return async function handler(
    /** @type {import("node:http").IncomingMessage} */ req,
    /** @type {import("node:http").ServerResponse} */ res,
  ) {
    const id = randomUUID();
    const started = Date.now();
    let route = "static";
    res.setHeader("X-Request-Id", id);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.on("finish", () => {
      log({
        ts: new Date().toISOString(),
        id,
        method: req.method,
        route,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });

    try {
      const pathname = (req.url ?? "/").split("?")[0].split("#")[0];
      const isRead = req.method === "GET" || req.method === "HEAD";

      if (pathname === "/healthz" || pathname === "/readyz") {
        route = pathname;
        if (!isRead) return sendError(res, 405, "method_not_allowed", {}, { Allow: "GET, HEAD" });
        if (pathname === "/healthz") return sendJson(res, 200, { status: "ok" });
        try {
          if (!pool) throw new Error("no pool");
          await ping(pool);
          return sendJson(res, 200, { status: "ready" });
        } catch (err) {
          log({ event: "readyz_failed", code: /** @type {{ code?: string }} */ (err)?.code });
          return sendJson(res, 503, { status: "unavailable" });
        }
      }

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        route = "/api";
        if (access) {
          const result = await access.verify(req);
          if (!result.ok) {
            log({ event: "access_denied", code: result.code });
            return sendError(res, 401, "unauthorized");
          }
        }
        return sendError(res, 404, "not_found"); // T-013.2 mounts the API router here.
      }

      if (!isRead) return sendError(res, 405, "method_not_allowed", {}, { Allow: "GET, HEAD" });
      await serveStatic(req, res, distDir, pathname);
    } catch (err) {
      log({
        event: "unhandled",
        name: /** @type {Error} */ (err)?.name,
        code: /** @type {{ code?: string }} */ (err)?.code,
      });
      if (!res.headersSent) sendError(res, 500, "internal", { requestId: id });
      else res.destroy();
    }
  };
}
