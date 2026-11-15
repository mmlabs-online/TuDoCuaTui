// @vitest-environment node
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readBody, servePhoto } from "./photos.js";
import { OWNER_A } from "./test/auth.js";
import { fakePool } from "./test/fake-pool.js";

const PHOTO = "11111111-1111-4111-8111-111111111111";
const DRIVE_ID = "fakefile00000001";

/** A ServerResponse stand-in: a writable that records the head and can be closed like a socket. */
function fakeRes() {
  const res = new PassThrough() as PassThrough & Record<string, any>;
  res.headersSent = false;
  res.writeHead = (status: number, headers: Record<string, unknown>) => {
    res.headersSent = true;
    res.status = status;
    res.headers = headers;
    return res;
  };
  res.resume();
  return res;
}

function setup(body: ReadableStream<Uint8Array>) {
  const seen: { signal?: AbortSignal } = {};
  const logs: Record<string, unknown>[] = [];
  const drive = {
    getMedia: async (_id: string, o: { signal?: AbortSignal }) => {
      seen.signal = o.signal;
      return { body, contentType: "text/html", contentLength: null };
    },
  };
  const pool = fakePool({
    query: async () => ({ rows: [{ drive_file_id: DRIVE_ID }], rowCount: 1 }),
  });
  const run = (res: unknown, deadlineMs?: number) =>
    servePhoto({ headers: {} } as never, res as never, {
      pool: pool as never,
      userId: OWNER_A,
      drive: drive as never,
      photoId: PHOTO,
      id: "req",
      log: (e) => logs.push(e),
      deadlineMs,
    });
  return { seen, logs, run };
}

const neverEnding = () =>
  new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new Uint8Array([1, 2])) });

describe("servePhoto", () => {
  it("aborts the getMedia signal after the deadline", async () => {
    const { seen, logs, run } = setup(neverEnding());
    const res = fakeRes();
    const closed = new Promise((r) => res.once("close", r));
    const done = run(res, 50);
    await new Promise((r) => setTimeout(r, 30));
    expect(seen.signal?.aborted).toBe(false);
    await done.catch(() => {});
    await closed;
    expect(seen.signal?.aborted).toBe(true);
    expect(res.status).toBe(200);
    expect(JSON.stringify(logs)).not.toContain(PHOTO);
    expect(JSON.stringify(logs)).not.toContain(DRIVE_ID);
  });

  it("aborts the getMedia signal when the client disconnects mid-stream", async () => {
    const { seen, run } = setup(neverEnding());
    const res = fakeRes();
    const done = run(res, 60_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.signal?.aborted).toBe(false);
    res.destroy();
    await done.catch(() => {});
    expect(seen.signal?.aborted).toBe(true);
  });

  it("stream error after headers destroys the response and logs photo_read_failed without ids", async () => {
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        c.enqueue(new Uint8Array([1]));
        setTimeout(() => c.error(new Error(`boom ${DRIVE_ID}`)), 10);
      },
    });
    const { logs, run } = setup(body);
    const res = fakeRes();
    await run(res, 60_000);
    expect(res.destroyed).toBe(true);
    expect(logs).toEqual([{ event: "photo_read_failed", code: "stream" }]);
  });

  describe("cache headers and ownership (D34)", () => {
    const run = async (inm: string | undefined, rows: unknown[]) => {
      let media = 0;
      const drive = {
        getMedia: async () => {
          media++;
          return {
            body: new ReadableStream<Uint8Array>({
              start: (c) => {
                c.enqueue(new Uint8Array([1]));
                c.close();
              },
            }),
            contentType: "image/jpeg",
            contentLength: "1",
          };
        },
      };
      const pool = fakePool({ query: async () => ({ rows, rowCount: rows.length }) });
      const res = fakeRes();
      const closed = new Promise((r) => res.once("finish", r));
      await servePhoto(
        { headers: inm === undefined ? {} : { "if-none-match": inm } } as never,
        res as never,
        {
          pool: pool as never,
          userId: OWNER_A,
          drive: drive as never,
          photoId: PHOTO,
          id: "req",
          log: () => {},
        },
      );
      if (res.status === 200) await closed;
      return { res, media };
    };

    it("200 carries private, no-cache and the ETag", async () => {
      const { res, media } = await run(undefined, [{ drive_file_id: DRIVE_ID }]);
      expect(res.status).toBe(200);
      expect(res.headers["Cache-Control"]).toBe("private, no-cache");
      expect(res.headers.ETag).toBe(`"${PHOTO}"`);
      expect(media).toBe(1);
    });

    it("matching If-None-Match on an owned row -> 304, same headers, no Drive call", async () => {
      const { res, media } = await run(`"${PHOTO}"`, [{ drive_file_id: DRIVE_ID }]);
      expect(res.status).toBe(304);
      expect(res.headers["Cache-Control"]).toBe("private, no-cache");
      expect(res.headers.ETag).toBe(`"${PHOTO}"`);
      expect(media).toBe(0);
    });

    it.each([`"${PHOTO}"`, "*"])(
      "If-None-Match %s with no row for this user -> 404, never 304",
      async (inm) => {
        const { res, media } = await run(inm, []);
        expect(res.status).toBe(404);
        expect(media).toBe(0);
      },
    );
  });
});

describe("readBody timeouts", () => {
  const T = { totalMs: 200, idleMs: 50 };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const req = (headers: Record<string, string> = {}) =>
    Object.assign(new PassThrough(), { headers }) as PassThrough & { headers: any };

  it("no bytes for idleMs -> 408 request_timeout", async () => {
    const t0 = Date.now();
    const r = await readBody(req() as never, T);
    expect(r).toEqual({ ok: false, status: 408, code: "request_timeout" });
    expect(Date.now() - t0).toBeLessThan(150);
  });

  it("drip-feed under idleMs is cut at totalMs -> 408", async () => {
    const q = req();
    const drip = setInterval(() => q.write(Buffer.from([1])), 20);
    const t0 = Date.now();
    const r = await readBody(q as never, T);
    clearInterval(drip);
    expect(r).toEqual({ ok: false, status: 408, code: "request_timeout" });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
  });

  it("a steady upload that ends before totalMs -> ok, bytes intact", async () => {
    const q = req({ "content-length": "5" });
    const p = readBody(q as never, T);
    for (let i = 0; i < 5; i++) {
      q.write(Buffer.from([i]));
      await sleep(20);
    }
    q.end();
    const r = await p;
    expect(r).toEqual({ ok: true, bytes: Buffer.from([0, 1, 2, 3, 4]) });
  });
});
