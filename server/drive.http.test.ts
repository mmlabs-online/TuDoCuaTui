// @vitest-environment node
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createDriveClient, DriveError, taggedFilesQuery } from "./drive.js";
import { fakeConfig, startFakeDrive } from "./test/fake-drive.js";

let fake: Awaited<ReturnType<typeof startFakeDrive>>;
afterEach(() => fake?.close());

async function client(timeouts = {}) {
  fake = await startFakeDrive();
  return createDriveClient({ config: fakeConfig, ...fake.urls, timeouts });
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as DriveError).code;
  }
  return "resolved";
};

describe("against a fake Drive over real fetch", () => {
  it("token + create + getMedia streams the bytes + delete", async () => {
    const drive = await client();
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251, 13, 10, 13, 10, 255]);
    const f = await drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes,
      appProperties: { a: "b" },
    });
    expect(f.size).toBe(bytes.length);
    expect(fake.files.get(f.id)?.meta).toMatchObject({
      parents: [fakeConfig.folderId],
      appProperties: { a: "b" },
    });
    const m = await drive.getMedia(f.id);
    expect(m.contentType).toBe("image/jpeg");
    expect(m.contentLength).toBe(bytes.length);
    const chunks: Buffer[] = [];
    for await (const c of Readable.fromWeb(m.body as never)) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    await drive.deleteFile(f.id);
    expect(fake.files.size).toBe(0);
    expect(await code(drive.getMedia(f.id))).toBe("drive_not_found");
    expect(fake.requests.filter((r) => r.url === "/token")).toHaveLength(1);
  });

  it("getMedia: no headers within the timeout -> drive_unavailable", async () => {
    const drive = await client({ headers: 100 });
    const f = await drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
    });
    fake.hang.add("media");
    expect(await code(drive.getMedia(f.id))).toBe("drive_unavailable");
  });

  it("getMedia: the caller's AbortSignal aborts the body stream", async () => {
    const drive = await client();
    const f = await drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
    });
    const ctl = new AbortController();
    const m = await drive.getMedia(f.id, { signal: ctl.signal });
    ctl.abort();
    await expect(new Response(m.body).arrayBuffer()).rejects.toBeDefined();
  });

  it("an upload hanging past its timeout -> drive_unavailable, a single request", async () => {
    const drive = await client({ upload: 100 });
    fake.hang.add("upload");
    expect(
      await code(
        drive.createFile({ name: "p.jpg", mimeType: "image/jpeg", bytes: Buffer.from("x") }),
      ),
    ).toBe("drive_unavailable");
    expect(fake.requests.filter((r) => r.url.startsWith("/upload"))).toHaveLength(1);
  });

  it("listFiles paginates against the fake and returns only tagged, non-trashed files in the folder", async () => {
    const drive = await client();
    fake.config.listPageSize = 2;
    const meta = (extra: Record<string, unknown>) => ({
      bytes: Buffer.from("x"),
      meta: { parents: [fakeConfig.folderId], createdTime: "2026-03-04T05:00:00.000Z", ...extra },
    });
    for (let i = 1; i <= 5; i++)
      fake.files.set(`fakefile0000000${i}`, meta({ appProperties: { app: "tudo" } }));
    fake.files.set("fakefile00000006", meta({ appProperties: { app: "tudo" }, trashed: true }));
    fake.files.set("fakefile00000007", meta({ appProperties: { tudo: "smoke" } }));
    fake.files.set("fakefile00000008", meta({}));
    fake.files.set("fakefile00000009", {
      bytes: Buffer.from("x"),
      meta: { parents: ["otherfolder0123456"], appProperties: { app: "tudo" } },
    });
    const q = taggedFilesQuery(fakeConfig.folderId);
    const ids: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const r = await drive.listFiles({ q, pageToken });
      ids.push(...r.files.map((f) => f.id));
      pageToken = r.nextPageToken;
      pages++;
    } while (pageToken);
    expect(pages).toBe(3);
    expect(ids).toEqual([1, 2, 3, 4, 5].map((i) => `fakefile0000000${i}`));
  });
});

