import { EDITOR_COPY } from "@/features/items/copy";
import { loadImage, renderJpeg } from "./photos";

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
  source: CanvasImageSource;
  release(): void;
}

export interface PhotoDeps {
  load(src: Blob): Promise<DecodedImage>;
  render(
    img: DecodedImage,
    max: number,
    quality: number,
  ): Promise<{ blob: Blob; width: number; height: number }>;
}

/** Any accepted phone photo → a JPEG of at most MAX_UPLOAD_BYTES, or a PhotoPrepError. */
export async function preparePhoto(
  file: Blob,
  deps: PhotoDeps = { load: loadImage, render: renderJpeg },
): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoPrepError("tooLarge");
  const kind = photoKind({ type: file.type, name: (file as File).name });
  if (!kind) throw new PhotoPrepError("unsupportedType");
  let img: DecodedImage;
  try {
    img = await deps.load(file);
  } catch {
    throw new PhotoPrepError(kind === "heic" ? "heicUnsupported" : "unreadable");
  }
  try {
    for (const { max, quality } of ENCODE_STEPS) {
      let out: { blob: Blob; width: number; height: number };
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
