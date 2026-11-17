// @ts-check
// Shared by the provider adapters: read at most maxBytes of a response body and parse it as JSON.

/**
 * Reads at most `maxBytes` of the body and parses it; null when over the cap (reader cancelled), not JSON or no body.
 * @param {Response} res
 * @param {number} maxBytes
 * @returns {Promise<unknown>}
 */
export async function readCapped(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return null;
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