describe("folders and moves against a fake Drive (T-021)", () => {
  const FOLDER = "application/vnd.google-apps.folder";
  const make = async (drive: Awaited<ReturnType<typeof client>>, name = "u1") =>
    (await drive.createFolder({ name, appProperties: { app: "tudo-folder" } })).id;

  it("createFile with parentId sends parents [parentId]; invalid parentId -> drive_invalid_id, no request", async () => {
    const drive = await client();
    const dir = await make(drive);
    const f = await drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
      parentId: dir,
    });
    expect(fake.files.get(f.id)?.meta.parents).toEqual([dir]);
    const before = fake.requests.length;
    const bad = drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
      parentId: "bad'id",
    });
    expect(await code(bad)).toBe("drive_invalid_id");
    expect(fake.requests.length).toBe(before);
  });

  it("createFolder posts metadata only, parent root, not retried on 500", async () => {
    const drive = await client();
    const id = await make(drive);
    const req = fake.requests.find(
      (r) => r.method === "POST" && r.url.startsWith("/drive/v3/files"),
    );
    expect(JSON.parse(req!.body.toString())).toEqual({
      name: "u1",
      mimeType: FOLDER,
      parents: [fakeConfig.folderId],
      appProperties: { app: "tudo-folder" },
    });
    expect(fake.dirs.has(id)).toBe(true);
    fake.fail.add("folder-create");
    const before = fake.requests.filter((r) => r.url.startsWith("/drive/v3/files")).length;
    expect(await code(drive.createFolder({ name: "u2" }))).toBe("drive_unavailable");
    const after = fake.requests.filter((r) => r.url.startsWith("/drive/v3/files")).length;
    expect(after - before).toBe(1);
  });

  it("moveFile sends PATCH with addParents/removeParents and appProperties; retried on 500; 404 -> drive_not_found", async () => {
    fake = await startFakeDrive();
    const drive = createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} });
    const dir = await make(drive);
    const f = await drive.createFile({
      name: "p.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
    });
    await drive.moveFile(f.id, {
      addParent: dir,
      removeParent: fakeConfig.folderId,
      appProperties: { userId: "u" },
    });
    const req = fake.requests.find((r) => r.method === "PATCH")!;
    const u = new URL(req.url, "http://x");
    expect(u.searchParams.get("addParents")).toBe(dir);
    expect(u.searchParams.get("removeParents")).toBe(fakeConfig.folderId);
    expect(JSON.parse(req.body.toString())).toEqual({ appProperties: { userId: "u" } });
    expect(fake.files.get(f.id)?.meta).toMatchObject({
      parents: [dir],
      appProperties: { userId: "u" },
    });
    fake.fail.add("move");
    expect(
      await code(drive.moveFile(f.id, { addParent: fakeConfig.folderId, removeParent: dir })),
    ).toBe("drive_unavailable");
    expect(fake.requests.filter((r) => r.method === "PATCH")).toHaveLength(4); // 1 + 3 attempts
    fake.fail.clear();
    expect(
      await code(drive.moveFile("fakefile_missing1", { addParent: dir, removeParent: dir })),
    ).toBe("drive_not_found");
    expect(await code(drive.moveFile(f.id, { addParent: "bad'id", removeParent: dir }))).toBe(
      "drive_invalid_id",
    );
  });

  it("getParents parses ids; malformed -> drive_bad_response", async () => {
    const drive = await client();
    const f = await drive.createFile({
      name: "p",
      mimeType: "image/jpeg",
      bytes: Buffer.from("x"),
    });
    expect(await drive.getParents(f.id)).toEqual([fakeConfig.folderId]);
    fake.files.get(f.id)!.meta.parents = [42];
    expect(await code(drive.getParents(f.id))).toBe("drive_bad_response");
  });
});
