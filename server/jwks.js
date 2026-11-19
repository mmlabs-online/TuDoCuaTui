// @ts-check
// JWKS key resolver for the Identity verifier (T-028.1; D50). A jose `JWTVerifyGetKey` with its own cache over
// `createLocalJWKSet`: fresh for 300 s, the last good set kept for up to 24 h while refetches fail, unknown `kid`
// refetches at most once a minute, one shared fetch for concurrent requests. When no usable set exists it throws
// `JwksUnavailable`. Logs only through the injected `log`, with fixed fields (never the URL, body or keys).
import { createLocalJWKSet } from "jose";

export const FRESH_MS = 300_000;
export const MAX_STALE_MS = 86_400_000;
export const COOLDOWN_MS = 60_000;
export const MAX_BYTES = 65_536;

/** Only EC P-256 signing keys are usable (ES256); everything else in the set is ignored. */
const isUsableKey = (/** @type {any} */ k) =>
  !!k &&
  typeof k === "object" &&
  k.kty === "EC" &&
  k.crv === "P-256" &&
  (k.use === undefined || k.use === "sig") &&
  (k.alg === undefined || k.alg === "ES256");

export class JwksUnavailable extends Error {}

class RefreshError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * @param {{ url: string | URL, fetch?: typeof globalThis.fetch, timeoutMs?: number, now?: () => number, log?: (entry: Record<string, unknown>) => void }} opts
 * @returns {import("jose").JWTVerifyGetKey}
 */
export function createJwksResolver({
  url,
  fetch: fetchFn = globalThis.fetch,
  timeoutMs,
  now = () => Date.now(),
  log,
}) {
  /** @type {import("jose").JWTVerifyGetKey | null} */
  let set = null;
  let fetchedAt = 0;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let failed = false;
  /** @type {Promise<void> | null} */
  let inflight = null;

  /** @returns {Promise<import("jose").JSONWebKeySet>} */
  async function download() {
    let res;
    try {
      res = await fetchFn(url, {
        headers: { "User-Agent": "tudocuatui-server", Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs ?? 5_000),
      });
    } catch (err) {
      const name = /** @type {{ name?: unknown }} */ (err)?.name;
      throw new RefreshError(
        name === "TimeoutError" || name === "AbortError" ? "timeout" : "network",
      );
    }
    if (res.status !== 200) throw new RefreshError("status");
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) throw new RefreshError("size");
    if (!res.body) throw new RefreshError("parse");
    /** @type {Uint8Array[]} */
    const chunks = [];
    let total = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          throw new RefreshError("size");
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof RefreshError) throw err;
      const name = /** @type {{ name?: unknown }} */ (err)?.name;
      throw new RefreshError(
        name === "TimeoutError" || name === "AbortError" ? "timeout" : "network",
      );
    }
    try {
      const bytes = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        bytes.set(c, off);
        off += c.byteLength;
      }
      const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!json || !Array.isArray(json.keys) || json.keys.length === 0) throw new Error("keys");
      const keys = json.keys.filter(isUsableKey);
      if (keys.length === 0) throw new Error("no usable key");
      return { keys };
    } catch {
      throw new RefreshError("parse");
    }
  }

  function refresh() {
    inflight ??= (async () => {
      lastAttemptAt = now();
      try {
        const json = await download();
        let next;
        try {
          next = createLocalJWKSet(json);
        } catch {
          throw new RefreshError("parse");
        }
        set = next;
        fetchedAt = now();
        failed = false;
      } catch (err) {
        failed = true;
        log?.({
          event: "jwks_refresh_failed",
          reason: err instanceof RefreshError ? err.reason : "network",
        });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  const canAttempt = () => !failed || now() - lastAttemptAt >= COOLDOWN_MS;

  return async (header, token) => {
    if ((!set || now() - fetchedAt > FRESH_MS) && canAttempt()) await refresh();
    if (!set || now() - fetchedAt > MAX_STALE_MS) throw new JwksUnavailable();
    try {
      return await set(header, token);
    } catch (err) {
      if (/** @type {{ code?: unknown }} */ (err)?.code !== "ERR_JWKS_NO_MATCHING_KEY") throw err;
      if (now() - lastAttemptAt >= COOLDOWN_MS) await refresh();
      if (!set || now() - fetchedAt > MAX_STALE_MS) throw new JwksUnavailable();
      try {
        return await set(header, token);
      } catch (err2) {
        // A rotated key we could not fetch must not read as a bad token (a 401 would sign the user out).
        if (failed && /** @type {{ code?: unknown }} */ (err2)?.code === "ERR_JWKS_NO_MATCHING_KEY")
          throw new JwksUnavailable();
        throw err2;
      }
    }
  };
}
