// @ts-check
// Request router: health, readiness, /api guard, static SPA. Injectable for tests.
import { randomUUID } from "node:crypto";
import { createAiStore } from "./ai/store.js";
import { createLimiter } from "./ai/rateLimit.js";
import { handleApi } from "./api.js";
import { ping } from "./db.js";
import { SECURITY_HEADERS, sendError, sendJson } from "./http.js";
import { serveStatic } from "./static.js";

/**
 * @param {{
 *   pool: { query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> } | null,
 *   distDir: string,
 *   ai?: { kek: import("./ai/crypto.js").AiKek, store?: import("./ai/store.js").AiStore, fetch?: typeof globalThis.fetch } | null,
 *   drive?: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   access: { verify(req: import("node:http").IncomingMessage): Promise<{ ok: boolean, code?: string }> } | null,
 *   log: (entry: Record<string, unknown>) => void,
 *   now?: () => number,
 * }} deps
 */
export function createApp({
  pool,
  distDir,
  ai = null,
  drive = null,
  access,
  log,
  now = () => Date.now(),
}) {
  const aiContext = ai && {
    kek: ai.kek,
    store: ai.store ?? (pool ? createAiStore(pool) : null),
    limiter: createLimiter({ now }),
    fetch: ai.fetch ?? globalThis.fetch,
  };
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
      const url = req.url ?? "/";
      if (!url.startsWith("/")) return sendError(res, 400, "bad_request"); // absolute-form, "*"
      const pathname = url.split("?")[0].split("#")[0];
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
        return await handleApi(req, res, {
          pool,
          ai: aiContext,
          drive,
          pathname,
          query: url.split("#")[0].split("?").slice(1).join("?"),
          id,
          log,
          now,
          setRoute: (t) => {
            route = t;
          },
        });
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
