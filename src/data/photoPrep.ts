import { EDITOR_COPY } from "@/features/items/copy";
import { mainThreadDeps } from "./photos";
import { getOffThreadDeps } from "./photoWorkerClient";

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
/** Mirrors `MAX_BYTES` in server/photos.js (2 MiB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ENCODE_STEPS = [
  { max: 1200, quality: 0.82 },
  { max: 1200, quality: 0.7 },
  { max: 1200, quality: 0.55 },
  { max: 900, quality: 0.55 },
  { max: 600, quality: 0.5 },
] as const;

export type PhotoKind = "jpeg" | "png" | "webp" | "heic";

const MIME_KIND: Record<string, PhotoKind> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heic",
};
const EXT_KIND: Record<string, PhotoKind> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  jfif: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
};

/** MIME type first; the extension only when the type is empty or generic (Windows gives HEIC no type). */
export function photoKind({ type, name }: { type: string; name?: string }): PhotoKind | null {
  const t = type.toLowerCase();
  if (t && t !== "application/octet-stream") return MIME_KIND[t] ?? null;
  const dot = (name ?? "").lastIndexOf(".");
  return dot < 0 ? null : (EXT_KIND[name!.slice(dot + 1).toLowerCase()] ?? null);
}

export type PhotoPrepCode =
  | "tooLarge"
  | "unsupportedType"
  | "heicUnsupported"
  | "unreadable"
  | "tooLargeAfterResize";

export class PhotoPrepError extends Error {
  constructor(public code: PhotoPrepCode) {
    super(EDITOR_COPY.photo.errors[code]);
    this.name = "PhotoPrepError";
  }
}

export interface DecodedImage {
  width: number;
  height: number;
  release(): void;
}

export interface PhotoDeps<T extends DecodedImage = DecodedImage> {
  load(src: Blob): Promise<T>;
  render(
    img: T,
    max: number,
    quality: number,
  ): Promise<{ blob: Blob; width: number; height: number }>;
}

type Prepared = { blob: Blob; width: number; height: number };

/** Any accepted phone photo → a JPEG of at most MAX_UPLOAD_BYTES, or a PhotoPrepError (using exactly `deps`). */
export async function prepareWith<T extends DecodedImage>(
  file: Blob,
  deps: PhotoDeps<T>,
): Promise<Prepared> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoPrepError("tooLarge");
  const kind = photoKind({ type: file.type, name: (file as File).name });
  if (!kind) throw new PhotoPrepError("unsupportedType");
  let img: T;
  try {
    img = await deps.load(file);
  } catch {
    throw new PhotoPrepError(kind === "heic" ? "heicUnsupported" : "unreadable");
  }
  try {
    for (const { max, quality } of ENCODE_STEPS) {
      let out: Prepared;
      try {
        out = await deps.render(img, max, quality);
      } catch {
        throw new PhotoPrepError("unreadable");
      }
      if (out.blob.size <= MAX_UPLOAD_BYTES) return out;
    }
    throw new PhotoPrepError("tooLargeAfterResize");
  } finally {
    img.release();
  }
}

const DETERMINISTIC: PhotoPrepCode[] = ["tooLarge", "unsupportedType", "tooLargeAfterResize"];

/** Off-thread first (when the browser can); any other failure is retried once on the main thread. */
export async function preparePhotoAuto(
  file: Blob,
  sources: { offThread: () => PhotoDeps | null; main: PhotoDeps },
): Promise<Prepared> {
  const off = sources.offThread();
  if (!off) return prepareWith(file, sources.main);
  try {
    return await prepareWith(file, off);
  } catch (e) {
    if (e instanceof PhotoPrepError && DETERMINISTIC.includes(e.code)) throw e;
    return prepareWith(file, sources.main);
  }
}

/** Without `deps`: resize in a worker when supported, else on the main thread. */
export function preparePhoto(file: Blob, deps?: PhotoDeps): Promise<Prepared> {
  return deps
    ? prepareWith(file, deps)
    : preparePhotoAuto(file, { offThread: getOffThreadDeps, main: mainThreadDeps });
}
