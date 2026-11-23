// @ts-check
// Request router: health, readiness, /api guard, static SPA. Injectable for tests.
import { randomUUID } from "node:crypto";
import { createAppKeyStore } from "./ai/appKeys.js";
import { createCreditAdmin } from "./ai/creditAdmin.js";
import { createSpendMeter } from "./ai/spend.js";
import { createAiStore } from "./ai/store.js";
import { createLimiter } from "./ai/rateLimit.js";
import { handleApi } from "./api.js";
import { createFolderResolver } from "./driveFolders.js";
import { ping } from "./db.js";
import { createInFlight } from "./inflight.js";
import { SECURITY_HEADERS, sendError, sendJson } from "./http.js";
import { RESTORE_BODY_TIMEOUTS, RESTORE_GLOBAL_LIMITS, RESTORE_LIMITS } from "./backup.js";
import { BODY_TIMEOUTS } from "./photos.js";
import { createPhotoQuota, PHOTO_LIMITS } from "./photoQuota.js";
import { createWeather } from "./weather.js";
import { serveStatic } from "./static.js";

/**
 * @param {{
 *   pool: { query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> } | null,
 *   distDir: string,
 *   ai?: { kek: import("./ai/crypto.js").AiKek, store?: import("./ai/store.js").AiStore, appKeys?: ReturnType<typeof import("./ai/appKeys.js").createAppKeyStore>, fetch?: typeof globalThis.fetch } | null,
 *   creditAdmin?: ReturnType<typeof import("./ai/creditAdmin.js").createCreditAdmin> | null,
 *   spendMeter?: import("./ai/spend.js").SpendMeter | null,
 *   drive?: ReturnType<typeof import("./drive.js").createDriveClient> | null,
 *   auth: import("./auth.js").Auth,
 *   authMode?: string,
 *   log: (entry: Record<string, unknown>) => void,
 *   now?: () => number,
 *   ownerSub?: string | null,
 *   bodyTimeouts?: { totalMs: number, idleMs: number },
 *   photoLimits?: { storedMax: number, dailyMax: number, windowMs: number },
 *   restoreBodyTimeouts?: { totalMs: number, idleMs: number },
 *   weatherFetch?: typeof globalThis.fetch,
 * }} deps
 */
export function createApp({
  pool,
  distDir,
  ai = null,
  drive = null,
  auth,
  authMode = "identity",
  log,
  now = () => Date.now(),
  creditAdmin = pool ? createCreditAdmin(pool, { now }) : null,
  spendMeter = pool ? createSpendMeter(pool, { now }) : null,
  ownerSub = null,
  bodyTimeouts = BODY_TIMEOUTS,
  photoLimits = PHOTO_LIMITS,
  restoreBodyTimeouts = RESTORE_BODY_TIMEOUTS,
  weatherFetch = globalThis.fetch,
}) {
  // Weather (F-704.2): one cache and one limiter per app instance, independent of the pool and the AI context.
  const weather = createWeather({ fetch: weatherFetch, now, ownerSub });
  // Uploads in flight: 2 per user, 3 in total (3 x 2 MiB in memory). The owner has its own lane.
  const photoSlots = createInFlight({ perUser: 2, total: 3, exempt: ownerSub });
  // Per-user stored cap and daily upload count (T-019.14); the owner is exempt (it is Ming's Drive).
  const photoQuota = createPhotoQuota({ ...photoLimits, now, exempt: ownerSub });
  // One folder-id cache per app instance (T-021).
  const folders = drive ? createFolderResolver({ drive }) : null;
  // Restore: one in flight per user and in total (the pool has 5 connections), 10 per hour per user (F-602).
  const backup = {
    slots: createInFlight({ perUser: 1, total: 1, exempt: ownerSub }),
    limiter: createLimiter({
      now,
      ownerSub,
      limits: RESTORE_LIMITS,
      globalLimits: RESTORE_GLOBAL_LIMITS,
    }),
    timeouts: restoreBodyTimeouts,
  };
  const aiContext = ai && {
    kek: ai.kek,
    store: ai.store ?? (pool ? createAiStore(pool) : null),
    appKeys:
      ai.appKeys ??
      (pool ? createAppKeyStore(pool, ai.kek, { fetch: ai.fetch ?? globalThis.fetch }) : null),
    limiter: createLimiter({ now, ownerSub }),
    // Tag-photo calls in flight: 1 per user, 2 in total (this app instance).
    tagSlots: createInFlight({ perUser: 1, total: 2, exempt: ownerSub }),
    // Outfit-suggestion calls in flight, separate from tagging: 1 per user, 2 in total (F-704.3).
    suggestSlots: createInFlight({ perUser: 1, total: 2, exempt: ownerSub }),
    bodyTimeouts,
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
        if (pathname === "/healthz") return sendJson(res, 200, { status: "ok", auth: authMode });
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
        const result = await auth.authenticate(req);
        if (!result.ok) {
          if (result.unavailable) {
            log({ event: "auth_unavailable", code: result.code });
            return sendError(res, 503, "auth_unavailable", {}, { "Retry-After": "30" });
          }
          log({ event: "auth_denied", code: result.code });
          return sendError(res, 401, "unauthorized");
        }
        return await handleApi(req, res, {
          pool,
          userId: result.userId,
          email: result.email,
          ownerSub,
          creditAdmin,
          spendMeter,
          ai: aiContext,
          drive,
          folders,
          photoSlots,
          photoQuota,
          backup,
          weather,
          bodyTimeouts,
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
