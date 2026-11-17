import { scaledSize } from "./photoScale";

// Worker side of the photo resize. No DOM and no UI imports: the emitted worker chunk stays tiny.

export type WorkerRequest =
  | { op: "load"; id: number; blob: Blob }
  | { op: "render"; id: number; max: number; quality: number }
  | { op: "release"; id: number };

export type WorkerDone = { id: number; ok: true; width: number; height: number; blob?: Blob };
export type WorkerReply = { type: "ready"; ok: boolean } | WorkerDone | { id: number; ok: false };

interface Bitmap {
  width: number;
  height: number;
  close(): void;
}
interface Canvas2d {
  drawImage(bitmap: Bitmap, x: number, y: number, w: number, h: number): void;
}
interface OffscreenLike {
  getContext(type: "2d"): Canvas2d | null;
  convertToBlob?(opts: { type: string; quality: number }): Promise<Blob>;
}
export interface WorkerEnv {
  createImageBitmap?: (blob: Blob, opts: { imageOrientation: "from-image" }) => Promise<Bitmap>;
  OffscreenCanvas?: new (w: number, h: number) => OffscreenLike;
}
export type PostFn = (m: WorkerReply) => void;

/** True when this worker can decode and encode (Safari before 16.4 has no 2d OffscreenCanvas). */
export function probeEnv(env: WorkerEnv): boolean {
  try {
    if (typeof env.createImageBitmap !== "function") return false;
    if (typeof env.OffscreenCanvas !== "function") return false;
    const ctx = new env.OffscreenCanvas(1, 1);
    return !!ctx.getContext("2d") && typeof ctx.convertToBlob === "function";
  } catch {
    return false;
  }
}

export function createPhotoWorkerHost(env: WorkerEnv, post: PostFn) {
  const bitmaps = new Map<number, Bitmap>();
  const fail = (id: number) => post({ id, ok: false });

  async function load(id: number, blob: Blob) {
    try {
      const bitmap = await env.createImageBitmap!(blob, { imageOrientation: "from-image" });
      bitmaps.set(id, bitmap);
      post({ id, ok: true, width: bitmap.width, height: bitmap.height });
    } catch {
      fail(id);
    }
  }

  async function render(id: number, max: number, quality: number) {
    try {
      const bitmap = bitmaps.get(id);
      if (!bitmap) return fail(id);
      const size = scaledSize(bitmap.width, bitmap.height, max);
      const canvas = new env.OffscreenCanvas!(size.width, size.height);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await canvas.convertToBlob!({ type: "image/jpeg", quality });
      post({ id, ok: true, blob, width: size.width, height: size.height });
    } catch {
      fail(id);
    }
  }

  return (m: WorkerRequest) => {
    if (m.op === "load") void load(m.id, m.blob);
    else if (m.op === "render") void render(m.id, m.max, m.quality);
    else {
      bitmaps.get(m.id)?.close();
      bitmaps.delete(m.id);
    }
  };
}
