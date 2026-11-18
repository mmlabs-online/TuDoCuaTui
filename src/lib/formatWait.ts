/** "2 giờ" / "5 phút" from a `Retry-After` in seconds; unknown → "ít phút". */
export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "ít phút";
  if (seconds < 60) return `${Math.ceil(seconds)} giây`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} phút`;
  return `${Math.ceil(seconds / 3600)} giờ`;
}
