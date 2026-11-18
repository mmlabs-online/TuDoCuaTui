import type { DecodedImage, PhotoDeps } from "./photoPrep";
import { scaledSize } from "./photoScale";

/** A picture decoded on the main thread by an `<img>`. */
export interface MainImage extends DecodedImage {
  source: CanvasImageSource;
}

/** Decode a picked file with the browser's own decoder (keeps EXIF orientation behaviour). */
export function loadImage(src: Blob) {
  return new Promise<MainImage>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(src);
    img.onload = () =>
      resolve({
        width: img.width,
        height: img.height,
        source: img,
        release: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

export function renderJpeg(img: MainImage, max: number, quality: number) {
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    const size = scaledSize(img.width, img.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")!.drawImage(img.source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (b) =>
        b
          ? resolve({ blob: b, width: canvas.width, height: canvas.height })
          : reject(new Error("resize failed")),
      "image/jpeg",
      quality,
    );
  });
}

/** Main-thread decode/encode: the default fallback of `preparePhoto`. */
export const mainThreadDeps: PhotoDeps<MainImage> = { load: loadImage, render: renderJpeg };

/** Downscale before upload — phone photos are 3–8 MB, we keep ~150–300 KB. */
export async function resizeImage(src: Blob, max = 1200, quality = 0.82) {
  const img = await loadImage(src);
  try {
    return await renderJpeg(img, max, quality);
  } finally {
    img.release();
  }
}

/** data:/blob:/https URL → Blob. Throws if the source can't be fetched (e.g. CORS). */
export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
  return res.blob();
}
