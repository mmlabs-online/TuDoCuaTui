import { afterEach, describe, expect, test, vi } from "vitest";
import { ENCODE_STEPS, preparePhotoAuto, prepareWith, type PhotoDeps } from "./photoPrep";
import { scaledSize } from "./photoScale";
import { canUseWorker, createWorkerDeps, getOffThreadDeps } from "./photoWorkerClient";
import {
  createPhotoWorkerHost,
  type WorkerEnv,
  type WorkerReply,
  type WorkerRequest,
} from "./photoWorkerHost";

type Listener = (e: { data?: unknown }) => void;

/** Routes postMessage to the real host (async, like a worker) with a fake bitmap/canvas env. */
class FakeWorker {
  listeners: Record<string, Listener[]> = {};
  posted: WorkerRequest[] = [];
  terminated = 0;
  handle: (m: WorkerRequest) => void;
  constructor(
    opts: {
      ready?: boolean | null;
      sizeOf?: (blob: Blob) => number;
      dims?: [number, number][];
    } = {},
  ) {
    const dims = [...(opts.dims ?? [[4000, 3000]])];
    const env = {
      createImageBitmap: async () => {
        const [width, height] = dims.length > 1 ? dims.shift()! : dims[0];
        return { width, height, close() {} };
      },
      OffscreenCanvas: class {
        constructor(
          public w: number,
          public h: number,
        ) {}
        getContext() {
          return { drawImage() {} };
        }
        async convertToBlob() {
          return Object.defineProperty(new Blob(["j"]), "size", {
            value: opts.sizeOf?.(new Blob()) ?? 100,
          });
        }
      },
    } as unknown as WorkerEnv;
    this.handle = createPhotoWorkerHost(env, (m) => this.reply(m));
    if (opts.ready !== null)
      setTimeout(() => this.reply({ type: "ready", ok: opts.ready ?? true }), 0);
  }
  reply(m: WorkerReply) {
    setTimeout(() => this.emit("message", { data: m }), 0);
  }
  emit(type: string, e: { data?: unknown } = {}) {
    for (const fn of this.listeners[type] ?? []) fn(e);
  }
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ??= []).push(fn);
  }
  terminate() {
    this.terminated++;
  }
  postMessage(m: WorkerRequest) {
    this.posted.push(m);
    this.handle(m);
  }
}

const jpeg = () => new File(["x"], "a.jpg", { type: "image/jpeg" });
const caught = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: Error) => e,
  );

// jsdom's FileReader (the header read in prepareWith) needs the real setImmediate.
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

afterEach(() => vi.useRealTimers());

describe("canUseWorker", () => {
  const all = { Worker() {}, OffscreenCanvas() {}, createImageBitmap() {} };
  test("true when all three exist", () => expect(canUseWorker(all)).toBe(true));
  for (const missing of ["Worker", "OffscreenCanvas", "createImageBitmap"]) {
    test(`canUseWorker is false when ${missing} is missing`, () => {
      const g: Record<string, unknown> = { ...all };
      delete g[missing];
      expect(canUseWorker(g)).toBe(false);
    });
  }
  test("getOffThreadDeps returns null in jsdom", () => expect(getOffThreadDeps()).toBeNull());
});

