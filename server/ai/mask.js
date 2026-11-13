// @ts-check
// Server copy of src/shared/ai/mask.ts (parity.test.ts).

const HINT_LENGTH = 4;

/** Last 4 characters of the trimmed key. @param {string} key */
export function keyHintOf(key) {
  return key.trim().slice(-HINT_LENGTH);
}

/** @param {string | null} hint @returns {string | null} */
export function maskHint(hint) {
  return hint === null ? null : "••••" + hint;
}
