import { AUTH_LOCK_NAME } from "./config";

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface LockManagerLike {
  request: <T>(
    name: string,
    options: { mode: "exclusive"; signal: AbortSignal },
    callback: () => Promise<T>,
  ) => Promise<T>;
}

export interface RefreshLock {
  /**
   * Runs `fn` while holding the cross-tab renewal lock (`locked` = true). Without Web Locks, or when the
   * lock cannot be had within `waitMs`, `fn` runs at once with `locked` = false. `fn`'s own rejection propagates.
   */
  run: <T>(fn: (locked: boolean) => Promise<T>, opts: { waitMs: number }) => Promise<T>;
}

const detectLocks = (): LockManagerLike | undefined =>
  typeof navigator !== "undefined" && typeof navigator.locks?.request === "function"
    ? (navigator.locks as unknown as LockManagerLike)
    : undefined;

export function createRefreshLock(
  deps: { locks?: LockManagerLike; name?: string; timers?: Timers } = {},
): RefreshLock {
  const name = deps.name ?? AUTH_LOCK_NAME;
  const timers = deps.timers ?? defaultTimers;
  return {
    async run(fn, { waitMs }) {
      const locks = "locks" in deps ? deps.locks : detectLocks();
      if (!locks) return fn(false);
      const abort = new AbortController();
      const wait = timers.setTimeout(() => abort.abort(), waitMs);
      let granted = false;
      try {
        return await locks.request(name, { mode: "exclusive", signal: abort.signal }, () => {
          granted = true;
          timers.clearTimeout(wait);
          return fn(true);
        });
      } catch (err) {
        if (granted) throw err;
        // SecurityError, or the wait was aborted: renew without the lock
        timers.clearTimeout(wait);
        return fn(false);
      }
    },
  };
}
