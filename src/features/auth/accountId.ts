const KEY = "mm_account_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only auth value kept on the device (consumers.md): the Identity account session id, not a secret. */
export function readAccountId(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return null;
    if (UUID_RE.test(v)) return v;
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
  return null;
}

export function writeAccountId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable: the session just will not survive a reload
  }
}

export function clearAccountId(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
