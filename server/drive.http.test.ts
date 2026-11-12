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
