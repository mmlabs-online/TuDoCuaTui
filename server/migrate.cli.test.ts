// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminUrl, createTestDb, dbAvailable, urlFor } from "./test/pg.js";

const script = path.resolve(import.meta.dirname, "migrate.js");

const OWNER = "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e";

function runCli(databaseUrl?: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TUDO_OWNER_SUB;
  Object.assign(env, extraEnv);
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  const r = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("node server/migrate.js", () => {
  it("exit 2 when DATABASE_URL is unset", () => {
    const r = runCli();
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/DATABASE_URL is not set/);
  });

  it("exit 1 on unreachable host; output has no URL/password", () => {
    const url = "postgres://tudocuatui:s3cretpw@127.0.0.1:1/tudocuatui";
    const r = runCli(url);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain("s3cretpw");
    expect(r.out).not.toContain("127.0.0.1");
    expect(r.out).not.toContain(url);
  });

  it("malformed TUDO_OWNER_SUB + unreachable DATABASE_URL -> exit 2, value not printed", () => {
    const r = runCli("postgres://tudocuatui:s3cretpw@127.0.0.1:1/tudocuatui", {
      TUDO_OWNER_SUB: "not-a-uuid-SECRETISH",
    });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/TUDO_OWNER_SUB is not a valid UUID/);
    expect(r.out).not.toContain("SECRETISH");
  });

  it("DATABASE_URL unset + malformed TUDO_OWNER_SUB -> exit 2, value not printed", () => {
    const r = runCli(undefined, { TUDO_OWNER_SUB: "not-a-uuid-SECRETISH" });
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("SECRETISH");
  });

  describe.skipIf(!dbAvailable)("with Postgres", () => {
    it("exit 1 on wrong password; output has no URL/password", () => {
      const url = urlFor(adminUrl!, "postgres", "postgres", "wrongpw-s3cret");
      const r = runCli(url);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain("wrongpw-s3cret");
      expect(r.out).not.toContain(url);
    });

    it("valid TUDO_OWNER_SUB on a fresh DB -> exit 0, owner not in the output", async () => {
      const db = await createTestDb();
      try {
        const r = runCli(db.url, { TUDO_OWNER_SUB: OWNER });
        expect(r.code).toBe(0);
        expect(r.out).not.toContain(OWNER);
      } finally {
        await db.drop();
      }
    });

    it("exit 0 twice on a fresh DB; second says up to date", async () => {
      const db = await createTestDb();
      try {
        const first = runCli(db.url);
        expect(first.code).toBe(0);
        expect(first.out).toMatch(/applied 20261110120000_init/);
        const second = runCli(db.url);
        expect(second.code).toBe(0);
        expect(second.out).toMatch(/up to date/);
      } finally {
        await db.drop();
      }
    });
  });
});
