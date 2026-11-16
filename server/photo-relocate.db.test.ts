// @vitest-environment node
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "./db.js";
import { createDriveClient } from "./drive.js";
import { runMigrations } from "./migrator.js";
import { main, runRelocate } from "./photo-relocate.js";
import {
  FAKE,
  fakeConfig,
  fakeEnv,
  GOOGLE_TEXT_SENTINEL,
  startFakeDrive,
} from "./test/fake-drive.js";
import { OWNER_A, OWNER_B } from "./test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fid = (n: number) => `fakefile${String(n).padStart(8, "0")}`;
const ITEM_A = uuid(900);
const ITEM_B = uuid(901);

describe.skipIf(!dbAvailable)("photo relocation against real Postgres and a fake Drive", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let admin: ReturnType<typeof createPool>;
  let fake: Awaited<ReturnType<typeof startFakeDrive>>;

  const client = () =>
    createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} });
  /** A tagged file in the flat root. */
  const putFile = (n: number, props: Record<string, string> = {}) =>
    fake.files.set(fid(n), {
      bytes: Buffer.from("x"),
      meta: {
        parents: [FAKE.folderId],
        createdTime: new Date().toISOString(),
        appProperties: { app: "tudo", photoId: uuid(n), ...props },
      },
    });
  const addRow = (n: number, user = OWNER_A) =>
    admin.query(
      `insert into item_photos (user_id, id, item_id, drive_file_id) values ($1, $2, $3, $4)`,
      [user, uuid(n), user === OWNER_A ? ITEM_A : ITEM_B, fid(n)],
    );
  const parentsOf = (n: number) => fake.files.get(fid(n))?.meta.parents as string[] | undefined;
  const run = async (
    o: Partial<Parameters<typeof runRelocate>[0]> = {},
  ): Promise<{ code: number; lines: string[] }> => {
    const lines: string[] = [];
    const code = await runRelocate({ drive: client(), pool, log: (l) => lines.push(l), ...o });
    return { code, lines };
  };

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
    fake = await startFakeDrive();
    await admin.query("truncate wear_logs, item_photos, items, locations cascade");
    await admin.query(`insert into items (user_id, id, name) values ($1, $2, 'x')`, [
      OWNER_A,
      ITEM_A,
    ]);
    await admin.query(`insert into items (user_id, id, name) values ($1, $2, 'y')`, [
      OWNER_B,
      ITEM_B,
    ]);
  });
  afterEach(() => fake?.close());

  it("dry-run (default) moves nothing, creates no folder, prints would-move and would-create lines", async () => {
    putFile(1);
    await addRow(1);
    const { code, lines } = await run();
    expect(code).toBe(0);
    expect(lines).toContain(`would create folder for user ${OWNER_A}`);
    expect(lines).toContain(`would move ${uuid(1)} to user ${OWNER_A}`);
    expect(lines.at(-1)).toContain("would_move 1");
    expect(lines.at(-1)).toContain("mode dry-run");
    expect(fake.dirs.size).toBe(0);
    expect(parentsOf(1)).toEqual([FAKE.folderId]);
    expect(fake.requests.some((r) => r.url !== "/token" && r.method !== "GET")).toBe(false);
  });

  it("apply moves each file into its owner's subfolder and tags userId; two users -> two folders", async () => {
    putFile(1);
    putFile(2);
    putFile(3);
    await addRow(1);
    await addRow(2);
    await addRow(3, OWNER_B);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("moved 3");
    expect(lines.at(-1)).toContain("folders_created 2");
    const dirs = fake.folders();
    expect(dirs.map((d) => d.name).sort()).toEqual([OWNER_A, OWNER_B]);
    const dirOf = (name: string) => dirs.find((d) => d.name === name)!.id;
    expect(parentsOf(1)).toEqual([dirOf(OWNER_A)]);
    expect(parentsOf(2)).toEqual([dirOf(OWNER_A)]);
    expect(parentsOf(3)).toEqual([dirOf(OWNER_B)]);
    expect(fake.files.get(fid(3))?.meta.appProperties).toMatchObject({
      app: "tudo",
      userId: OWNER_B,
    });
  });

  it("second apply moves 0 (idempotent)", async () => {
    putFile(1);
    await addRow(1);
    await run({ apply: true });
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("listed 0");
    expect(lines.at(-1)).toContain("moved 0");
    expect(fake.folders()).toHaveLength(1);
  });

  it("a root file with no DB row is reported unreferenced and stays in root", async () => {
    putFile(1);
    await addRow(1);
    putFile(2);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(lines).toContain(`unreferenced ${uuid(2)}`);
    expect(lines.at(-1)).toContain("unreferenced 1");
    expect(parentsOf(2)).toEqual([FAKE.folderId]);
    expect(parentsOf(1)).not.toEqual([FAKE.folderId]);
  });

  it("--max-move 1 moves one, reports remaining; reruns finish the rest", async () => {
    for (const n of [1, 2, 3]) {
      putFile(n);
      await addRow(n);
    }
    const first = await run({ apply: true, maxMove: 1 });
    expect(first.lines.at(-1)).toContain("moved 1");
    expect(first.lines.at(-1)).toContain("remaining 2");
    const second = await run({ apply: true, maxMove: 5 });
    expect(second.lines.at(-1)).toContain("moved 2");
    expect(second.lines.at(-1)).toContain("remaining 0");
    expect(fake.folders()).toHaveLength(1);
  });

  it("file deleted between list and move -> gone, exit 0", async () => {
    putFile(1);
    await addRow(1);
    const drive = client();
    const real = drive.getParents;
    drive.getParents = async (id) => {
      fake.files.delete(id);
      return real(id);
    };
    const { code, lines } = await run({ apply: true, drive });
    expect(code).toBe(0);
    expect(lines).toContain(`gone ${uuid(1)}`);
    expect(lines.at(-1)).toContain("gone 1");
  });

  it("tag userId differs from row owner -> mismatch, not moved", async () => {
    putFile(1, { userId: OWNER_B });
    await addRow(1, OWNER_A);
    putFile(2);
    await addRow(2);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(lines).toContain(`mismatch ${uuid(1)}`);
    expect(parentsOf(1)).toEqual([FAKE.folderId]);
    expect(parentsOf(2)).not.toEqual([FAKE.folderId]);
  });

  it("an existing user folder is reused (no create)", async () => {
    fake.dirs.set("fakedirexisting1", {
      meta: {
        parents: [FAKE.folderId],
        createdTime: new Date().toISOString(),
        appProperties: { app: "tudo-folder", userId: OWNER_A },
      },
    });
    putFile(1);
    await addRow(1);
    const dry = await run();
    expect(dry.lines.some((l) => l.startsWith("would create folder"))).toBe(false);
    const { lines } = await run({ apply: true });
    expect(lines.at(-1)).toContain("folders_created 0");
    expect(parentsOf(1)).toEqual(["fakedirexisting1"]);
    expect(fake.dirs.size).toBe(1);
  });

  it("move failure -> FAIL code, continues, exit 1", async () => {
    putFile(1);
    putFile(2);
    await addRow(1);
    await addRow(2);
    fake.fail.add("move");
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(1);
    expect(lines).toContain(`move ${uuid(1)}: FAIL drive_unavailable`);
    expect(lines).toContain(`move ${uuid(2)}: FAIL drive_unavailable`);
    expect(lines.at(-1)).toContain("failed 2");
  });

  it("folder check / list / db failure -> exit 1, nothing moved", async () => {
    putFile(1);
    await addRow(1);
    const bad = await run({
      apply: true,
      drive: createDriveClient({
        config: { ...fakeConfig, folderId: "missingfolder0123456" },
        ...fake.urls,
        sleep: async () => {},
      }),
    });
    expect(bad).toEqual({ code: 1, lines: ["checkFolder: FAIL drive_folder_not_found"] });
    fake.fail.add("list");
    const list = await run({ apply: true });
    expect(list.code).toBe(1);
    expect(list.lines[0]).toBe("list: FAIL drive_unavailable");
    fake.fail.clear();
    const dead = await run({
      apply: true,
      pool: {
        connect: async () => {
          throw Object.assign(new Error("secret"), { code: "ECONNREFUSED" });
        },
      },
    });
    expect(dead.code).toBe(1);
    expect(dead.lines).toEqual(["db: FAIL ECONNREFUSED"]);
    expect(parentsOf(1)).toEqual([FAKE.folderId]);
    expect(fake.dirs.size).toBe(0);
  });

  it("apply refuses when no listed file is referenced", async () => {
    putFile(1);
    await addRow(2); // the DB has rows, but none matches a listed file
    const apply = await run({ apply: true });
    expect(apply.code).toBe(1);
    expect(apply.lines).toContain("refusing: no listed file is referenced (check DATABASE_URL)");
    expect(parentsOf(1)).toEqual([FAKE.folderId]);
    expect((await run()).code).toBe(0); // a dry-run only reports it
  });

  it("rows whose files already live in a subfolder plus a root orphan: nothing to move, exit 0", async () => {
    fake.dirs.set("fakedirexisting1", {
      meta: {
        parents: [FAKE.folderId],
        createdTime: new Date().toISOString(),
        appProperties: { app: "tudo-folder", userId: OWNER_A },
      },
    });
    putFile(1);
    fake.files.get(fid(1))!.meta.parents = ["fakedirexisting1"];
    await addRow(1);
    putFile(2); // orphan in root
    const out: string[] = [];
    for (const apply of [true, false]) {
      const { code, lines } = await run({ apply });
      expect(code).toBe(0);
      expect(lines).toContain("nothing to move: no listed file is referenced");
      expect(lines).not.toContain("refusing: no listed file is referenced (check DATABASE_URL)");
      out.push(...lines);
    }
    expect(parentsOf(1)).toEqual(["fakedirexisting1"]);
    expect(parentsOf(2)).toEqual([FAKE.folderId]);
    expect(fake.requests.some((r) => r.url !== "/token" && r.method !== "GET")).toBe(false);
    const wire = out.join("\n");
    for (const s of [fid(1), fid(2), "fakedirexisting1", FAKE.folderId]) {
      expect(wire).not.toContain(s);
    }
  });

  it("a probe error other than not-found -> probe: FAIL, exit 1", async () => {
    putFile(1);
    await addRow(2);
    const drive = client();
    drive.getParents = async () => {
      throw Object.assign(new Error("secret"), { code: "ECONNRESET" });
    };
    for (const apply of [true, false]) {
      const { code, lines } = await run({ apply, drive });
      expect(code).toBe(1);
      expect(lines).toContain("probe: FAIL ECONNRESET");
      expect(lines.join("\n")).not.toContain("secret");
    }
  });

  it("only unreferenced files and an empty DB: exit 0, nothing to move", async () => {
    putFile(1);
    const apply = await run({ apply: true });
    expect(apply.code).toBe(0);
    expect(apply.lines).toContain("nothing to move: no listed file is referenced");
    expect(apply.lines).not.toContain(
      "refusing: no listed file is referenced (check DATABASE_URL)",
    );
    expect(parentsOf(1)).toEqual([FAKE.folderId]);
  });

  it("output never contains Drive file or folder ids, tokens, secrets or Google text", async () => {
    putFile(1);
    putFile(2);
    await addRow(1);
    const out: string[] = [];
    out.push(...(await run()).lines);
    out.push(...(await run({ apply: true })).lines);
    fake.fail.add("move");
    putFile(3);
    await addRow(3);
    out.push(...(await run({ apply: true })).lines);
    const wire = out.join("\n");
    const secrets = [
      fid(1),
      fid(2),
      fid(3),
      ...fake.folders().map((d) => d.id),
      FAKE.folderId,
      FAKE.accessToken,
      FAKE.clientSecret,
      FAKE.refreshToken,
      GOOGLE_TEXT_SENTINEL,
      "googleapis",
    ];
    for (const secret of secrets) expect(wire).not.toContain(secret);
  });

  it("main runs with injected client/pool factories", async () => {
    putFile(1);
    await addRow(1);
    const lines: string[] = [];
    const errors: string[] = [];
    const code = await main({
      argv: ["--apply", "--max-move", "5"],
      env: { ...fakeEnv, DATABASE_URL: db.url },
      log: (l) => lines.push(l),
      error: (l) => errors.push(l),
      makeClient: (o) => createDriveClient({ ...o, ...fake.urls, sleep: async () => {} }),
      makePool: (url) => createPool(url),
    });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(lines.at(-1)).toContain("moved 1");
    expect(parentsOf(1)).not.toEqual([FAKE.folderId]);
  });

  it("main: an unexpected error prints a fixed message and returns 1", async () => {
    const errors: string[] = [];
    const code = await main({
      argv: [],
      env: { ...fakeEnv, DATABASE_URL: db.url },
      log: () => {},
      error: (l) => errors.push(l),
      makeClient: () => {
        throw new Error(FAKE.clientSecret);
      },
      makePool: (url) => createPool(url),
    });
    expect(code).toBe(1);
    expect(errors).toEqual(["relocate failed"]);
  });
});
