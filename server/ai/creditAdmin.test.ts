// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_A } from "../test/auth.js";
import { createCreditAdmin } from "./creditAdmin.js";

const server = path.resolve(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" ? [] : walk(p)) : [p];
  });
}

function recordingPool() {
  const calls: string[] = [];
  let connects = 0;
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      return {
        rows: [
          { known: true, amount: 5, approved_at: new Date(), created_at: new Date(), id: "g" },
        ],
        rowCount: 0,
      };
    },
    release: () => {},
  };
  return {
    pool: {
      query: async () => ({ rows: [] }),
      connect: async () => {
        connects++;
        return client;
      },
    },
    calls,
    connects: () => connects,
  };
}

describe("createCreditAdmin", () => {
  it("approveWelcome and addManual throw on an invalid userId before connect()", async () => {
    const { pool, connects } = recordingPool();
    const a = createCreditAdmin(pool);
    await expect(a.approveWelcome("nope")).rejects.toThrow("userId required");
    await expect(a.approveWelcome("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).rejects.toThrow(
      "userId required",
    );
    await expect(a.addManual("nope", 5, "k")).rejects.toThrow("userId required");
    expect(connects()).toBe(0);
  });

  it("approveWelcome and addManual take the advisory lock as the first statement after the set_config", async () => {
    const { pool, calls } = recordingPool();
    const a = createCreditAdmin(pool);
    await a.approveWelcome(OWNER_A);
    expect(calls[1]).toMatch(/^select set_config\('tudo\.maintenance'/);
    expect(calls[2]).toMatch(/pg_advisory_xact_lock/);
    calls.length = 0;
    await a.addManual(OWNER_A, 5, "k");
    expect(calls[2]).toMatch(/pg_advisory_xact_lock/);
  });
});

describe("credit admin source rules", () => {
  const files = walk(server).filter(
    (f) =>
      /\.(js|ts)$/.test(f) &&
      !/\.test\.(ts|js)$/.test(f) &&
      !f.includes(`${path.sep}test${path.sep}`),
  );
  const mentioning = (re: RegExp) =>
    files
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => path.basename(f))
      .sort();

  it("only creditAdmin.js (besides db.js) mentions withCreditAdmin", () => {
    expect(mentioning(/withCreditAdmin/)).toEqual(["creditAdmin.js", "db.js"]);
  });

  it("creditAdmin.js never imports credits.js or creditMath.js", () => {
    const src = readFileSync(path.join(server, "ai/creditAdmin.js"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*\/(credits|creditMath)\.js["']/);
  });

  it("backup.js never mentions credit_", () => {
    expect(readFileSync(path.join(server, "backup.js"), "utf8")).not.toMatch(/credit_/);
  });
});