describe("createWorkerDeps", () => {
  test("load waits for ready, posts the blob and resolves width/height", async () => {
    const w = new FakeWorker();
    const { deps } = createWorkerDeps(w);
    const blob = jpeg();
    const img = await deps.load(blob);
    expect(w.posted[0]).toMatchObject({ op: "load", blob });
    expect([img.width, img.height]).toEqual([4000, 3000]);
  });

  test("worker deps return scaledSize dimensions", async () => {
    const w = new FakeWorker();
    const { deps } = createWorkerDeps(w);
    const img = await deps.load(jpeg());
    const out = await deps.render(img, 1200, 0.8);
    expect({ width: out.width, height: out.height }).toEqual(scaledSize(4000, 3000, 1200));
  });

  test("worker deps through preparePhoto walk ENCODE_STEPS like main deps", async () => {
    const calls = (log: [number, number][]): PhotoDeps => ({
      load: async () => ({ width: 4000, height: 3000, release() {} }),
      render: async (_i, max, quality) => {
        log.push([max, quality]);
        const s = scaledSize(4000, 3000, max);
        return {
          blob: Object.defineProperty(new Blob(["j"]), "size", { value: 3 * 1024 * 1024 }),
          ...s,
        };
      },
    });
    const mainLog: [number, number][] = [];
    const workerLog: [number, number][] = [];
    const w = new FakeWorker({ sizeOf: () => 3 * 1024 * 1024 });
    const wd = createWorkerDeps(w).deps;
    const spied: PhotoDeps = {
      load: wd.load,
      render: (i, m, q) => (workerLog.push([m, q]), wd.render(i, m, q)),
    };
    const a = await caught(prepareWith(jpeg(), calls(mainLog)));
    const b = await caught(prepareWith(jpeg(), spied));
    expect(a).toMatchObject({ code: "tooLargeAfterResize" });
    expect(b).toMatchObject({ code: "tooLargeAfterResize" });
    expect(workerLog).toEqual(mainLog);
    expect(workerLog).toEqual(ENCODE_STEPS.map((s) => [s.max, s.quality]));
  });

  test("concurrent requests are matched by id", async () => {
    const w = new FakeWorker({
      dims: [
        [100, 50],
        [200, 80],
      ],
    });
    const { deps } = createWorkerDeps(w);
    const [a, b] = await Promise.all([deps.load(jpeg()), deps.load(jpeg())]);
    expect([a.width, b.width]).toEqual([100, 200]);
  });

  test("ready {ok:false} marks the worker broken", async () => {
    const { deps, state } = createWorkerDeps(new FakeWorker({ ready: false }));
    expect(await caught(deps.load(jpeg()))).toMatchObject({ name: "WorkerUnavailableError" });
    expect(state.broken).toBe(true);
  });

  test("no ready within 5 s marks it broken", async () => {
    fakeTimers();
    const { deps, state } = createWorkerDeps(new FakeWorker({ ready: null }));
    const p = caught(deps.load(jpeg()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toMatchObject({ name: "WorkerUnavailableError" });
    expect(state.broken).toBe(true);
  });

  test("worker error event rejects pending requests and marks it broken", async () => {
    const w = new FakeWorker({ dims: [[1, 1]] });
    const { deps, state } = createWorkerDeps(w);
    const img = await deps.load(jpeg());
    w.handle = () => {};
    const p = caught(deps.render(img, 1200, 0.8));
    w.emit("error");
    expect(await p).toMatchObject({ name: "WorkerUnavailableError" });
    expect(state.broken).toBe(true);
  });

  test("messageerror marks it broken", async () => {
    const w = new FakeWorker();
    const { deps, state } = createWorkerDeps(w);
    await deps.load(jpeg());
    w.emit("messageerror");
    expect(state.broken).toBe(true);
  });

  test("markBroken terminates the worker once (ready ok:false, ready timeout, error, messageerror, request timeout)", async () => {
    // ready ok:false
    const a = new FakeWorker({ ready: false });
    await caught(createWorkerDeps(a).deps.load(jpeg()));
    expect(a.terminated).toBe(1);
    // ready timeout
    fakeTimers();
    const b = new FakeWorker({ ready: null });
    const bd = createWorkerDeps(b);
    const pb = caught(bd.deps.load(jpeg()));
    await vi.advanceTimersByTimeAsync(5000);
    await pb;
    expect(b.terminated).toBe(1);
    vi.useRealTimers();
    // error, then a second break signal is a no-op
    const c = new FakeWorker();
    createWorkerDeps(c);
    c.emit("error");
    c.emit("messageerror");
    expect(c.terminated).toBe(1);
    // messageerror
    const d = new FakeWorker();
    createWorkerDeps(d);
    d.emit("messageerror");
    expect(d.terminated).toBe(1);
    // request timeout
    fakeTimers();
    const e = new FakeWorker({ dims: [[1, 1]] });
    const { deps } = createWorkerDeps(e);
    await vi.advanceTimersByTimeAsync(1);
    e.handle = () => {};
    const pe = caught(deps.load(jpeg()));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pe).toMatchObject({ name: "WorkerUnavailableError" });
    expect(e.terminated).toBe(1);
  });

  test("a load with no answer within 20 s falls back to main deps and succeeds", async () => {
    fakeTimers();
    const w = new FakeWorker();
    const wd = createWorkerDeps(w);
    await vi.advanceTimersByTimeAsync(1);
    w.handle = () => {};
    const main: PhotoDeps = {
      load: async () => ({ width: 100, height: 100, release() {} }),
      render: async () => ({ blob: new Blob(["j"]), width: 100, height: 100 }),
    };
    const p = preparePhotoAuto(jpeg(), {
      offThread: () => (wd.state.broken ? null : wd.deps),
      main,
    });
    // let the real FileReader header read finish so the request (and its timer) exists
    await vi.waitFor(() => expect(w.posted.length).toBe(1));
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(p).resolves.toMatchObject({ width: 100, height: 100 });
    expect(wd.state.broken).toBe(true);
    expect(w.terminated).toBe(1);
  });

  test("a late reply after the request timeout is ignored", async () => {
    fakeTimers();
    const w = new FakeWorker({ dims: [[1, 1]] });
    const { deps, state } = createWorkerDeps(w);
    await vi.advanceTimersByTimeAsync(1);
    w.handle = () => {};
    const p = caught(deps.load(jpeg()));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toMatchObject({ name: "WorkerUnavailableError" });
    expect(() =>
      w.emit("message", { data: { id: 1, ok: true, width: 5, height: 5 } }),
    ).not.toThrow();
    expect(state.broken).toBe(true);
    expect(await p).toMatchObject({ name: "WorkerUnavailableError" });
  });

  test("an answered request clears its timeout", async () => {
    fakeTimers();
    const w = new FakeWorker();
    const { deps, state } = createWorkerDeps(w);
    const p = deps.load(jpeg());
    await vi.advanceTimersByTimeAsync(10);
    await p;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.broken).toBe(false);
    expect(w.terminated).toBe(0);
  });

  test("malformed replies are ignored without throwing", async () => {
    const w = new FakeWorker({ dims: [[7, 8]] });
    const { deps, state } = createWorkerDeps(w);
    const p = deps.load(jpeg());
    const bad: unknown[] = [
      undefined,
      null,
      5,
      "x",
      { type: "ready" },
      { id: "1", ok: true },
      { id: 1, ok: true, width: "a" },
    ];
    for (const data of bad) expect(() => w.emit("message", { data })).not.toThrow();
    const img = await p;
    expect([img.width, img.height]).toEqual([7, 8]);
    expect(state.broken).toBe(false);
  });

  test("a render reply without a Blob rejects the render", async () => {
    const w = new FakeWorker({ dims: [[10, 10]] });
    const { deps } = createWorkerDeps(w);
    const img = await deps.load(jpeg());
    w.handle = (m) => w.reply({ id: m.id, ok: true, width: 5, height: 5 });
    expect(await caught(deps.render(img, 1200, 0.8))).toBeInstanceOf(Error);
  });

  test("worker deps: a decoded image over MAX_PIXELS → tooManyPixels, no render posted, release posted", async () => {
    const w = new FakeWorker({ dims: [[10000, 6000]] });
    const { deps } = createWorkerDeps(w);
    const err = await caught(prepareWith(new File(["x"], "a.heic", { type: "image/heic" }), deps));
    expect(err).toMatchObject({ code: "tooManyPixels" });
    expect(w.posted.map((m) => m.op)).toEqual(["load", "release"]);
  });

  test("release posts a release message", async () => {
    const w = new FakeWorker();
    const { deps } = createWorkerDeps(w);
    const img = await deps.load(jpeg());
    img.release();
    expect(w.posted.at(-1)).toMatchObject({ op: "release", id: expect.any(Number) });
  });
});
