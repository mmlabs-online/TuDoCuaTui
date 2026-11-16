// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DriveError } from "./drive.js";
import { createFolderResolver } from "./driveFolders.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ROOT = "fakefolder0123456789";

type F = { id: string; createdTime: number | null; appProperties: Record<string, string> };

function setup(existing: Record<string, F[]> = {}) {
  const calls = { list: 0, create: 0 };
  const queries: string[] = [];
  let failNext: "list" | "create" | null = null;
  const created: string[] = [];
  const drive = {
    rootFolderId: ROOT,
    async listFiles({ q, pageToken }: { q: string; pageToken?: string }) {
      calls.list++;
      queries.push(q);
      await Promise.resolve();
      if (failNext === "list") {
        failNext = null;
        throw new DriveError("drive_unavailable");
      }
      const user = /value='([0-9a-f-]{36})'/.exec(q)![1];
      const all = [...(existing[user] ?? [])];
      void pageToken;
      return { files: all, nextPageToken: undefined };
    },
    async createFolder({ name }: { name: string }) {
      calls.create++;
      await new Promise((r) => setTimeout(r, 10));
      if (failNext === "create") {
        failNext = null;
        throw new DriveError("drive_unavailable");
      }
      const id = `newfolder${String(calls.create).padStart(8, "0")}`;
      created.push(name);
      existing[name] = [{ id, createdTime: 1, appProperties: {} }];
      return { id };
    },
  };
  return { drive, calls, queries, created, fail: (k: "list" | "create") => (failNext = k) };
}

describe("createFolderResolver", () => {
  it("concurrent resolves for one user: one lookup, one create", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    const ids = await Promise.all([r.resolve(U1), r.resolve(U1), r.resolve(U1)]);
    expect(new Set(ids).size).toBe(1);
    expect(s.calls).toEqual({ list: 1, create: 1 });
  });

  it("second resolve is cached: no Drive request", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    await r.resolve(U1);
    const before = { ...s.calls };
    await r.resolve(U1);
    expect(s.calls).toEqual(before);
  });

  it("an existing folder is reused; of several, the oldest createdTime wins (id tie-break)", async () => {
    const f = (id: string, createdTime: number | null): F => ({
      id,
      createdTime,
      appProperties: {},
    });
    const s = setup({
      [U1]: [f("folderbbbbbbbb", 20), f("folderaaaaaaaa", 10), f("foldernull0000", null)],
      [U2]: [f("foldercccccccc", 5), f("folderbbbbbbb2", 5)],
    });
    const r = createFolderResolver({ drive: s.drive });
    expect(await r.resolve(U1)).toBe("folderaaaaaaaa");
    expect(await r.resolve(U2)).toBe("folderbbbbbbb2");
    expect(s.calls.create).toBe(0);
  });

  it("a failed lookup or create is not cached; the next call retries", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    s.fail("list");
    await expect(r.resolve(U1)).rejects.toMatchObject({ code: "drive_unavailable" });
    s.fail("create");
    await expect(r.resolve(U1)).rejects.toMatchObject({ code: "drive_unavailable" });
    expect(await r.resolve(U1)).toMatch(/^newfolder/);
  });

  it("create:false returns null and creates nothing", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    expect(await r.resolve(U1, { create: false })).toBeNull();
    expect(s.calls.create).toBe(0);
    expect(await r.resolve(U1)).toMatch(/^newfolder/); // null was not cached
  });

  it("invalid userId throws before any request", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    await expect(r.resolve("x' or 1=1")).rejects.toMatchObject({ code: "drive_invalid_id" });
    expect(s.calls).toEqual({ list: 0, create: 0 });
  });

  it("forget drops the entry", async () => {
    const s = setup();
    const r = createFolderResolver({ drive: s.drive });
    await r.resolve(U1);
    r.forget(U1);
    await r.resolve(U1);
    expect(s.calls.list).toBe(2);
  });
});
