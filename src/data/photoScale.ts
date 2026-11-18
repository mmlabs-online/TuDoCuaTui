/** Output size for a photo scaled to fit `max` on its longer side (never upscaled). Shared by both resize paths. */
export function scaledSize(width: number, height: number, max: number) {
  const r = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * r), height: Math.round(height * r) };
}
