// @ts-check
// Google Drive v3 client for item photos (D27). Plain fetch, scope drive.file, no dependency.
// Secrets come from runtime env only. Errors carry a fixed code and nothing else: no message text from Google,
// no URL, no headers, no cause. Log entries hold {event, op, status, code, reason} only.
import { randomBytes } from "node:crypto";

export class DriveConfigError extends Error {}

/** @typedef {"drive_not_configured"|"drive_auth"|"drive_not_found"|"drive_forbidden"|"drive_rate_limited"|"drive_unavailable"|"drive_too_large"|"drive_bad_response"|"drive_folder_not_found"} DriveCode */

export class DriveError extends Error {
  /** @param {DriveCode} code @param {number} [status] */
  constructor(code, status) {
    super(code);
    this.name = "DriveError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "DRIVE_FOLDER_ID",
];
const FOLDER_RE = /^[A-Za-z0-9_-]{10,200}$/;
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const MIME_RE = /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/;
const MAX_BYTES = 5 * 1024 * 1024;
const REASONS = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "storageQuotaExceeded",
  "insufficientFilePermissions",
  "notFound",
  "authError",
  "backendError",
]);
const AUTH_REASONS = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

/**
 * An empty string counts as unset. All four unset: off. All four set and valid: on. Anything else throws, naming
 * variables only, never values.
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode: "off" } | { mode: "on", clientId: string, clientSecret: string, refreshToken: string, folderId: string }}
 */
export function loadDriveConfig(env) {
  const vals = NAMES.map((n) => env[n] || "");
  const missing = NAMES.filter((_, i) => !vals[i]);
  if (missing.length === NAMES.length) return { mode: "off" };
  if (missing.length > 0) {
    throw new DriveConfigError(`Google Drive config is incomplete, missing: ${missing.join(", ")}`);
  }
  const bad = NAMES.filter((_, i) => /\s/.test(vals[i]));
  const [clientId, clientSecret, refreshToken, folderId] = vals;
  if (!bad.includes(NAMES[0]) && !clientId.endsWith(".apps.googleusercontent.com")) {
    bad.push(NAMES[0]);
  }
  if (!bad.includes(NAMES[3]) && !FOLDER_RE.test(folderId)) bad.push(NAMES[3]);
  if (bad.length > 0)
    throw new DriveConfigError(`malformed Google Drive config: ${bad.join(", ")}`);
  return { mode: "on", clientId, clientSecret, refreshToken, folderId };
}

/** @param {string} text @returns {string | undefined} an allowlisted reason */
function reasonOf(text) {
  /** @type {any} */
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return undefined;
  }
  const r = j?.error?.errors?.[0]?.reason ?? (typeof j?.error === "string" ? j.error : undefined);
  if (typeof r !== "string") return undefined;
  return REASONS.has(r) ? r : "other";
}

/**
 * @param {{
 *   config: { clientId: string, clientSecret: string, refreshToken: string, folderId: string },
 *   fetch?: typeof fetch, now?: () => number, sleep?: (ms: number) => Promise<void>, random?: () => number,
 *   log?: (entry: Record<string, unknown>) => void,
 *   tokenUrl?: string, apiBase?: string, uploadBase?: string,
 *   timeouts?: { token?: number, meta?: number, upload?: number, headers?: number },
 * }} opts
 */
