// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BODY_TIMEOUTS } from "../photos.js";
import { fakeAppKeys, fakeCredits, fakeSpend, SHARED_KEY } from "../test/fake-ai.js";
import { AI_ERROR_STATUS } from "./catalog.js";
import { CREDIT_PRICES, RESERVATION_TTL_MS } from "./creditMath.js";
import {
  hashBytes,
  hashJson,
  mapReserve,
  parseOpKey,
  replayAnswer,
  runPaidCall,
  settleOutcome,
} from "./paidCall.js";
import { SHARED_TEXT } from "./shared.js";

describe("mapReserve", () => {
  it("insufficient->402 credits_exhausted, welcome_pending->402 welcome_pending, op_key_mismatch->400 bad_request", () => {
    expect(mapReserve({ status: "insufficient" })).toEqual({
      status: 402,
      code: "credits_exhausted",
    });
    expect(mapReserve({ status: "welcome_pending" })).toEqual({
      status: 402,
      code: "welcome_pending",
    });
    expect(mapReserve({ status: "op_key_mismatch" })).toEqual({ status: 400, code: "bad_request" });
    expect(mapReserve({ status: "reserved" })).toBeNull();
    expect(mapReserve({ status: "replay" })).toBeNull();
  });

  it("the new codes carry the statuses the catalog declares", () => {
    expect(AI_ERROR_STATUS.credits_exhausted).toBe(402);
    expect(AI_ERROR_STATUS.welcome_pending).toBe(402);
  });
});

describe("replayAnswer", () => {
  const op = (o: object) => ({ state: "reserved", expired: false, errorCode: null, ...o });
  it("committed -> compare; live reserved -> 503 ai_busy Retry-After 5; expired reserved -> expire", () => {
    expect(replayAnswer(op({ state: "committed" }))).toEqual({ action: "compare" });
    expect(replayAnswer(op({}))).toEqual({
      action: "respond",
      status: 503,
      code: "ai_busy",
      headers: { "Retry-After": "5" },
    });
    expect(replayAnswer(op({ expired: true }))).toEqual({ action: "expire" });
  });

  it("refunded -> the stored error code with its status; without a code -> 502 provider_unavailable", () => {
    expect(replayAnswer(op({ state: "refunded", errorCode: "ai_cap_reached" }))).toEqual({
      action: "respond",
      status: 503,
      code: "ai_cap_reached",
    });
    expect(replayAnswer(op({ state: "refunded", errorCode: "not_sent" }))).toEqual({
      action: "respond",
      status: 502,
      code: "provider_unavailable",
    });
    expect(replayAnswer(op({ state: "refunded" }))).toMatchObject({ status: 502 });
  });
});

describe("settleOutcome", () => {
  it("ok -> commit; every failure -> refund and the spend outcome is the failure code", () => {
    expect(settleOutcome("ok")).toEqual({ spend: "ok", credits: "commit" });
    for (const code of [
      "provider_bad_response",
      "provider_unavailable",
      "invalid_key",
      "key_forbidden",
      "model_unavailable",
      "provider_rate_limited",
      "not_sent",
    ]) {
      expect(settleOutcome(code)).toEqual({ spend: code, credits: "refund" });
    }
  });
});

describe("parseOpKey", () => {
  it("missing, empty, 129 chars and bad characters are refused; a UUID passes", () => {
    for (const v of [undefined, "", "x".repeat(129), "has space", "a/b", ["a", "b"]]) {
      expect(parseOpKey({ "idempotency-key": v as never })).toEqual({ ok: false });
    }
    const id = "3f2b1c9e-8a4d-4b7e-9c11-0a1b2c3d4e5f";
    expect(parseOpKey({ "idempotency-key": id })).toEqual({ ok: true, opKey: id });
  });
});

