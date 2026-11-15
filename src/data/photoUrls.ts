import { ApiError } from "./apiErrors";
import { createAuthedFetch, type GetToken } from "./authFetch";
import { apiPhotoId } from "./mappers";

export interface PhotoHandle {
  promise: Promise<string>;
  release: () => void;
}

export interface PhotoLoader {
  handles: (src: string) => boolean;
  acquire: (src: string) => PhotoHandle;
  clear: () => void;
}

export interface PhotoLoaderOptions {
  getToken: GetToken;
  /** A request got 401 again with a freshly fetched token. */
  onAuthLost?: () => void;
  fetchFn?: typeof fetch;
  base?: string;
  maxConcurrent?: number;
  keepUnused?: number;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

interface Entry {
  id: string;
  state: "queued" | "loading" | "ready";
  refs: number;
  url?: string;
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
  ctrl: AbortController;
}

/**
 * API + identity mode: photos are fetched with the bearer token and shown as `blob:` URLs
 * (an `<img>` cannot send a bearer header, D34). The token goes only into the Authorization header.
 */
export function createPhotoLoader({
  getToken,
  onAuthLost,
  fetchFn = (...a) => fetch(...a),
  base = "/api",
  maxConcurrent = 4,
  keepUnused = 40,
  createUrl = (b) => URL.createObjectURL(b),
  revokeUrl = (u) => URL.revokeObjectURL(u),
}: PhotoLoaderOptions): PhotoLoader {
  const authedFetch = createAuthedFetch({ fetchFn, getToken, onAuthLost });
  let entries = new Map<string, Entry>();
  let queue: Entry[] = [];
  let unused = new Set<string>(); // insertion order = LRU
  let active = 0;
  let generation = 0;

  const drop = (e: Entry) => {
    if (e.url) revokeUrl(e.url);
    unused.delete(e.id);
    entries.delete(e.id);
  };

  const run = async (e: Entry, gen: number) => {
    try {
      const res = await authedFetch(`${base}/photos/${e.id}`, {
        credentials: "same-origin",
        redirect: "manual",
        signal: e.ctrl.signal,
      });
      if (res.type === "opaqueredirect") throw new ApiError(401, "unauthorized");
      if (!res.ok) throw new ApiError(res.status, "unexpected");
      if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) {
        throw new ApiError(res.status, "unexpected");
      }
      const blob = new Blob([await res.blob()], { type: "image/jpeg" });
      if (gen !== generation) throw new ApiError(0, "network");
      e.url = createUrl(blob);
      e.state = "ready";
      e.resolve(e.url);
    } catch (err) {
      if (gen === generation) {
        entries.delete(e.id);
        unused.delete(e.id);
      }
      e.reject(err);
    } finally {
      if (gen === generation) {
        active--;
        pump();
      }
    }
  };

  const pump = () => {
    while (active < maxConcurrent && queue.length) {
      const e = queue.shift()!;
      e.state = "loading";
      active++;
      void run(e, generation);
    }
  };

  const acquire = (src: string): PhotoHandle => {
    const id = apiPhotoId(src, base);
    if (!id) throw new Error("not an API photo URL");
    let e = entries.get(id);
    if (!e) {
      let resolve!: (url: string) => void;
      let reject!: (err: unknown) => void;
      const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      promise.catch(() => {}); // callers handle it; avoids an unhandled rejection when nobody listens
      e = { id, state: "queued", refs: 0, promise, resolve, reject, ctrl: new AbortController() };
      entries.set(id, e);
      queue.push(e);
    }
    e.refs++;
    unused.delete(id);
    pump();
    const entry = e;
    const gen = generation;
    let released = false;
    return {
      promise: entry.promise,
      release: () => {
        if (released || gen !== generation) return;
        released = true;
        entry.refs--;
        if (entry.refs > 0) return;
        if (entry.state === "queued") {
          queue = queue.filter((q) => q !== entry);
          entries.delete(entry.id);
          entry.reject(new ApiError(0, "network"));
          return;
        }
        unused.add(entry.id);
        while (unused.size > keepUnused) {
          const oldest = entries.get(unused.values().next().value as string);
          if (!oldest || oldest.state !== "ready") break;
          drop(oldest);
        }
      },
    };
  };

  return {
    handles: (src) => apiPhotoId(src, base) !== null,
    acquire,
    clear: () => {
      generation++;
      for (const e of entries.values()) {
        e.ctrl.abort();
        if (e.url) revokeUrl(e.url);
        else e.reject(new ApiError(0, "network"));
      }
      entries = new Map();
      queue = [];
      unused = new Set();
      active = 0;
    },
  };
}
