// @vitest-environment node
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { servePhoto } from "./photos.js";

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
  const pool = { query: async () => ({ rows: [{ drive_file_id: DRIVE_ID }], rowCount: 1 }) };
  const run = (res: unknown, deadlineMs?: number) =>
    servePhoto({ headers: {} } as never, res as never, {
      pool: pool as never,
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
});