export function createDriveClient({
  config,
  fetch: doFetch = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
  log = () => {},
  tokenUrl = "https://oauth2.googleapis.com/token",
  apiBase = "https://www.googleapis.com/drive/v3",
  uploadBase = "https://www.googleapis.com/upload/drive/v3",
  timeouts = {},
}) {
  const t = { token: 10_000, meta: 10_000, upload: 30_000, headers: 10_000, ...timeouts };
  const MAX_ATTEMPTS = 3;
  /** @type {{ token: string, expires: number } | null} */
  let cached = null;
  /** @type {Promise<string> | null} */
  let inflight = null;
  let cooldownUntil = 0;

  /** @param {string} op @param {number | undefined} status @param {string} code @param {string} [reason] */
  const note = (op, status, code, reason) => {
    /** @type {Record<string, unknown>} */
    const entry = { event: "drive", op, code };
    if (status !== undefined) entry.status = status;
    if (reason !== undefined) entry.reason = reason;
    log(entry);
  };

  /** @param {Response} res @param {number} attempt */
  const backoff = (res, attempt) => {
    const ra = Number(res.headers.get("retry-after"));
    if (res.headers.get("retry-after") && Number.isFinite(ra) && ra >= 0)
      return Math.min(ra, 10) * 1000;
    return 500 * 2 ** attempt + Math.floor(random() * 250);
  };

  /**
   * One fetch with a timeout. `streaming`: the timer covers only the headers; the caller's signal then owns the body.
   * @param {string} url @param {RequestInit} init @param {number} ms @param {AbortSignal | undefined} signal
   * @param {boolean} streaming
   * @returns {Promise<{ res: Response, text: string }>}
   */
  async function once(url, init, ms, signal, streaming) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    const onAbort = () => ctl.abort();
    if (signal?.aborted) ctl.abort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await doFetch(url, { ...init, signal: ctl.signal });
      if (streaming && res.ok) {
        clearTimeout(timer);
        return { res, text: "" };
      }
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timer);
      if (!streaming) signal?.removeEventListener("abort", onAbort);
    }
  }

  async function refresh() {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }).toString();
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= MAX_ATTEMPTS - 1;
      /** @type {{ res: Response, text: string }} */
      let r;
      try {
        r = await once(
          tokenUrl,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          },
          t.token,
          undefined,
          false,
        );
      } catch {
        note("token", undefined, "drive_unavailable");
        if (last) throw new DriveError("drive_unavailable");
        await sleep(500 * 2 ** attempt + Math.floor(random() * 250));
        continue;
      }
      const { res, text } = r;
      if (res.ok) {
        /** @type {any} */
        let j;
        try {
          j = JSON.parse(text);
        } catch {
          j = null;
        }
        if (!j || typeof j.access_token !== "string" || !j.access_token) {
          note("token", res.status, "drive_bad_response");
          throw new DriveError("drive_bad_response");
        }
        const secs = typeof j.expires_in === "number" ? j.expires_in : 3600;
        cached = { token: j.access_token, expires: now() + Math.max(0, secs - 60) * 1000 };
        return j.access_token;
      }
      const reason = reasonOf(text);
      if (res.status === 429 || res.status >= 500) {
        note("token", res.status, "drive_unavailable", reason);
        if (last)
          throw new DriveError(
            res.status === 429 ? "drive_rate_limited" : "drive_unavailable",
            res.status,
          );
        await sleep(backoff(res, attempt));
        continue;
      }
      if (reason && AUTH_REASONS.has(reason)) cooldownUntil = now() + 60_000;
      note("token", res.status, "drive_auth", reason);
      throw new DriveError("drive_auth", res.status);
    }
  }

  /** @returns {Promise<string>} */
  function getToken() {
    if (now() < cooldownUntil) return Promise.reject(new DriveError("drive_auth"));
    if (cached && now() < cached.expires) return Promise.resolve(cached.token);
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  /**
   * @param {string} op
   * @param {{ method: string, url: string, headers?: Record<string, string>, body?: Uint8Array, timeoutMs: number,
   *   retry: boolean, signal?: AbortSignal, streaming?: boolean }} o
   */
  async function request(op, o) {
    let authRetried = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken();
      const last = !o.retry || attempt >= MAX_ATTEMPTS - 1;
      /** @type {{ res: Response, text: string }} */
      let r;
      try {
        r = await once(
          o.url,
          {
            method: o.method,
            headers: { ...o.headers, authorization: `Bearer ${token}` },
            body: o.body,
          },
          o.timeoutMs,
          o.signal,
          o.streaming === true,
        );
      } catch {
        note(op, undefined, "drive_unavailable");
        if (o.signal?.aborted || last) throw new DriveError("drive_unavailable");
        await sleep(500 * 2 ** attempt + Math.floor(random() * 250));
        continue;
      }
      const { res, text } = r;
      if (res.ok) return r;
      const reason = reasonOf(text);
      const status = res.status;
      if (status === 401) {
        note(op, status, "drive_auth", reason);
        if (authRetried) throw new DriveError("drive_auth", status);
        authRetried = true;
        cached = null;
        attempt--;
        continue;
      }
      const rate =
        status === 429 || (status === 403 && reason !== undefined && RATE_REASONS.has(reason));
      const server = status >= 500;
      if (rate || (server && o.retry)) {
        const code = rate ? "drive_rate_limited" : "drive_unavailable";
        note(op, status, code, reason);
        if (last) throw new DriveError(code, status);
        await sleep(backoff(res, attempt));
        continue;
      }
      /** @type {DriveCode} */
      const code =
        status === 404
          ? "drive_not_found"
          : status === 403
            ? "drive_forbidden"
            : server
              ? "drive_unavailable"
              : "drive_bad_response";
      note(op, status, code, reason);
      throw new DriveError(code, status);
    }
  }

  /** @param {string} id */
  const fileUrl = (id) => {
    if (typeof id !== "string" || !FILE_ID_RE.test(id)) throw new DriveError("drive_not_found");
    return `${apiBase}/files/${encodeURIComponent(id)}`;
  };

  return {
    /**
     * Never retried on 5xx, network errors or timeouts (not idempotent); a 401 is refreshed and retried once.
     * @param {{ name: string, mimeType: string, bytes: Uint8Array, appProperties?: Record<string, string> }} f
     * @returns {Promise<{ id: string, size: number, mimeType: string }>}
     */
    async createFile({ name, mimeType, bytes, appProperties }) {
      if (bytes.byteLength > MAX_BYTES) throw new DriveError("drive_too_large");
      if (!MIME_RE.test(mimeType)) throw new DriveError("drive_bad_response");
      const boundary = `tudo${randomBytes(12).toString("hex")}`;
      const meta = JSON.stringify({ name, mimeType, parents: [config.folderId], appProperties });
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
            `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const { text } = await request("create", {
        method: "POST",
        url: `${uploadBase}/files?uploadType=multipart&fields=id,size,mimeType`,
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body,
        timeoutMs: t.upload,
        retry: false,
      });
      /** @type {any} */
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        j = null;
      }
      if (!j || typeof j.id !== "string" || !j.id) {
        note("create", 200, "drive_bad_response");
        throw new DriveError("drive_bad_response");
      }
      return { id: j.id, size: Number(j.size), mimeType: String(j.mimeType ?? mimeType) };
    },

    /**
     * The body is a web stream owned by the caller; `signal` aborts it.
     * @param {string} id @param {{ signal?: AbortSignal }} [opts]
     * @returns {Promise<{ body: ReadableStream<Uint8Array>, contentType: string | null, contentLength: number | null }>}
     */
    async getMedia(id, { signal } = {}) {
      const { res } = await request("get", {
        method: "GET",
        url: `${fileUrl(id)}?alt=media`,
        timeoutMs: t.headers,
        retry: true,
        signal,
        streaming: true,
      });
      if (!res.body) throw new DriveError("drive_bad_response");
      const len = res.headers.get("content-length");
      return {
        body: res.body,
        contentType: res.headers.get("content-type"),
        contentLength: len !== null && /^\d+$/.test(len) ? Number(len) : null,
      };
    },

    /** Permanent delete; an already-gone file counts as success. @param {string} id */
    async deleteFile(id) {
      try {
        await request("delete", {
          method: "DELETE",
          url: fileUrl(id),
          timeoutMs: t.meta,
          retry: true,
        });
      } catch (err) {
        if (err instanceof DriveError && err.code === "drive_not_found") return;
        throw err;
      }
    },

    /** The configured folder must exist, be a folder and not be trashed. */
    async checkFolder() {
      try {
        const { text } = await request("folder", {
          method: "GET",
          url: `${fileUrl(config.folderId)}?fields=id,mimeType,trashed`,
          timeoutMs: t.meta,
          retry: true,
        });
        /** @type {any} */
        let j;
        try {
          j = JSON.parse(text);
        } catch {
          throw new DriveError("drive_bad_response");
        }
        if (j?.mimeType !== "application/vnd.google-apps.folder" || j?.trashed === true) {
          throw new DriveError("drive_folder_not_found");
        }
      } catch (err) {
        if (err instanceof DriveError && err.code === "drive_not_found")
          throw new DriveError("drive_folder_not_found");
        throw err;
      }
    },
  };
}
