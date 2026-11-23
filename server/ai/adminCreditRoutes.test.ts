// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { headerAuth, OWNER_A, OWNER_B } from "../test/auth.js";
import { fakePool } from "../test/fake-pool.js";

const JSON_H = { "Content-Type": "application/json" };
const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

const GRANT = { id: "g1", userId: OWNER_B, amount: 40, createdAt: "2026-11-15T05:00:00.000Z" };
const SETTINGS = { welcomeAmount: 300, monthlyAmount: 60, updatedAt: "2026-11-15T05:00:00.000Z" };
const SPEND = {
  period: "2026-11",
  capMicroUsd: 20000000,
  spentMicroUsd: 1500,
  remainingMicroUsd: 19998500,
  priceVersion: "2026-11-22",
};

function fakes() {
  const calls: string[] = [];
  const state = { approve: "approved" as string, manual: "created" as string, fail: false };
  const guard = () => {
    if (state.fail) throw new Error("db down");
  };
  const creditAdmin = {
    async getSettings() {
      calls.push("getSettings");
      guard();
      return { ...SETTINGS };
    },
    async updateSettings(s: { welcomeAmount: number; monthlyAmount: number }) {
      calls.push("updateSettings");
      guard();
      return { ...s, updatedAt: SETTINGS.updatedAt };
    },
    async listPending() {
      calls.push("listPending");
      guard();
      return [{ userId: OWNER_B, amount: 300, createdAt: SETTINGS.updatedAt }];
    },
    async approveWelcome(userId: string) {
      calls.push(`approve:${userId}`);
      guard();
      return state.approve === "not_found"
        ? { status: "not_found" as const }
        : {
            status: state.approve as "approved" | "already_approved",
            amount: 300,
            approvedAt: SETTINGS.updatedAt,
          };
    },
    async addManual(userId: string, amount: number, key: string) {
      calls.push(`addManual:${userId}:${amount}:${key}`);
      guard();
      return state.manual === "created" || state.manual === "replay"
        ? { status: state.manual as "created" | "replay", grant: { ...GRANT, amount } }
        : { status: state.manual as "unknown_user" | "grant_key_mismatch" };
    },
  };
  const spendMeter = {
    async status() {
      calls.push("spend");
      guard();
      return { ...SPEND };
    },
  };
  return { creditAdmin, spendMeter, calls, state };
}

async function spinUp(opts: { pool?: boolean; log?: Record<string, unknown>[] } = {}) {
  const f = fakes();
  const log = opts.log ?? [];
  const app = createApp({
    pool: opts.pool === false ? null : (fakePool({ query: async () => ({ rows: [] }) }) as any),
    distDir: "/tmp",
    auth: headerAuth(),
    ownerSub: OWNER_A,
    log: (e) => log.push(e),
    ...(opts.pool === false
      ? {}
      : { creditAdmin: f.creditAdmin as any, spendMeter: f.spendMeter as any }),
    ai: null,
  });
  const s = http.createServer(app);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as AddressInfo).port;
  const call = (
    method: string,
    p: string,
    o: { user?: string; body?: string; headers?: Record<string, string> } = {},
  ) =>
    fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: {
        "x-test-user": o.user ?? "a",
        ...(o.body !== undefined ? JSON_H : {}),
        ...o.headers,
      },
      body: o.body,
    });
  return { ...f, call, log };
}

const ROUTES = [
  "/api/admin/credits/settings",
  "/api/admin/credits/pending",
  `/api/admin/credits/pending/${OWNER_B}/approve`,
  `/api/admin/credits/users/${OWNER_B}/grants`,
  "/api/admin/spend",
  "/api/admin",
  "/api/admin/x",
  "/api/admin/ai-keys",
  "/api/admin/ai-keys/claude",
  "/api/admin/credits/unknown",
];

describe("admin credit routes: non-owner", () => {
  it("gets 403 forbidden on every admin route x every method, including unknown paths and wrong methods", async () => {
    const { call, calls } = await spinUp();
    for (const p of ROUTES) {
      for (const m of ["GET", "PUT", "POST", "DELETE"]) {
        const body =
          m === "PUT" || m === "POST" ? JSON.stringify({ secret: "echo-me" }) : undefined;
        const res = await call(m, p, { user: "b", body });
        expect(res.status, `${m} ${p}`).toBe(403);
        expect(await res.text()).toBe(JSON.stringify({ error: { code: "forbidden" } }));
      }
    }
    expect(calls).toEqual([]);
  });
});