describe("hashes", () => {
  it("hashBytes is sha256 hex; hashJson is stable for the canonical suggest body", () => {
    expect(hashBytes(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const body = {
      candidateIds: ["a", "b"],
      season: "winter",
      weather: { cold: true },
      avoidIds: [],
    };
    expect(hashJson(body)).toBe(hashJson({ ...body }));
    expect(hashJson(body)).not.toBe(hashJson({ ...body, season: "summer" }));
    expect(hashJson(body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("price and timeout invariants", () => {
  it("kinds map to CREDIT_PRICES (D53: photo fill 1, suggest 1)", () => {
    expect(CREDIT_PRICES.photo_fill).toBe(1);
    expect(CREDIT_PRICES.suggest).toBe(1);
    expect(SHARED_TEXT).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("body and provider timeouts are below RESERVATION_TTL_MS", () => {
    // gemini.js defaults: 45 s photo fill, 30 s suggest; the body read comes first for a photo fill.
    expect(BODY_TIMEOUTS.totalMs + 45_000 + 30_000).toBeLessThan(RESERVATION_TTL_MS);
  });
});

function fakeRes() {
  const out = { status: 0, body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    destroyed: false,
    once() {},
    writeHead(status: number, headers: Record<string, string>) {
      out.status = status;
      out.headers = headers;
    },
    end(payload: string) {
      out.body = JSON.parse(payload);
    },
  };
  return { res, out };
}

function setup(
  o: {
    credits?: ReturnType<typeof fakeCredits>;
    spend?: ReturnType<typeof fakeSpend>;
    call?: () => Promise<{ ok: true; result: unknown } | { ok: false; code: string }>;
    input?: () => Promise<any>;
    commitStatus?: string;
  } = {},
) {
  const credits = o.credits ?? fakeCredits({ balance: 5 });
  const spend = o.spend ?? fakeSpend();
  const appKeys = fakeAppKeys();
  const { res, out } = fakeRes();
  const logs: Record<string, unknown>[] = [];
  const answers: [string, number, string][] = [];
  if (o.commitStatus) {
    credits.commit = async () => ({ status: o.commitStatus as never, op: undefined as never });
  }
  const run = (opKey = "k1") =>
    runPaidCall({
      ai: { credits, spend, appKeys } as never,
      userId: "u1",
      opKey,
      kind: "photo_fill",
      res: res as never,
      log: (e) => logs.push(e),
      id: "req",
      unread: () => false,
      reject: (status, code) => answers.push(["reject", status, code]),
      fail: (status, code) => answers.push(["fail", status, code]),
      done: (code) => logs.push({ done: code }),
      getInput: o.input ?? (async () => ({ ok: true, hash: "h".repeat(64), input: "in" })),
      call:
        o.call ??
        (async ({ key, model }) => ({ ok: true, result: { key: key === SHARED_KEY, model } })),
    });
  return { credits, spend, appKeys, res, out, logs, answers, run };
}

describe("runPaidCall with fakes", () => {
  it("success: reserves, calls with the shared key and model, settles spend ok, commits, answers 200", async () => {
    const t = setup();
    await t.run();
    expect(t.out).toMatchObject({
      status: 200,
      body: { key: true, model: "gemini-2.5-flash" },
    });
    expect(t.credits.log).toEqual(["reserve:photo_fill", "commit"]);
    expect(t.spend.settles.map((s) => s.outcome)).toEqual(["ok"]);
    expect(t.credits.ops.get("u1:k1")).toMatchObject({
      state: "committed",
      requestHash: "h".repeat(64),
    });
  });

  it("provider failure: spend settled with the code, credits refunded with the code, error answered", async () => {
    const t = setup({ call: async () => ({ ok: false, code: "provider_unavailable" }) });
    await t.run();
    expect(t.answers).toEqual([["fail", 502, "provider_unavailable"]]);
    expect(t.spend.settles.map((s) => s.outcome)).toEqual(["provider_unavailable"]);
    expect(t.credits.ops.get("u1:k1")).toMatchObject({
      state: "refunded",
      errorCode: "provider_unavailable",
    });
    expect(t.credits.state.balance).toBe(5);
  });

  it("input failure after the reserve: refund, spend settled not_sent, no provider call", async () => {
    let called = 0;
    const t = setup({
      input: async () => ({ ok: false, status: 400, code: "invalid_photo" }),
      call: async () => {
        called++;
        return { ok: true, result: {} };
      },
    });
    await t.run();
    expect(called).toBe(0);
    expect(t.answers).toEqual([["fail", 400, "invalid_photo"]]);
    expect(t.spend.settles.map((s) => s.outcome)).toEqual(["not_sent"]);
    expect(t.credits.state.balance).toBe(5);
  });

  it("client gone before the provider call: not_sent, refund, no call", async () => {
    let called = 0;
    const t: ReturnType<typeof setup> = setup({
      input: async () => {
        t.res.destroyed = true;
        return { ok: true, hash: "h".repeat(64), input: "x" };
      },
      call: async () => {
        called++;
        return { ok: true, result: {} };
      },
    });
    await t.run();
    expect(called).toBe(0);
    expect(t.spend.settles.map((s) => s.outcome)).toEqual(["not_sent"]);
    expect(t.credits.state.balance).toBe(5);
  });

  it("commit returning expired still answers the result and logs credit_commit_expired", async () => {
    const t = setup({ commitStatus: "expired" });
    await t.run();
    expect(t.out.status).toBe(200);
    expect(t.logs).toContainEqual({ event: "credit_commit_expired", id: "req" });
  });

  it("an expired reservation on replay is refunded and answers 502 provider_unavailable", async () => {
    const credits = fakeCredits({ balance: 5 });
    credits.ops.set("u1:k1", {
      opKey: "k1",
      kind: "photo_fill",
      state: "reserved",
      expired: true,
      requestHash: null,
      result: null,
      errorCode: null,
    });
    const t = setup({ credits });
    await t.run();
    expect(t.answers).toEqual([["fail", 502, "provider_unavailable"]]);
    expect(credits.ops.get("u1:k1")).toMatchObject({ state: "refunded" });
  });

  it("a thrown DB error after the reserve refunds the credits and rethrows", async () => {
    const spend = fakeSpend();
    spend.reserve = async () => {
      throw new Error("db down");
    };
    const t = setup({ spend });
    await expect(t.run()).rejects.toThrow("db down");
    expect(t.credits.ops.get("u1:k1")).toMatchObject({ state: "refunded" });
  });
});
