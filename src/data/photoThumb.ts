import { mainThreadDeps } from "./photos";
import type { PhotoDeps } from "./photoPrep";
import { getOffThreadDeps } from "./photoWorkerClient";

/** Long edge of a card thumbnail: about 2x the largest tile (~180 x 240 CSS px) for high-DPI screens. */
export const THUMB_MAX = 480;
export const THUMB_QUALITY = 0.8;

/** A JPEG whose long edge is at most THUMB_MAX; the original blob when it is already that small. */
export async function thumbWith(blob: Blob, deps: PhotoDeps): Promise<Blob> {
  const img = await deps.load(blob);
  try {
    if (Math.max(img.width, img.height) <= THUMB_MAX) return blob;
    return (await deps.render(img, THUMB_MAX, THUMB_QUALITY)).blob;
  } finally {
    img.release();
  }
}

/** Off-thread first (when the browser can); any failure is retried once on the main thread. */
export async function makeThumb(
  blob: Blob,
  sources: { offThread: () => PhotoDeps | null; main: PhotoDeps } = {
    offThread: getOffThreadDeps,
    main: mainThreadDeps,
  },
): Promise<Blob> {
  const off = sources.offThread();
  if (!off) return thumbWith(blob, sources.main);
  try {
    return await thumbWith(blob, off);
  } catch {
    return thumbWith(blob, sources.main);
  }
}
