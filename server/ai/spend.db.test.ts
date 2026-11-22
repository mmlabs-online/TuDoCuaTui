// @vitest-environment node
// Spend meter (F-706.2, D53) against real Postgres, run as the NOSUPERUSER owner role so RLS applies.
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool } from "../db.js";
import { runMigrations } from "../migrator.js";
import { OWNER_A } from "../test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "../test/pg.js";
import { createSpendMeter } from "./spend.js";
import {
  estimateMicroUsd,
  MONTHLY_CAP_MICRO_USD,
  PRICE_VERSION,
  spendPeriod,
} from "./spendPrices.js";

const realDir = path.resolve(import.meta.dirname, "../../db/migrations");
const T0 = Date.parse("2026-11-15T05:00:00Z");
const PERIOD = "2026-11";

describe.skipIf(!dbAvailable)("spend meter (real Postgres, owner role)", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let admin: ReturnType<typeof createPool>;
  let t = T0;
  const meter = () => createSpendMeter(pool, { now: () => t });
  const rows = async (sql: string, values: unknown[] = []) =>
    (await admin.query(sql, values)).rows as Record<string, any>[];

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
    admin = createPool(db.adminUrl);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    t = T0;
    vi.unstubAllEnvs();
    await admin.query("truncate ai_spend_ops cascade");
  });

  it("reserve inserts one reserved row with period, provider, model, kind, PRICE_VERSION and estimate", async () => {
    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    expect(res.status).toBe("reserved");
    if (res.status !== "reserved") return;

    const est = estimateMicroUsd("gemini", "gemini-2.5-flash", "photo_fill")!;
    expect(res.estimateMicroUsd).toBe(est);
    expect(res.period).toBe(PERIOD);

    const dbRows = await rows("select * from ai_spend_ops");
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0]).toMatchObject({
      id: res.spendId,
      period: PERIOD,
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
      price_version: PRICE_VERSION,
      estimate_micro_usd: String(est),
      state: "reserved",
      settled_at: null,
    });
  });

  it("8 parallel reserves (pool max 5) with room for exactly 3 estimates -> exactly 3 reserved, 5 cap_reached", async () => {
    const est = estimateMicroUsd("gemini", "gemini-2.5-flash", "suggest")!;
    const preloaded = MONTHLY_CAP_MICRO_USD - 3 * est;

    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ($1, 'gemini', 'gemini-2.5-flash', 'suggest', $2, $3, 'charged', now())`,
      [PERIOD, PRICE_VERSION, preloaded],
    );

    const promises = Array.from({ length: 8 }, () =>
      meter().reserve({ provider: "gemini", model: "gemini-2.5-flash", kind: "suggest" }),
    );
    const results = await Promise.all(promises);

    const reserved = results.filter((r) => r.status === "reserved");
    const capReached = results.filter((r) => r.status === "cap_reached");

    expect(reserved).toHaveLength(3);
    expect(capReached).toHaveLength(5);

    const sumRes = await rows(
      "select sum(estimate_micro_usd)::bigint as total from ai_spend_ops where period = $1 and state <> 'released'",
      [PERIOD],
    );
    expect(Number(sumRes[0].total)).toBeLessThanOrEqual(MONTHLY_CAP_MICRO_USD);
  });

  it("reserve waits for the global advisory lock while settle is not blocked", async () => {
    const initial = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "suggest",
    });
    expect(initial.status).toBe("reserved");
    const initialId = (initial as any).spendId;

    const lockHolder = new pg.Client({ connectionString: db.adminUrl });
    await lockHolder.connect();
    await lockHolder.query("begin");
    await lockHolder.query("select pg_advisory_xact_lock(hashtextextended('ai-spend', 0))");

    let reserveDone = false;
    const reservePromise = meter()
      .reserve({ provider: "gemini", model: "gemini-2.5-flash", kind: "photo_fill" })
      .then((r) => {
        reserveDone = true;
        return r;
      });

    // settle of an existing row should proceed without blocking on the advisory lock
    const settleRes = await meter().settle(initialId, "ok");
    expect(settleRes.status).toBe("charged");

    await new Promise((r) => setTimeout(r, 300));
    expect(reserveDone).toBe(false);

    await lockHolder.query("commit");
    await lockHolder.end();

    const secondReserve = await reservePromise;
    expect(secondReserve.status).toBe("reserved");
  });

  it("remaining exactly est -> reserved (spent = cap); remaining est - 1 -> cap_reached, no row inserted", async () => {
    const est = estimateMicroUsd("gemini", "gemini-2.5-flash", "photo_fill")!;

    // Exactly room for est
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ($1, 'gemini', 'gemini-2.5-flash', 'photo_fill', $2, $3, 'charged', now())`,
      [PERIOD, PRICE_VERSION, MONTHLY_CAP_MICRO_USD - est],
    );

    const exact = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    expect(exact.status).toBe("reserved");

    // Now at cap, next reserve fails
    const over = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    expect(over.status).toBe("cap_reached");
    if (over.status === "cap_reached") {
      expect(over.spentMicroUsd).toBe(MONTHLY_CAP_MICRO_USD);
      expect(over.capMicroUsd).toBe(MONTHLY_CAP_MICRO_USD);
    }
  });

  it("at the cap reserve returns cap_reached and inserts no row", async () => {
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ($1, 'gemini', 'gemini-2.5-flash', 'suggest', $2, $3, 'charged', now())`,
      [PERIOD, PRICE_VERSION, MONTHLY_CAP_MICRO_USD],
    );

    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "suggest",
    });
    expect(res.status).toBe("cap_reached");
    const count = await rows("select count(*)::int as n from ai_spend_ops");
    expect(count[0].n).toBe(1);
  });

  it("at the cap, with TUDO_OWNER_SUB set, reserve still returns cap_reached", async () => {
    vi.stubEnv("TUDO_OWNER_SUB", OWNER_A);
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ($1, 'gemini', 'gemini-2.5-flash', 'suggest', $2, $3, 'charged', now())`,
      [PERIOD, PRICE_VERSION, MONTHLY_CAP_MICRO_USD],
    );

    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "suggest",
    });
    expect(res.status).toBe("cap_reached");
  });

  it("settle(ok) -> charged, settled_at set, spent unchanged; other errors also charge", async () => {
    for (const outcome of [
      "ok",
      "provider_unavailable",
      "provider_bad_response",
      "request_timeout",
      "something_new",
    ]) {
      const res = await meter().reserve({
        provider: "gemini",
        model: "gemini-2.5-flash",
        kind: "suggest",
      });
      const id = (res as any).spendId;
      const s = await meter().settle(id, outcome);
      expect(s.status).toBe("charged");

      const r = await rows("select state, settled_at from ai_spend_ops where id = $1", [id]);
      expect(r[0].state).toBe("charged");
      expect(r[0].settled_at).not.toBeNull();
    }
  });

  it("settle with confirmed no-charge outcome -> released, spent drops", async () => {
    for (const outcome of [
      "not_sent",
      "invalid_key",
      "key_forbidden",
      "model_unavailable",
      "provider_rate_limited",
    ]) {
      const res = await meter().reserve({
        provider: "gemini",
        model: "gemini-2.5-flash",
        kind: "suggest",
      });
      const id = (res as any).spendId;
      const s = await meter().settle(id, outcome);
      expect(s.status).toBe("released");

      const r = await rows("select state, settled_at from ai_spend_ops where id = $1", [id]);
      expect(r[0].state).toBe("released");
      expect(r[0].settled_at).not.toBeNull();
    }

    const stat = await meter().status();
    expect(stat.spentMicroUsd).toBe(0);
  });

  it("idempotent settle: second settle is noop; unknown id is not_found", async () => {
    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "suggest",
    });
    const id = (res as any).spendId;

    const s1 = await meter().settle(id, "ok");
    expect(s1.status).toBe("charged");

    const s2 = await meter().settle(id, "not_sent");
    expect(s2).toEqual({ status: "noop", state: "charged" });

    const unknown = await meter().settle("11111111-1111-4111-8111-111111111111", "ok");
    expect(unknown).toEqual({ status: "not_found" });
  });

  it("a reserved row never settled still counts after 30 days in the same month and never expires", async () => {
    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    const est = (res as any).estimateMicroUsd;

    // advance clock by 10 days inside November
    t += 10 * 86_400_000;
    const stat = await meter().status();
    expect(stat.spentMicroUsd).toBe(est);
  });

  it("month boundary: preload Nov at the cap; reserve at Nov 30 16:59:59Z is cap_reached; 17:00:00Z is reserved in Dec", async () => {
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ('2026-11', 'gemini', 'gemini-2.5-flash', 'suggest', $1, $2, 'charged', now())`,
      [PRICE_VERSION, MONTHLY_CAP_MICRO_USD],
    );

    t = Date.parse("2026-11-30T16:59:59.999Z");
    const nov = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    expect(nov.status).toBe("cap_reached");

    t = Date.parse("2026-11-30T17:00:00.000Z");
    const dec = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "photo_fill",
    });
    expect(dec.status).toBe("reserved");
    if (dec.status === "reserved") {
      expect(dec.period).toBe("2026-12");
    }

    const statDec = await meter().status();
    expect(statDec.period).toBe("2026-12");
    expect(statDec.spentMicroUsd).toBe((dec as any).estimateMicroUsd);
  });

  it("a reservation made in Nov and settled in Dec keeps period 2026-11 and does not count in Dec", async () => {
    t = Date.parse("2026-11-20T10:00:00Z");
    const res = await meter().reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      kind: "suggest",
    });
    const id = (res as any).spendId;

    t = Date.parse("2026-12-05T10:00:00Z");
    const s = await meter().settle(id, "ok");
    expect(s.status).toBe("charged");

    const row = await rows("select period from ai_spend_ops where id = $1", [id]);
    expect(row[0].period).toBe("2026-11");

    const statDec = await meter().status();
    expect(statDec.period).toBe("2026-12");
    expect(statDec.spentMicroUsd).toBe(0);
  });

  it("unpriced model inserts no row", async () => {
    const res = await meter().reserve({
      provider: "gemini",
      model: "unpriced-model",
      kind: "suggest",
    });
    expect(res).toEqual({ status: "unpriced" });
    const count = await rows("select count(*)::int as n from ai_spend_ops");
    expect(count[0].n).toBe(0);
  });

  it("status() returns correct shape with remaining never below 0 and runs read-only", async () => {
    const stat1 = await meter().status();
    expect(stat1).toEqual({
      period: PERIOD,
      capMicroUsd: MONTHLY_CAP_MICRO_USD,
      spentMicroUsd: 0,
      remainingMicroUsd: MONTHLY_CAP_MICRO_USD,
      priceVersion: PRICE_VERSION,
    });

    // Over-cap rows: remaining is 0, never negative
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
       values ($1, 'gemini', 'gemini-2.5-flash', 'suggest', $2, 15000000, 'charged', now()),
              ($1, 'gemini', 'gemini-2.5-flash', 'suggest', $2, 10000000, 'charged', now())`,
      [PERIOD, PRICE_VERSION],
    );

    const stat2 = await meter().status();
    expect(stat2.spentMicroUsd).toBe(25_000_000);
    expect(stat2.remainingMicroUsd).toBe(0);
  });

  it("lock wait past statement_timeout rejects with 57014 and inserts no row", async () => {
    const shortTimeoutPool = new pg.Pool({
      connectionString: db.url,
      statement_timeout: 300,
    });

    const shortMeter = createSpendMeter(shortTimeoutPool as any, { now: () => t });

    const lockHolder = new pg.Client({ connectionString: db.adminUrl });
    await lockHolder.connect();
    await lockHolder.query("begin");
    await lockHolder.query("select pg_advisory_xact_lock(hashtextextended('ai-spend', 0))");

    try {
      await expect(
        shortMeter.reserve({ provider: "gemini", model: "gemini-2.5-flash", kind: "suggest" }),
      ).rejects.toMatchObject({ code: "57014" });
    } finally {
      await lockHolder.query("rollback");
      await lockHolder.end();
      await shortTimeoutPool.end();
    }

    const count = await rows("select count(*)::int as n from ai_spend_ops");
    expect(count[0].n).toBe(0);
  });
});