describe("admin credit routes: owner", () => {
  it("GET and PUT settings", async () => {
    const { call } = await spinUp();
    const g = await call("GET", "/api/admin/credits/settings");
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual(SETTINGS);
    const p = await call("PUT", "/api/admin/credits/settings", {
      body: JSON.stringify({ welcomeAmount: 500, monthlyAmount: 100 }),
    });
    expect(p.status).toBe(200);
    expect(await p.json()).toMatchObject({ welcomeAmount: 500, monthlyAmount: 100 });
    for (const body of [
      JSON.stringify({ welcomeAmount: 0, monthlyAmount: 100 }),
      JSON.stringify({ welcomeAmount: 5 }),
      JSON.stringify({ welcomeAmount: 5, monthlyAmount: 5, x: 1 }),
    ]) {
      const bad = await call("PUT", "/api/admin/credits/settings", { body });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as any).error.code).toBe("invalid_input");
    }
  });

  it("GET pending lists accounts", async () => {
    const { call } = await spinUp();
    const res = await call("GET", "/api/admin/credits/pending");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accounts: [{ userId: OWNER_B, amount: 300, createdAt: SETTINGS.updatedAt }],
    });
  });

  it("POST approve: 200 approved and already_approved, 404 not_found, 400 bad id", async () => {
    const f = await spinUp();
    const url = (id: string) => `/api/admin/credits/pending/${id}/approve`;
    const ok = await f.call("POST", url(OWNER_B));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      status: "approved",
      userId: OWNER_B,
      amount: 300,
      approvedAt: SETTINGS.updatedAt,
    });
    f.state.approve = "already_approved";
    expect(((await (await f.call("POST", url(OWNER_B))).json()) as any).status).toBe(
      "already_approved",
    );
    f.state.approve = "not_found";
    const nf = await f.call("POST", url(OWNER_B));
    expect(nf.status).toBe(404);
    expect(await nf.json()).toEqual({ error: { code: "not_found" } });
    const bad = await f.call("POST", url("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: { code: "invalid_input", field: "userId", reason: "idInvalid" },
    });
  });

  it("POST manual grant: 201, replay 200, 409, 404 unknown_user, 400", async () => {
    const f = await spinUp();
    const url = `/api/admin/credits/users/${OWNER_B}/grants`;
    const body = JSON.stringify({ amount: 40, requestKey: "key-1" });
    const created = await f.call("POST", url, { body });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ grant: GRANT });
    expect(f.calls.at(-1)).toBe(`addManual:${OWNER_B}:40:key-1`);
    f.state.manual = "replay";
    const replay = await f.call("POST", url, { body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ grant: GRANT, replay: true });
    f.state.manual = "grant_key_mismatch";
    const conflict = await f.call("POST", url, { body });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: { code: "grant_key_mismatch" } });
    f.state.manual = "unknown_user";
    const unknown = await f.call("POST", url, { body });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: { code: "unknown_user" } });
    const bad = await f.call("POST", url, { body: JSON.stringify({ amount: 0, requestKey: "k" }) });
    expect(bad.status).toBe(400);
    const badId = await f.call("POST", "/api/admin/credits/users/not-a-uuid/grants", { body });
    expect(badId.status).toBe(400);
  });

  it("GET spend returns spendMeter.status() verbatim", async () => {
    const { call } = await spinUp();
    const res = await call("GET", "/api/admin/spend");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SPEND);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("wrong method -> 405 with Allow; unknown admin path -> 404", async () => {
    const { call } = await spinUp();
    const wrong = await call("POST", "/api/admin/credits/pending", { body: "{}" });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");
    expect((await call("DELETE", "/api/admin/credits/settings")).headers.get("allow")).toBe(
      "GET, PUT",
    );
    expect((await call("GET", "/api/admin/credits/unknown")).status).toBe(404);
  });

  it("guards: cross-site PUT/POST -> 403 forbidden_origin; non-JSON -> 415; body over 4096 bytes -> 413", async () => {
    const { call, calls } = await spinUp();
    const x = await call("PUT", "/api/admin/credits/settings", {
      body: JSON.stringify({ welcomeAmount: 5, monthlyAmount: 5 }),
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(x.status).toBe(403);
    expect(((await x.json()) as any).error.code).toBe("forbidden_origin");
    const y = await call("POST", `/api/admin/credits/users/${OWNER_B}/grants`, {
      body: JSON.stringify({ amount: 5, requestKey: "k" }),
      headers: { "sec-fetch-site": "same-site" },
    });
    expect(y.status).toBe(403);
    const text = await call("PUT", "/api/admin/credits/settings", {
      body: "x",
      headers: { "Content-Type": "text/plain" },
    });
    expect(text.status).toBe(415);
    const big = await call("PUT", "/api/admin/credits/settings", {
      body: JSON.stringify({ welcomeAmount: 5, monthlyAmount: 5, pad: "x".repeat(5000) }),
    });
    expect(big.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("a failing store answers 503 db_unavailable", async () => {
    const f = await spinUp();
    f.state.fail = true;
    for (const p of [
      "/api/admin/credits/settings",
      "/api/admin/credits/pending",
      "/api/admin/spend",
    ]) {
      const res = await f.call("GET", p);
      expect(res.status, p).toBe(503);
      expect(await res.json()).toEqual({ error: { code: "db_unavailable" } });
    }
  });

  it("without a pool: 503 db_unavailable for the owner, still 403 for non-owners; works with ai: null", async () => {
    const f = await spinUp({ pool: false });
    expect((await f.call("GET", "/api/admin/spend")).status).toBe(503);
    expect((await f.call("GET", "/api/admin/credits/settings")).status).toBe(503);
    expect((await f.call("GET", "/api/admin/spend", { user: "b" })).status).toBe(403);
    const withPool = await spinUp();
    expect((await withPool.call("GET", "/api/admin/spend")).status).toBe(200);
  });

  it("log entries carry only {event, id, action, code}: no user ids, amounts or request keys", async () => {
    const log: Record<string, unknown>[] = [];
    const f = await spinUp({ log });
    await f.call("POST", `/api/admin/credits/users/${OWNER_B}/grants`, {
      body: JSON.stringify({ amount: 4242, requestKey: "secret-key" }),
    });
    await f.call("GET", "/api/admin/spend", { user: "b" });
    const entries = log.filter((e) => e.event === "admin_credits" || e.event === "admin");
    expect(entries.length).toBe(2);
    expect(entries[0]).toMatchObject({ event: "admin_credits", action: "grant", code: "created" });
    for (const e of entries) {
      expect(Object.keys(e).sort().join()).toMatch(/^(action,code,event,id|code,event,id)$/);
    }
    const dump = JSON.stringify(log);
    expect(dump).not.toContain("4242");
    expect(dump).not.toContain("secret-key");
    expect(dump).not.toContain(OWNER_B);
  });
});
