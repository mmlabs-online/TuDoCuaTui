// Source of truth: src/shared/ai; mirrored by server/ai/*.js; server/ai/parity.test.ts enforces equality.

const HINT_LENGTH = 4;

/** Last 4 characters of the trimmed key. */
export function keyHintOf(key: string): string {
  return key.trim().slice(-HINT_LENGTH);
}

export function maskHint(hint: string | null): string | null {
  return hint === null ? null : "••••" + hint;
}
