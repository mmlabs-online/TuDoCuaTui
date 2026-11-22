// @vitest-environment node
// Credit ledger (F-706.1, D53) against real Postgres, run as the NOSUPERUSER owner role so RLS and FORCE apply.
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../db.js";
import { runMigrations } from "../migrator.js";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "../test/pg.js";
import { RESERVATION_TTL_MS } from "./creditMath.js";
import { createCreditLedger } from "./credits.js";

const realDir = path.resolve(import.meta.dirname, "../../db/migrations");
const T0 = Date.parse("2026-11-15T05:00:00Z");
const PERIOD = "2026-11";

describe.skipIf(!dbAvailable)("credit ledger (real Postgres, owner role)", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let admin: ReturnType<typeof createPool>;
  let t = T0;
  const ledger = () => createCreditLedger(pool, { now: () => t });
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e: { code?: string }) => e.code,
    );
  const rows = async (sql: string, values: unknown[] = []) =>
    (await admin.query(sql, values)).rows as Record<string, any>[];

  async function grant(
    user: string,
    bucket: string,
    amount: number,
    { period = null, approved = true }: { period?: string | null; approved?: boolean } = {},
  ) {
    await admin.query(
      `insert into credit_grants (user_id, bucket, period, amount, approved_at)
       values ($1, $2, $3, $4, ${approved ? "now()" : "null"})`,
      [user, bucket, period, amount],
    );
  }

  async function insertOp(user: string, o: Record<string, unknown> = {}) {
    const v = {
      op_key: "k",
      kind: "photo_fill",
      credits: 1,
      monthly_part: 1,
      lasting_part: 0,
      period: PERIOD,
      state: "reserved",
      expires_at: "2026-11-15T06:00:00Z",
      settled_at: null,
      ...o,
    };
    await admin.query(
      `insert into credit_ops (user_id, op_key, kind, credits, monthly_part, lasting_part, period, state, expires_at, settled_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        user,
        v.op_key,
        v.kind,
        v.credits,
        v.monthly_part,
        v.lasting_part,
        v.period,
        v.state,
        v.expires_at,
        v.settled_at,
      ],
    );
  }

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
    await admin.query("truncate credit_ops, credit_grants");
    await admin.query("update credit_settings set welcome_amount = 300, monthly_amount = 60");
  });

  describe("schema constraints", () => {
    it("credit_grants: bucket/period coupling, period format, amount bounds, approved_at null only for welcome, one welcome per user, one monthly per user and period", async () => {
      const ins = (bucket: string, period: string | null, amount: number, approved: boolean) =>
        codeOf(grant(OWNER_A, bucket, amount, { period, approved }));
      expect(await ins("other", null, 1, true)).toBe("23514");
      expect(await ins("monthly", null, 1, true)).toBe("23514");
      expect(await ins("welcome", PERIOD, 1, true)).toBe("23514");
      expect(await ins("manual", PERIOD, 1, true)).toBe("23514");
      expect(await ins("monthly", "2026-13", 1, true)).toBe("23514");
      expect(await ins("monthly", "2026-1", 1, true)).toBe("23514");
      expect(await ins("manual", null, 0, true)).toBe("23514");
      expect(await ins("manual", null, 100001, true)).toBe("23514");
      expect(await ins("manual", null, 5, false)).toBe("23514");
      expect(await ins("monthly", PERIOD, 5, false)).toBe("23514");
      expect(await ins("welcome", null, 5, false)).toBe("ok");
      expect(await ins("welcome", null, 5, true)).toBe("23505");
      expect(await ins("monthly", PERIOD, 5, true)).toBe("ok");
      expect(await ins("monthly", PERIOD, 5, true)).toBe("23505");
      expect(await ins("monthly", "2026-12", 5, true)).toBe("ok");
      expect(await ins("manual", null, 5, true)).toBe("ok");
      expect(await ins("manual", null, 5, true)).toBe("ok");
      await expect(codeOf(grant(OWNER_B, "welcome", 5))).resolves.toBe("ok");
    });

    it("credit_ops: parts sum to credits, parts >= 0, credits 1..1000, kind list, state list, settled_at null iff reserved, op_key 1..128, unique (user_id, op_key) with the same key allowed for two users", async () => {
      const ins = (o: Record<string, unknown>, user: string = OWNER_A) => codeOf(insertOp(user, o));
      expect(await ins({ credits: 0, monthly_part: 0, lasting_part: 0 })).toBe("23514");
      expect(await ins({ credits: 1001, monthly_part: 1001 })).toBe("23514");
      expect(await ins({ credits: 2, monthly_part: 1, lasting_part: 0 })).toBe("23514");
      expect(await ins({ credits: 1, monthly_part: -1, lasting_part: 2 })).toBe("23514");
      expect(await ins({ kind: "other" })).toBe("23514");
      expect(await ins({ state: "other" })).toBe("23514");
      expect(await ins({ settled_at: "2026-11-15T05:00:00Z" })).toBe("23514");
      expect(await ins({ state: "committed" })).toBe("23514");
      expect(await ins({ op_key: "" })).toBe("23514");
      expect(await ins({ op_key: "x".repeat(129) })).toBe("23514");
      expect(await ins({ period: "2026-00" })).toBe("23514");
      expect(await ins({ op_key: "k1" })).toBe("ok");
      expect(await ins({ op_key: "k1" })).toBe("23505");
      expect(await ins({ op_key: "k1" }, OWNER_B)).toBe("ok");
      expect(
        await ins({ op_key: "k2", state: "committed", settled_at: "2026-11-15T05:00:00Z" }),
      ).toBe("ok");
    });

    it("credit_settings: a single row (second insert fails); amounts 1..100000; seeded 300/60", async () => {
      expect(await rows("select welcome_amount, monthly_amount from credit_settings")).toEqual([
        { welcome_amount: 300, monthly_amount: 60 },
      ]);
      expect(await codeOf(admin.query("insert into credit_settings default values"))).toBe("23505");
      expect(await codeOf(admin.query("insert into credit_settings (id) values (false)"))).toBe(
        "23514",
      );
      expect(await codeOf(admin.query("update credit_settings set monthly_amount = 0"))).toBe(
        "23514",
      );
      expect(await codeOf(admin.query("update credit_settings set welcome_amount = 100001"))).toBe(
        "23514",
      );
    });
  });

  describe("concurrency", () => {
    it("8 parallel reserves (pool max 5) with balance for one photo_fill -> exactly one reserved row", async () => {
      await grant(OWNER_A, "monthly", 1, { period: PERIOD });
      const res = await Promise.all(
        Array.from({ length: 8 }, (_, i) => ledger().reserve(OWNER_A, `p${i}`, "photo_fill")),
      );
      expect(res.filter((r) => r.status === "reserved")).toHaveLength(1);
      expect(res.filter((r) => r.status === "welcome_pending")).toHaveLength(7);
      expect(await rows("select state from credit_ops")).toEqual([{ state: "reserved" }]);
      expect((await ledger().balance(OWNER_A)).total).toBe(0);
    });

    it("balance for one sticker split across buckets (monthly 4 + approved welcome 6), 8 parallel sticker reserves -> exactly one, split 4 + 6", async () => {
      await grant(OWNER_A, "monthly", 4, { period: PERIOD });
      await grant(OWNER_A, "welcome", 6);
      const res = await Promise.all(
        Array.from({ length: 8 }, (_, i) => ledger().reserve(OWNER_A, `s${i}`, "sticker")),
      );
      expect(res.filter((r) => r.status === "reserved")).toHaveLength(1);
      expect(res.filter((r) => r.status === "insufficient")).toHaveLength(7);
      expect(await rows("select monthly_part, lasting_part from credit_ops")).toEqual([
        { monthly_part: 4, lasting_part: 6 },
      ]);
    });

    it("6 parallel reserves with the same opKey -> one row; one 'reserved', five 'replay' of that op", async () => {
      const res = await Promise.all(
        Array.from({ length: 6 }, () => ledger().reserve(OWNER_A, "same", "photo_fill")),
      );
      expect(res.filter((r) => r.status === "reserved")).toHaveLength(1);
      expect(res.filter((r) => r.status === "replay")).toHaveLength(5);
      expect(await rows("select 1 from credit_ops")).toHaveLength(1);
      expect((await ledger().balance(OWNER_A)).monthly).toBe(59);
    });
  });

  describe("idempotency", () => {
    it("same key replays the op (state, parts) and does not debit again; after commit replay shows committed; after refund replay shows refunded and does not re-reserve", async () => {
      const first = await ledger().reserve(OWNER_A, "k1", "sticker");
      expect(first).toMatchObject({ status: "reserved", op: { state: "reserved", credits: 10 } });
      const again = await ledger().reserve(OWNER_A, "k1", "sticker");
      expect(again).toMatchObject({ status: "replay", op: { state: "reserved", monthlyPart: 10 } });
      expect((await ledger().balance(OWNER_A)).monthly).toBe(50);
      await ledger().commit(OWNER_A, "k1");
      expect(await ledger().reserve(OWNER_A, "k1", "sticker")).toMatchObject({
        status: "replay",
        op: { state: "committed" },
      });
      await ledger().reserve(OWNER_A, "k2", "sticker");
      await ledger().refund(OWNER_A, "k2");
      expect(await ledger().reserve(OWNER_A, "k2", "sticker")).toMatchObject({
        status: "replay",
        op: { state: "refunded" },
      });
      expect((await ledger().balance(OWNER_A)).monthly).toBe(50);
      expect(await rows("select 1 from credit_ops")).toHaveLength(2);
    });

    it("same key with a different kind -> op_key_mismatch, nothing written", async () => {
      await ledger().reserve(OWNER_A, "k1", "photo_fill");
      expect(await ledger().reserve(OWNER_A, "k1", "sticker")).toEqual({
        status: "op_key_mismatch",
      });
      expect(await rows("select kind from credit_ops")).toEqual([{ kind: "photo_fill" }]);
    });

    it("the same key for users A and B gives two independent reservations", async () => {
      const a = await ledger().reserve(OWNER_A, "k1", "photo_fill");
      const b = await ledger().reserve(OWNER_B, "k1", "photo_fill");
      expect(a.status).toBe("reserved");
      expect(b.status).toBe("reserved");
      expect(await rows("select user_id from credit_ops")).toHaveLength(2);
    });
  });

  describe("settle", () => {
    it("refund returns the parts to the right buckets", async () => {
      await grant(OWNER_A, "monthly", 4, { period: PERIOD });
      await grant(OWNER_A, "welcome", 6);
      await ledger().reserve(OWNER_A, "k1", "sticker");
      expect(await ledger().balance(OWNER_A)).toMatchObject({ monthly: 0, lasting: 0, total: 0 });
      const r = await ledger().refund(OWNER_A, "k1");
      expect(r).toMatchObject({ status: "refunded", op: { monthlyPart: 4, lastingPart: 6 } });
      expect(await ledger().balance(OWNER_A)).toMatchObject({ monthly: 4, lasting: 6, total: 10 });
    });

    it("commit keeps credits spent; double commit -> noop (committed); refund after commit -> noop (committed); commit after refund -> noop (refunded); unknown key -> not_found", async () => {
      await ledger().reserve(OWNER_A, "k1", "sticker");
      expect(await ledger().commit(OWNER_A, "k1")).toMatchObject({
        status: "committed",
        op: { state: "committed" },
      });
      expect((await ledger().balance(OWNER_A)).monthly).toBe(50);
      expect(await ledger().commit(OWNER_A, "k1")).toMatchObject({
        status: "noop",
        op: { state: "committed" },
      });
      expect(await ledger().refund(OWNER_A, "k1")).toMatchObject({
        status: "noop",
        op: { state: "committed" },
      });
      await ledger().reserve(OWNER_A, "k2", "photo_fill");
      await ledger().refund(OWNER_A, "k2");
      expect(await ledger().commit(OWNER_A, "k2")).toMatchObject({
        status: "noop",
        op: { state: "refunded" },
      });
      expect(await ledger().commit(OWNER_A, "nope")).toEqual({ status: "not_found" });
      expect(await ledger().refund(OWNER_A, "nope")).toEqual({ status: "not_found" });
      expect((await ledger().balance(OWNER_A)).monthly).toBe(50);
    });
  });

  describe("expiry", () => {
    it("a reserved op counts until expires_at and not from expires_at on; commit at/after expiry -> 'expired' and the op stays reserved; refund after expiry -> refunded; a replay of an expired key reports expired: true and debits nothing", async () => {
      await ledger().reserve(OWNER_A, "k1", "sticker");
      await ledger().reserve(OWNER_A, "k2", "sticker");
      t = T0 + RESERVATION_TTL_MS - 1;
      expect((await ledger().balance(OWNER_A)).monthly).toBe(40);
      t = T0 + RESERVATION_TTL_MS;
      expect((await ledger().balance(OWNER_A)).monthly).toBe(60);
      expect(await ledger().commit(OWNER_A, "k1")).toMatchObject({
        status: "expired",
        op: { state: "reserved", expired: true },
      });
      expect(await rows("select state from credit_ops where op_key = 'k1'")).toEqual([
        { state: "reserved" },
      ]);
      expect(await ledger().reserve(OWNER_A, "k1", "sticker")).toMatchObject({
        status: "replay",
        op: { expired: true },
      });
      expect((await ledger().balance(OWNER_A)).monthly).toBe(60);
      expect(await ledger().refund(OWNER_A, "k2")).toMatchObject({
        status: "refunded",
        op: { state: "refunded" },
      });
    });
  });

  describe("month boundary (UTC+7)", () => {
    it("November: spend 50 of 60 monthly; at 2026-11-30T16:59:59Z monthly = 10; at 17:00:00Z period 2026-12, monthly = 60, lasting unchanged; no November credit carries over", async () => {
      await grant(OWNER_A, "welcome", 300);
      t = Date.parse("2026-11-20T00:00:00Z");
      for (let i = 0; i < 5; i++) {
        await ledger().reserve(OWNER_A, `s${i}`, "sticker");
        await ledger().commit(OWNER_A, `s${i}`);
      }
      t = Date.parse("2026-11-30T16:59:59Z");
      expect(await ledger().balance(OWNER_A)).toMatchObject({
        period: "2026-11",
        monthly: 10,
        lasting: 300,
      });
      t = Date.parse("2026-11-30T17:00:00Z");
      expect(await ledger().balance(OWNER_A)).toMatchObject({
        period: "2026-12",
        monthly: 60,
        lasting: 300,
        total: 360,
      });
      expect(
        await rows(
          "select period, amount from credit_grants where bucket = 'monthly' order by period",
        ),
      ).toEqual([
        { period: "2026-11", amount: 60 },
        { period: "2026-12", amount: 60 },
      ]);
    });

    it("an op reserved at 16:59:59Z (period 2026-11) and committed at 17:00:01Z counts against November, not December", async () => {
      t = Date.parse("2026-11-30T16:59:59Z");
      const r = await ledger().reserve(OWNER_A, "k1", "sticker");
      expect(r).toMatchObject({ status: "reserved", op: { period: "2026-11" } });
      t = Date.parse("2026-11-30T17:00:01Z");
      expect(await ledger().commit(OWNER_A, "k1")).toMatchObject({
        status: "committed",
        op: { period: "2026-11" },
      });
      expect(await ledger().balance(OWNER_A)).toMatchObject({ period: "2026-12", monthly: 60 });
      t = Date.parse("2026-11-30T16:59:59Z");
      expect((await ledger().balance(OWNER_A)).monthly).toBe(50);
    });
  });

  describe("spend order", () => {
    it("60 monthly + 300 welcome: photo_fill takes monthly; with 4 monthly left a sticker takes 4 + 6; once monthly is 0 everything comes from lasting; manual grants add to lasting and never expire across months", async () => {
      await grant(OWNER_A, "welcome", 300);
      const first = await ledger().reserve(OWNER_A, "a", "photo_fill");
      expect(first).toMatchObject({ op: { monthlyPart: 1, lastingPart: 0 } });
      await grant(OWNER_B, "welcome", 300);
      await grant(OWNER_B, "monthly", 4, { period: PERIOD });
      expect(await ledger().reserve(OWNER_B, "b", "sticker")).toMatchObject({
        op: { monthlyPart: 4, lastingPart: 6 },
      });
      expect(await ledger().reserve(OWNER_B, "c", "photo_fill")).toMatchObject({
        op: { monthlyPart: 0, lastingPart: 1 },
      });
      expect(await ledger().balance(OWNER_B)).toMatchObject({ monthly: 0, lasting: 293 });
      await grant(OWNER_B, "manual", 20);
      expect((await ledger().balance(OWNER_B)).lasting).toBe(313);
      await ledger().commit(OWNER_B, "b");
      await ledger().commit(OWNER_B, "c");
      t = Date.parse("2027-03-10T00:00:00Z");
      expect(await ledger().balance(OWNER_B)).toMatchObject({
        period: "2027-03",
        monthly: 60,
        lasting: 313,
      });
    });
  });

  describe("welcome", () => {
    it("a user without a snapshot grant gets one pending row on first balance(); it is not counted (total = 60) and balance.welcome = 'pending'; reserve beyond monthly -> welcome_pending", async () => {
      expect(await ledger().balance(OWNER_A)).toEqual({
        period: PERIOD,
        monthly: 60,
        lasting: 0,
        total: 60,
        welcome: "pending",
      });
      expect(
        await rows("select amount, approved_at from credit_grants where bucket = 'welcome'"),
      ).toEqual([{ amount: 300, approved_at: null }]);
      for (let i = 0; i < 6; i++) {
        expect((await ledger().reserve(OWNER_A, `s${i}`, "sticker")).status).toBe("reserved");
      }
      const r = await ledger().reserve(OWNER_A, "s6", "sticker");
      expect(r).toMatchObject({ status: "welcome_pending", balance: { total: 0 } });
    });

    it("after the admin pool sets approved_at, the 300 count and balance.welcome = 'approved'", async () => {
      await ledger().balance(OWNER_A);
      await admin.query("update credit_grants set approved_at = now() where bucket = 'welcome'");
      expect(await ledger().balance(OWNER_A)).toMatchObject({
        welcome: "approved",
        lasting: 300,
        total: 360,
      });
    });

    it("balance() twice and 5 parallel balance() calls create exactly one welcome and one monthly row", async () => {
      await ledger().balance(OWNER_A);
      await ledger().balance(OWNER_A);
      await Promise.all(Array.from({ length: 5 }, () => ledger().balance(OWNER_B)));
      for (const u of [OWNER_A, OWNER_B]) {
        const r = await rows(
          "select bucket, count(*)::int as n from credit_grants where user_id = $1 group by bucket order by bucket",
          [u],
        );
        expect(r).toEqual([
          { bucket: "monthly", n: 1 },
          { bucket: "welcome", n: 1 },
        ]);
      }
    });

    it("an approved snapshot row is kept (no second welcome row, stays approved) when ensureGrants runs", async () => {
      await grant(OWNER_A, "welcome", 300);
      expect(await ledger().balance(OWNER_A)).toMatchObject({ welcome: "approved", lasting: 300 });
      expect(
        await rows("select approved_at from credit_grants where bucket = 'welcome'"),
      ).toHaveLength(1);
      expect(
        (await rows("select approved_at from credit_grants where bucket = 'welcome'"))[0]
          .approved_at,
      ).not.toBeNull();
    });

    it("OWNER_A as owner sub behaves exactly like OWNER_B (pending without a snapshot row, spends monthly first)", async () => {
      const out = [];
      for (const u of [OWNER_A, OWNER_B]) {
        const bal = await ledger().balance(u);
        const r = await ledger().reserve(u, "k1", "photo_fill");
        out.push([bal, r.status, r.op ? [r.op.monthlyPart, r.op.lastingPart] : null]);
      }
      expect(out[0]).toEqual(out[1]);
      expect(out[0][2]).toEqual([1, 0]);
    });
  });

  describe("settings", () => {
    it("changing monthly_amount mid-month leaves this month's grant; next month's grant uses the new amount; welcome_amount is copied at row creation", async () => {
      await ledger().balance(OWNER_A);
      await admin.query("update credit_settings set monthly_amount = 100, welcome_amount = 500");
      expect((await ledger().balance(OWNER_A)).monthly).toBe(60);
      t = Date.parse("2026-12-05T00:00:00Z");
      expect(await ledger().balance(OWNER_A)).toMatchObject({ period: "2026-12", monthly: 100 });
      await ledger().balance(OWNER_B);
      expect(
        await rows("select amount from credit_grants where user_id = $1 and bucket = 'welcome'", [
          OWNER_B,
        ]),
      ).toEqual([{ amount: 500 }]);
      expect(
        await rows("select amount from credit_grants where user_id = $1 and bucket = 'welcome'", [
          OWNER_A,
        ]),
      ).toEqual([{ amount: 300 }]);
    });
  });

  describe("RLS", () => {
    it("a ledger call for user B never reads or changes A's rows", async () => {
      await grant(OWNER_A, "welcome", 300);
      await ledger().reserve(OWNER_A, "k1", "sticker");
      const before = await rows("select * from credit_ops where user_id = $1", [OWNER_A]);
      const grantsBefore = await rows("select * from credit_grants where user_id = $1", [OWNER_A]);
      expect(await ledger().commit(OWNER_B, "k1")).toEqual({ status: "not_found" });
      expect(await ledger().refund(OWNER_B, "k1")).toEqual({ status: "not_found" });
      expect(await ledger().balance(OWNER_B)).toMatchObject({
        monthly: 60,
        lasting: 0,
        welcome: "pending",
      });
      expect(await rows("select * from credit_ops where user_id = $1", [OWNER_A])).toEqual(before);
      expect(await rows("select * from credit_grants where user_id = $1", [OWNER_A])).toEqual(
        grantsBefore,
      );
      expect(await ledger().balance(OWNER_A)).toMatchObject({ monthly: 50, lasting: 300 });
    });
  });
});
