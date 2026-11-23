// @vitest-environment node
// Credit admin (F-706.5, D53) against real Postgres, run as the NOSUPERUSER owner role so RLS and FORCE apply.
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createPool } from "../db.js";
import { runMigrations } from "../migrator.js";
import { headerAuth, OWNER_A, OWNER_B, OWNER_C } from "../test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "../test/pg.js";
import { createCreditAdmin } from "./creditAdmin.js";
import { createCreditLedger } from "./credits.js";
import { createSpendMeter } from "./spend.js";

const realDir = path.resolve(import.meta.dirname, "../../db/migrations");
const T0 = Date.parse("2026-11-15T05:00:00Z");
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!dbAvailable)("credit admin (real Postgres, owner role)", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let admin: ReturnType<typeof createPool>;
  let t = T0;
  const ledger = () => createCreditLedger(pool, { now: () => t });
  const adm = () => createCreditAdmin(pool, { now: () => t });
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
    await admin.query("truncate credit_ops, credit_grants, ai_spend_ops");
    await admin.query("update credit_settings set welcome_amount = 300, monthly_amount = 60");
  });

  describe("settings", () => {
    it("updateSettings then getSettings returns the new values and a later updated_at", async () => {
      const before = await adm().getSettings();
      expect(before).toMatchObject({ welcomeAmount: 300, monthlyAmount: 60 });
      t = T0 + 60_000;
      const after = await adm().updateSettings({ welcomeAmount: 500, monthlyAmount: 100 });
      expect(after).toEqual({
        welcomeAmount: 500,
        monthlyAmount: 100,
        updatedAt: new Date(T0 + 60_000).toISOString(),
      });
      expect(await adm().getSettings()).toEqual(after);
    });

    it("after updateSettings(500, 100) a new user's first balance() has monthly 100 and a pending welcome row of 500; an existing user's grants are unchanged", async () => {
      await ledger().balance(OWNER_A);
      await adm().updateSettings({ welcomeAmount: 500, monthlyAmount: 100 });
      const b = await ledger().balance(OWNER_B);
      expect(b).toMatchObject({ monthly: 100, lasting: 0, welcome: "pending" });
      expect(
        await rows("select user_id, bucket, amount from credit_grants order by user_id, bucket"),
      ).toEqual([
        { user_id: OWNER_A, bucket: "monthly", amount: 60 },
        { user_id: OWNER_A, bucket: "welcome", amount: 300 },
        { user_id: OWNER_B, bucket: "monthly", amount: 100 },
        { user_id: OWNER_B, bucket: "welcome", amount: 500 },
      ]);
    });
  });

  describe("pending welcome approvals", () => {
    it("listPending returns only unapproved welcome rows, oldest first, capped by limit", async () => {
      await ledger().balance(OWNER_A);
      t += 1000;
      await ledger().balance(OWNER_B);
      await adm().approveWelcome(OWNER_A);
      t += 1000;
      await ledger().balance(OWNER_C);
      // created_at is the DB clock (one transaction each), so the insert order is the age order.
      const list = await adm().listPending();
      expect(list.map((r) => r.userId)).toEqual([OWNER_B, OWNER_C]);
      expect(list[0]).toEqual({
        userId: OWNER_B,
        amount: 300,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
      });
      expect(await adm().listPending({ limit: 1 })).toHaveLength(1);
    });

    it("approveWelcome raises balance().lasting by 300 and welcome 'approved'; the stored amount is kept after a settings change", async () => {
      await ledger().balance(OWNER_B);
      expect(await ledger().balance(OWNER_B)).toMatchObject({ lasting: 0, welcome: "pending" });
      await adm().updateSettings({ welcomeAmount: 999, monthlyAmount: 60 });
      t += 5000;
      const res = await adm().approveWelcome(OWNER_B);
      expect(res).toEqual({
        status: "approved",
        amount: 300,
        approvedAt: new Date(t).toISOString(),
      });
      expect(await ledger().balance(OWNER_B)).toMatchObject({ lasting: 300, welcome: "approved" });
    });

    it("a second approve is already_approved, an unknown user is not_found, and approve never inserts a welcome row", async () => {
      await ledger().balance(OWNER_B);
      expect((await adm().approveWelcome(OWNER_B)).status).toBe("approved");
      expect(await adm().approveWelcome(OWNER_B)).toMatchObject({
        status: "already_approved",
        amount: 300,
      });
      expect(await adm().approveWelcome(UNKNOWN)).toEqual({ status: "not_found" });
      expect(await rows("select 1 from credit_grants where user_id = $1", [UNKNOWN])).toEqual([]);
      expect(await rows("select 1 from credit_grants where bucket = 'welcome'")).toHaveLength(1);
    });

    it("a reserve that returned welcome_pending returns reserved after approveWelcome", async () => {
      await adm().updateSettings({ welcomeAmount: 300, monthlyAmount: 5 });
      const first = await ledger().reserve(OWNER_B, "op-1", "sticker");
      expect(first.status).toBe("welcome_pending");
      await adm().approveWelcome(OWNER_B);
      expect((await ledger().reserve(OWNER_B, "op-1", "sticker")).status).toBe("reserved");
    });
  });

  describe("manual credits", () => {
    it("addManual raises balance().lasting and the credits still count in the next UTC+7 month and across the boundary", async () => {
      await ledger().balance(OWNER_B);
      const res = await adm().addManual(OWNER_B, 40, "key-1");
      expect(res).toMatchObject({ status: "created", grant: { userId: OWNER_B, amount: 40 } });
      expect(await ledger().balance(OWNER_B)).toMatchObject({ lasting: 40 });
      t = Date.parse("2026-12-31T16:59:00Z");
      expect(await ledger().balance(OWNER_B)).toMatchObject({ period: "2026-12", lasting: 40 });
      t = Date.parse("2026-12-31T17:00:00Z");
      expect(await ledger().balance(OWNER_B)).toMatchObject({ period: "2027-01", lasting: 40 });
      t = Date.parse("2027-03-10T00:00:00Z");
      expect(await ledger().balance(OWNER_B)).toMatchObject({ lasting: 40 });
    });

    it("a replay with the same key and amount adds nothing; another amount is grant_key_mismatch; the same key for another user is created", async () => {
      await ledger().balance(OWNER_B);
      await ledger().balance(OWNER_C);
      const first = await adm().addManual(OWNER_B, 40, "key-1");
      const again = await adm().addManual(OWNER_B, 40, "key-1");
      expect(again).toMatchObject({ status: "replay" });
      expect(again.status === "replay" && first.status === "created" && again.grant).toEqual(
        first.status === "created" ? first.grant : null,
      );
      expect(await adm().addManual(OWNER_B, 41, "key-1")).toEqual({ status: "grant_key_mismatch" });
      expect((await adm().addManual(OWNER_C, 40, "key-1")).status).toBe("created");
      expect(await rows("select 1 from credit_grants where bucket = 'manual'")).toHaveLength(2);
    });

    it("addManual for a user with no credit_grants row is unknown_user and writes nothing", async () => {
      expect(await adm().addManual(UNKNOWN, 5, "k")).toEqual({ status: "unknown_user" });
      expect(await rows("select 1 from credit_grants")).toEqual([]);
    });
  });

  describe("spend through createApp with a real pool", () => {
    it("GET /api/admin/spend shows a reserved estimate against capMicroUsd 20000000", async () => {
      const reserved = await createSpendMeter(pool, { now: () => t }).reserve({
        provider: "gemini",
        model: "gemini-2.5-flash",
        kind: "photo_fill",
      });
      expect(reserved.status).toBe("reserved");
      const app = createApp({
        pool: pool as any,
        distDir: "/tmp",
        auth: headerAuth(),
        ownerSub: OWNER_A,
        log: () => {},
        now: () => t,
      });
      const server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      try {
        const port = (server.address() as AddressInfo).port;
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/spend`, {
          headers: { "x-test-user": "a" },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ period: "2026-11", capMicroUsd: 20000000 });
        expect(body.spentMicroUsd).toBe(
          reserved.status === "reserved" ? reserved.estimateMicroUsd : -1,
        );
        const other = await fetch(`http://127.0.0.1:${port}/api/admin/spend`, {
          headers: { "x-test-user": "b" },
        });
        expect(other.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
