// @ts-check
// The one paid-call runner for tag-photo and suggest-outfits (F-706.4, D52, D53, D54).
// Order: Idempotency-Key -> shared key -> credit reserve (replay answers here) -> spend reserve (the cap) ->
// input -> provider call -> settle spend -> commit or refund. Every ledger and meter call is its own short
// transaction, so no transaction spans the provider call. Credits are refunded on any failure; a failed call's
// spend estimate stays in the meter unless the provider confirmed no charge (spend.js decides from the outcome).
// Nothing here logs or returns the key, the input or the result except as the response body.
import { createHash } from "node:crypto";
import { sendJson } from "../http.js";
import { AI_ERROR_STATUS } from "./catalog.js";
import { isValidOpKey } from "./credits.js";
import { SHARED_TEXT } from "./shared.js";

/** @param {Buffer | Uint8Array} bytes @returns {string} sha256 as lowercase hex */
export const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Hash of a JSON value; callers pass objects with a fixed key order. @param {unknown} value */
export const hashJson = (value) => hashBytes(Buffer.from(JSON.stringify(value)));

/** @param {import("node:http").IncomingHttpHeaders} headers */
export function parseOpKey(headers) {
  const v = headers["idempotency-key"];
  return typeof v === "string" && isValidOpKey(v)
    ? { ok: /** @type {const} */ (true), opKey: v }
    : { ok: /** @type {const} */ (false) };
}

/**
 * A reserve result that stops the call, as an HTTP answer; null when the call may go on (reserved or replay).
 * @param {{ status: string }} r @returns {{ status: number, code: string } | null}
 */
export function mapReserve(r) {
  if (r.status === "insufficient") return { status: 402, code: "credits_exhausted" };
  if (r.status === "welcome_pending") return { status: 402, code: "welcome_pending" };
  if (r.status === "op_key_mismatch") return { status: 400, code: "bad_request" };
  return null;
}

/**
 * What a replayed key answers. `compare`: the op is committed, so the caller checks the request hash and sends the
 * stored result. `expire`: a reservation that outlived its TTL (a crash mid-call): refund it, answer 502.
 * @param {{ state: string, expired: boolean, errorCode: string | null }} op
 * @returns {{ action: "compare" } | { action: "expire" } | { action: "respond", status: number, code: string, headers?: Record<string, string> }}
 */
export function replayAnswer(op) {
  if (op.state === "committed") return { action: "compare" };
  if (op.state === "refunded") {
    const code = op.errorCode && op.errorCode in AI_ERROR_STATUS ? op.errorCode : null;
    return code
      ? {
          action: "respond",
          status: AI_ERROR_STATUS[/** @type {keyof typeof AI_ERROR_STATUS} */ (code)],
          code,
        }
      : { action: "respond", status: 502, code: "provider_unavailable" };
  }
  if (op.expired) return { action: "expire" };
  return { action: "respond", status: 503, code: "ai_busy", headers: { "Retry-After": "5" } };
}

/** @param {string} code "ok" or an AiErrorCode (or "not_sent") */
export function settleOutcome(code) {
  return code === "ok"
    ? { spend: "ok", credits: /** @type {const} */ ("commit") }
    : { spend: code, credits: /** @type {const} */ ("refund") };
}

/**
 * @typedef {{ ok: true, hash: string, input: any } | { ok: false, status: number, code: string, close?: boolean }} PaidInput
 * @typedef {{
 *   ai: import("./routes.js").AiContext, userId: string, opKey: string, kind: "photo_fill" | "suggest",
 *   res: import("node:http").ServerResponse,
 *   log: (entry: Record<string, unknown>) => void, id: string,
 *   unread: () => boolean,
 *   reject: (status: number, code: string, headers?: Record<string, string>) => unknown,
 *   fail: (status: number, code: string, headers?: Record<string, string>) => unknown,
 *   done: (code: string) => void,
 *   getInput: () => Promise<PaidInput>,
 *   call: (p: { key: string, model: string, input: any, signal: AbortSignal }) => Promise<{ ok: true, result: unknown } | { ok: false, code: string }>,
 * }} PaidCall
 */

