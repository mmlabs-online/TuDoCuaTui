// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createDriveClient } from "./drive.js";
import { main, runSmoke } from "./drive-smoke.js";
import { fakeConfig, fakeEnv, startFakeDrive } from "./test/fake-drive.js";

const smoke = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "drive-smoke.js");
let fake: Awaited<ReturnType<typeof startFakeDrive>>;
afterEach(() => fake?.close());

async function setup(config = fakeConfig) {
  fake = await startFakeDrive();
  const drive = createDriveClient({ config, ...fake.urls });
  const lines: string[] = [];
  return { drive, lines, log: (l: string) => lines.push(l) };
}

describe("runSmoke against a fake Drive", () => {
  it("checkFolder, create, read, delete, read 404: returns 0", async () => {
    const { drive, lines, log } = await setup();
    expect(await runSmoke({ drive, log })).toBe(0);
    expect(lines).toEqual([
      "checkFolder: ok",
      "create: ok",
      "read: ok",
      "delete: ok",
      "read after delete: ok",
    ]);
    const create = fake.requests.find((r) => r.url.startsWith("/upload"));
    expect(create?.body.toString()).toContain(`"parents":["${fakeConfig.folderId}"]`);
    expect(fake.files.size).toBe(0);
  });

  it("read-back bytes differ: returns 1 and still deletes", async () => {
    const { drive, lines, log } = await setup();
    const real = drive.getMedia;
    drive.getMedia = async (id, o) => {
      const m = await real(id, o);
      return fake.files.has(id) ? { ...m, body: new Response("different").body! } : m;
    };
    expect(await runSmoke({ drive, log })).toBe(1);
    expect(lines).toContain("read: FAIL error");
    expect(lines).toContain("delete: ok");
    expect(fake.files.size).toBe(0);
  });

  it("delete failing reports the leftover file id and returns 1", async () => {
    const { drive, lines, log } = await setup();
    drive.deleteFile = async () => {
      throw new Error("x");
    };
    expect(await runSmoke({ drive, log })).toBe(1);
    expect(lines.some((l) => l.startsWith("file left behind: fakefile"))).toBe(true);
  });

  it("a file that is still readable after delete returns 1", async () => {
    const { drive, lines, log } = await setup();
    drive.deleteFile = async () => {};
    expect(await runSmoke({ drive, log })).toBe(1);
    expect(lines).toContain("read after delete: FAIL error");
  });

  it("folder not found: returns 1 with drive_folder_not_found", async () => {
    const { drive, lines, log } = await setup({ ...fakeConfig, folderId: "missingfolder0123456" });
    expect(await runSmoke({ drive, log })).toBe(1);
    expect(lines).toEqual(["checkFolder: FAIL drive_folder_not_found"]);
  });

  it("create failing returns 1", async () => {
    const { lines, log } = await setup();
    fake.hang.add("upload");
    const quick = createDriveClient({
      config: fakeConfig,
      ...fake.urls,
      timeouts: { upload: 100 },
    });
    expect(await runSmoke({ drive: quick, log })).toBe(1);
    expect(lines).toContain("create: FAIL drive_unavailable");
  });
});

describe("main", () => {
  it("runs the smoke against the configured client and returns its code", async () => {
    fake = await startFakeDrive();
    const lines: string[] = [];
    const code = await main({
      env: fakeEnv,
      log: (l) => lines.push(l),
      makeClient: (o) => createDriveClient({ ...o, ...fake.urls }),
    });
    expect(code).toBe(0);
    expect(lines).toContain("delete: ok");
  });

  it("an unexpected failure returns 1 with a fixed message", async () => {
    const errors: string[] = [];
    const code = await main({
      env: fakeEnv,
      error: (l) => errors.push(l),
      makeClient: () => {
        throw new Error(fakeEnv.GOOGLE_CLIENT_SECRET);
      },
    });
    expect(code).toBe(1);
    expect(errors).toEqual(["smoke failed"]);
  });
});

describe("CLI", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [smoke], { env, encoding: "utf8", timeout: 10_000 });

  it("without Google env exits 2 and prints 'drive not configured'", () => {
    const r = run({});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("drive not configured");
  });

  it("with a partial env exits 2 without values", () => {
    const r = run({ GOOGLE_CLIENT_ID: fakeEnv.GOOGLE_CLIENT_ID });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("config error");
    expect(r.stderr).not.toContain(fakeEnv.GOOGLE_CLIENT_ID);
  });
});
