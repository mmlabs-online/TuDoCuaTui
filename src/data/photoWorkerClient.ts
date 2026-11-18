import type { DecodedImage, PhotoDeps } from "./photoPrep";
import { isWorkerReply, type WorkerDone, type WorkerRequest } from "./photoWorkerHost";

export class WorkerUnavailableError extends Error {
  constructor() {
    super("photo worker unavailable");
    this.name = "WorkerUnavailableError";
  }
}

/** The main thread can only check that the pieces exist; the worker reports whether its 2d context works. */
export function canUseWorker(g: Record<string, unknown> = globalThis): boolean {
  return ["Worker", "OffscreenCanvas", "createImageBitmap"].every(
    (k) => typeof g[k] === "function",
  );
}

interface WorkerLike {
  postMessage(m: WorkerRequest): void;
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void;
  terminate(): void;
}
type Pending = {
  resolve: (r: WorkerDone) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function createWorkerDeps(
  worker: WorkerLike,
  { readyTimeoutMs = 5000, requestTimeoutMs = 20_000 } = {},
) {
  const pending = new Map<number, Pending>();
  let nextId = 1;
  const state = { broken: false };
  let settleReady!: { resolve(): void; reject(e: Error): void };
  const ready = new Promise<void>((resolve, reject) => (settleReady = { resolve, reject }));
  ready.catch(() => {});

  /** Idempotent: a broken worker is terminated, so nothing it decodes later stays in memory. */
  const markBroken = () => {
    if (state.broken) return;
    state.broken = true;
    clearTimeout(timer);
    const err = new WorkerUnavailableError();
    settleReady.reject(err);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
    try {
      worker.terminate();
    } catch {
      // already gone
    }
  };
  const timer = setTimeout(markBroken, readyTimeoutMs);

  worker.addEventListener("message", (e) => {
    const m = e.data;
    if (state.broken || !isWorkerReply(m)) return;
    if ("type" in m) {
      clearTimeout(timer);
      if (m.ok) settleReady.resolve();
      else markBroken();
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    if (m.ok) p.resolve(m);
    else p.reject(new Error("photo worker request failed"));
  });
  worker.addEventListener("error", markBroken);
  worker.addEventListener("messageerror", markBroken);

  function request(msg: WorkerRequest & { id: number }) {
    return new Promise<WorkerDone>((resolve, reject) => {
      const timer = setTimeout(markBroken, requestTimeoutMs);
      pending.set(msg.id, { resolve, reject, timer });
      worker.postMessage(msg);
    });
  }

  const deps: PhotoDeps = {
    async load(blob) {
      await ready;
      const id = nextId++;
      const r = await request({ op: "load", id, blob });
      const img: DecodedImage & { id: number } = {
        id,
        width: r.width,
        height: r.height,
        release: () => worker.postMessage({ op: "release", id }),
      };
      return img;
    },
    async render(img, max, quality) {
      const r = await request({
        op: "render",
        id: (img as DecodedImage & { id: number }).id,
        max,
        quality,
      });
      if (!(r.blob instanceof Blob)) throw new Error("photo worker returned no image");
      return { blob: r.blob, width: r.width, height: r.height };
    },
  };
  return { deps, state };
}

let shared: ReturnType<typeof createWorkerDeps> | null = null;
let failed = false;

/** One worker per page, created on first use. `null` means: use the main thread. */
export function getOffThreadDeps(): PhotoDeps | null {
  if (failed || !canUseWorker()) return null;
  if (!shared) {
    try {
      shared = createWorkerDeps(
        new Worker(new URL("./photoPrep.worker.ts", import.meta.url), { type: "module" }),
      );
    } catch {
      failed = true;
      return null;
    }
  }
  if (shared.state.broken) return null;
  return shared.deps;
}
