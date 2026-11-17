import { describe, expect, test, vi } from "vitest";
import {
  createPhotoWorkerHost,
  probeEnv,
  type WorkerEnv,
  type WorkerReply,
} from "./photoWorkerHost";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { decodeFails?: boolean; encodeFails?: boolean } = {}) {
  const close = vi.fn();
  const bitmap = { width: 4000, height: 3000, close };
  const createImageBitmap = vi.fn(async () => {
    if (opts.decodeFails) throw new Error("decode");
    return bitmap;
  });
  const drawImage = vi.fn();
  const out = new Blob(["jpeg"]);
  const convertToBlob = vi.fn(async () => {
    if (opts.encodeFails) throw new Error("encode");
    return out;
  });
  const sizes: [number, number][] = [];
  class FakeCanvas {
    constructor(w: number, h: number) {
      sizes.push([w, h]);
    }
    getContext() {
      return { drawImage };
    }
    convertToBlob = convertToBlob;
  }
  const env = { createImageBitmap, OffscreenCanvas: FakeCanvas } as unknown as WorkerEnv;
  const replies: WorkerReply[] = [];
  const handle = createPhotoWorkerHost(env, (m) => replies.push(m));
  return {
    handle,
    replies,
    createImageBitmap,
    drawImage,
    convertToBlob,
    sizes,
    close,
    bitmap,
    out,
  };
}

describe("photoWorkerHost", () => {
  test("decodes with createImageBitmap and from-image orientation", async () => {
    const s = setup();
    const blob = new Blob(["x"]);
    s.handle({ op: "load", id: 1, blob });
    await flush();
    expect(s.createImageBitmap).toHaveBeenCalledWith(blob, { imageOrientation: "from-image" });
    expect(s.replies).toEqual([{ id: 1, ok: true, width: 4000, height: 3000 }]);
  });

  test("decode failure replies ok:false and stores nothing", async () => {
    const s = setup({ decodeFails: true });
    s.handle({ op: "load", id: 1, blob: new Blob(["x"]) });
    await flush();
    s.handle({ op: "render", id: 1, max: 1200, quality: 0.8 });
    await flush();
    expect(s.replies).toEqual([
      { id: 1, ok: false },
      { id: 1, ok: false },
    ]);
  });

  test("renders on an OffscreenCanvas of scaledSize and encodes JPEG at the given quality", async () => {
    const s = setup();
    s.handle({ op: "load", id: 1, blob: new Blob(["x"]) });
    await flush();
    s.handle({ op: "render", id: 1, max: 1200, quality: 0.7 });
    await flush();
    expect(s.sizes).toEqual([[1200, 900]]);
    expect(s.drawImage).toHaveBeenCalledWith(s.bitmap, 0, 0, 1200, 900);
    expect(s.convertToBlob).toHaveBeenCalledWith({ type: "image/jpeg", quality: 0.7 });
    expect(s.replies[1]).toEqual({ id: 1, ok: true, blob: s.out, width: 1200, height: 900 });
  });

  test("render of an unknown id or a convertToBlob rejection replies ok:false", async () => {
    const s = setup({ encodeFails: true });
    s.handle({ op: "render", id: 9, max: 1200, quality: 0.8 });
    await flush();
    s.handle({ op: "load", id: 1, blob: new Blob(["x"]) });
    await flush();
    s.handle({ op: "render", id: 1, max: 1200, quality: 0.8 });
    await flush();
    expect(s.replies.filter((r) => "ok" in r && !r.ok)).toEqual([
      { id: 9, ok: false },
      { id: 1, ok: false },
    ]);
  });

  test("release closes the bitmap and forgets the id", async () => {
    const s = setup();
    s.handle({ op: "load", id: 1, blob: new Blob(["x"]) });
    await flush();
    s.handle({ op: "release", id: 1 });
    expect(s.close).toHaveBeenCalledTimes(1);
    s.handle({ op: "render", id: 1, max: 1200, quality: 0.8 });
    await flush();
    expect(s.replies[1]).toEqual({ id: 1, ok: false });
    s.handle({ op: "release", id: 1 });
    expect(s.close).toHaveBeenCalledTimes(1);
  });

  test("probeEnv is false without a 2d context or without convertToBlob", () => {
    const mk = (canvas: unknown, bitmap: unknown = () => {}) =>
      ({ createImageBitmap: bitmap, OffscreenCanvas: canvas }) as unknown as WorkerEnv;
    class Good {
      getContext() {
        return {};
      }
      convertToBlob() {}
    }
    class NoCtx {
      getContext() {
        return null;
      }
      convertToBlob() {}
    }
    class NoBlob {
      getContext() {
        return {};
      }
    }
    class Throws {
      constructor() {
        throw new Error("no");
      }
    }
    expect(probeEnv(mk(Good))).toBe(true);
    expect(probeEnv(mk(NoCtx))).toBe(false);
    expect(probeEnv(mk(NoBlob))).toBe(false);
    expect(probeEnv(mk(Throws))).toBe(false);
    expect(probeEnv(mk(undefined))).toBe(false);
    expect(probeEnv(mk(Good, null))).toBe(false);
  });
});
