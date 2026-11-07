export const RESEND_COOLDOWN_MS = 60_000;

/** Whole seconds left before resend is allowed; 0 when allowed or nothing was sent yet. */
export function secondsLeft(sentAt: number | null, now: number): number {
  if (sentAt == null) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000));
}
