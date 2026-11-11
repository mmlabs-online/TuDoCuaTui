// @ts-check
// Small response helpers shared by the router and (later) the API handlers.

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {Record<string, unknown>} [extra]
 * @param {Record<string, string>} [headers]
 */
export function sendError(res, status, code, extra = {}, headers = {}) {
  sendJson(res, status, { error: { code, ...extra } }, headers);
}

/**
 * Reads a JSON request body (application/json only, size-limited, strict UTF-8).
 * @param {import("node:http").IncomingMessage} req
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ ok: true, value: unknown } | { ok: false, status: number, code: string }>}
 */
export async function readJson(req, { limit = 262144 } = {}) {
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, status: 415, code: "unsupported_media_type" };
  }
  const tooBig = { ok: /** @type {const} */ (false), status: 413, code: "payload_too_large" };
  if (Number(req.headers["content-length"]) > limit) return tooBig;
  /** @type {Buffer[]} */
  const chunks = [];
  let total = 0;
  // Events instead of `for await`: breaking out of the iterator would destroy the socket and lose the 413.
  const overflow = await new Promise((resolve) => {
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        req.removeAllListeners("data");
        req.pause();
        resolve(true);
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(false));
    req.on("error", () => resolve(false));
  });
  if (overflow) return tooBig;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, code: "invalid_json" };
  }
}
