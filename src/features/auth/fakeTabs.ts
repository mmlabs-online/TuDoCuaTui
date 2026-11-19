/** Test-only helpers that stand in for several browser tabs. Never imported by app code. */
import type { EndpointLike } from "./authChannel";
import type { LockManagerLike } from "./refreshLock";
import type { VisibilityDoc } from "./tokenStore";

/** Exclusive FIFO lock manager shared by all "tabs"; honours `signal` while a request is queued. */
export function createFakeLockManager(): LockManagerLike & { held: () => boolean } {
  const queue: {
    cb: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }[] = [];
  let held = false;
  const next = () => {
    const e = queue.shift();
    if (!e) return;
    held = true;
    void (async () => e.cb())()
      .then(e.resolve, e.reject)
      .finally(() => {
        held = false;
        next();
      });
  };
  return {
    held: () => held,
    request<T>(
      _name: string,
      opts: { mode: "exclusive"; signal: AbortSignal },
      callback: () => Promise<T>,
    ): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (opts.signal.aborted) return reject(new DOMException("aborted", "AbortError"));
        const entry = { cb: callback, resolve: resolve as (v: unknown) => void, reject };
        queue.push(entry);
        opts.signal.addEventListener(
          "abort",
          () => {
            const i = queue.indexOf(entry);
            if (i < 0) return;
            queue.splice(i, 1);
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
        if (!held) next();
      });
    },
  };
}

/** Channel endpoints that reach every other open endpoint of the hub (never the sender), as a cloned microtask. */
export function createFakeChannelHub() {
  const endpoints = new Set<{
    listeners: Set<(ev: { data: unknown }) => void>;
    open: boolean;
  }>();
  return {
    endpoint(): EndpointLike {
      const me = { listeners: new Set<(ev: { data: unknown }) => void>(), open: true };
      endpoints.add(me);
      return {
        postMessage(data) {
          if (!me.open) throw new Error("closed");
          for (const other of endpoints) {
            if (other === me) continue;
            const copy = structuredClone(data);
            queueMicrotask(() => {
              if (!other.open) return;
              for (const fn of [...other.listeners]) fn({ data: copy });
            });
          }
        },
        addEventListener: (_t, fn) => void me.listeners.add(fn),
        removeEventListener: (_t, fn) => void me.listeners.delete(fn),
        close() {
          me.open = false;
          endpoints.delete(me);
        },
      };
    },
  };
}

export function createFakeDoc(): VisibilityDoc & {
  set: (s: "visible" | "hidden") => void;
  count: () => number;
} {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as string,
    addEventListener: (_t: "visibilitychange", fn: () => void) => void listeners.add(fn),
    removeEventListener: (_t: "visibilitychange", fn: () => void) => void listeners.delete(fn),
    set(s: "visible" | "hidden") {
      doc.visibilityState = s;
      for (const fn of [...listeners]) fn();
    },
    count: () => listeners.size,
  };
  return doc;
}
