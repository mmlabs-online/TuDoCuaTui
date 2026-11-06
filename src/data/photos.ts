/** Downscale before upload — phone photos are 3–8 MB, we keep ~150–300 KB. */
export function resizeImage(src: Blob, max = 1200, quality = 0.82) {
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(src);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * r);
      canvas.height = Math.round(img.height * r);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) =>
          b
            ? resolve({ blob: b, width: canvas.width, height: canvas.height })
            : reject(new Error("resize failed")),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

/** data:/blob:/https URL → Blob. Throws if the source can't be fetched (e.g. CORS). */
export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
  return res.blob();
}