/**
 * Runs one paid call. Throws only DB errors (the route's catch answers them); credits reserved by then are
 * refunded best effort first.
 * @param {PaidCall} s
 */
export async function runPaidCall(s) {
  const { ai, userId, opKey, kind, res } = s;
  const { credits, spend, appKeys } = ai;
  /** @param {number} status @param {string} code @param {Record<string, string>} [headers] */
  const stop = (status, code, headers) =>
    s.unread() ? s.reject(status, code, headers) : s.fail(status, code, headers);
  if (!credits || !spend || !appKeys) return stop(503, "db_unavailable");

  const k = await appKeys.open(SHARED_TEXT.provider);
  if (!k.ok) return stop(k.status, k.code);
  const r = await credits.reserve(userId, opKey, kind);
  const bad = mapReserve(r);
  if (bad) return stop(bad.status, bad.code);

  if (r.status === "replay") {
    const op = r.op;
    const a = replayAnswer(op);
    if (a.action === "respond") return stop(a.status, a.code, a.headers);
    if (a.action === "expire") {
      await credits.refund(userId, opKey, { errorCode: "provider_unavailable" });
      return stop(502, "provider_unavailable");
    }
    const input = await s.getInput();
    if (!input.ok)
      return input.close ? s.reject(input.status, input.code) : s.fail(input.status, input.code);
    if (input.hash !== op.requestHash) return s.fail(400, "bad_request");
    s.done("ok");
    if (!res.destroyed) sendJson(res, 200, op.result);
    return;
  }

  /** @type {string | null} */
  let spendId = null;
  let settled = false;
  /** @param {string} code the failure code, also what a replay of this key answers */
  const abandon = async (code) => {
    try {
      if (spendId) await spend.settle(spendId, settleOutcome(code).spend);
    } finally {
      settled = true;
      await credits.refund(userId, opKey, { errorCode: code });
    }
  };
  try {
    const sp = await spend.reserve({
      provider: SHARED_TEXT.provider,
      model: SHARED_TEXT.model,
      kind,
    });
    if (sp.status !== "reserved") {
      const code = sp.status === "cap_reached" ? "ai_cap_reached" : "server_misconfigured";
      await abandon(code);
      return stop(AI_ERROR_STATUS[code], code);
    }
    spendId = sp.spendId;
    const input = await s.getInput();
    if (!input.ok) {
      await abandon("not_sent");
      return input.close ? s.reject(input.status, input.code) : s.fail(input.status, input.code);
    }
    // The client left before the provider call: nothing was sent, nothing is owed.
    if (res.destroyed) {
      await abandon("not_sent");
      return s.fail(408, "request_timeout");
    }
    const ctl = new AbortController();
    res.once("close", () => ctl.abort());
    const out = await s.call({
      key: k.key,
      model: SHARED_TEXT.model,
      input: input.input,
      signal: ctl.signal,
    });
    if (!out.ok) {
      await abandon(out.code);
      return s.fail(
        AI_ERROR_STATUS[/** @type {keyof typeof AI_ERROR_STATUS} */ (out.code)] ?? 502,
        out.code,
      );
    }
    await spend.settle(spendId, settleOutcome("ok").spend);
    // Commit before sending, so a client that disconnected can still replay the stored result.
    const c = await credits.commit(userId, opKey, { requestHash: input.hash, result: out.result });
    settled = true;
    if (c.status === "expired") s.log({ event: "credit_commit_expired", id: s.id });
    s.done("ok");
    if (!res.destroyed) sendJson(res, 200, out.result);
  } catch (err) {
    if (!settled) {
      try {
        await credits.refund(userId, opKey, { errorCode: "internal" });
      } catch {
        // The reservation expires by itself; the original error is what the route reports.
      }
    }
    throw err;
  }
}
