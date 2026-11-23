export const ACCOUNT_ID_KEY = "mm_account_id";
const KEY = ACCOUNT_ID_KEY;
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

export interface StorageEventLike {
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  storageArea?: unknown;
}
export interface StorageWindowLike {
  addEventListener: (type: "storage", fn: (ev: StorageEventLike) => void) => void;
  removeEventListener: (type: "storage", fn: (ev: StorageEventLike) => void) => void;
}

/**
 * Reports another tab removing the account id (the `storage` event never fires in the tab that made the change).
 * Only an explicit removal of a UUID counts: a change to another account, `clear()` and other keys are ignored.
 * Returns the cleanup; a no-op without `window`.
 */
export function watchAccountIdRemoved(
  onRemoved: (id: string) => void,
  win: StorageWindowLike | undefined = typeof window !== "undefined" ? window : undefined,
): () => void {
  if (!win) return () => {};
  const handler = (ev: StorageEventLike) => {
    try {
      if (ev.key !== KEY || ev.newValue !== null) return;
      if (typeof ev.oldValue !== "string" || !UUID_RE.test(ev.oldValue)) return;
      if (ev.storageArea != null && ev.storageArea !== localStorage) return;
      onRemoved(ev.oldValue);
    } catch {
      // storage unavailable
    }
  };
  win.addEventListener("storage", handler);
  return () => win.removeEventListener("storage", handler);
}
