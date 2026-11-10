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
