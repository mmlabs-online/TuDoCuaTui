// Source of truth: src/shared/ai; mirrored to supabase/functions/_shared/ai; mirror.test.ts enforces equality.

const HINT_LENGTH = 4;

/** Last 4 characters of the trimmed key. */
export function keyHintOf(key: string): string {
  return key.trim().slice(-HINT_LENGTH);
}

export function maskHint(hint: string | null): string | null {
  return hint === null ? null : "••••" + hint;
}
