// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

describe.skipIf(!dbAvailable)("app with real Postgres", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let server: http.Server;
  let dir: string;

  beforeAll(async () => {
    db = await createTestDb();
    pool = createPool(db.url);
    dir = fs.mkdtempSync(os.tmpdir() + "/tudo-appdb-");
    server = http.createServer(createApp({ pool, distDir: dir, access: null, log: () => {} }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await pool.end();
    await db.drop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("/readyz -> 200 with a reachable DB", async () => {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/readyz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("pool returns `date` as 'YYYY-MM-DD' and leaves the global pg.types untouched", async () => {
    const r = await pool.query("select date '2026-03-04' as d");
    expect(r.rows[0].d).toBe("2026-03-04");
    expect(pg.types.getTypeParser(1082 as never)("2026-03-04")).toBeInstanceOf(Date);
  });
});
