import { ApiError } from "./apiErrors";
import { createAuthedFetch, type GetToken } from "./authFetch";
import { apiPhotoId } from "./mappers";

export interface PhotoHandle {
  promise: Promise<string>;
  release: () => void;
}

export type PhotoVariant = "thumb" | "full";

export interface PhotoLoader {
  handles: (src: string) => boolean;
  acquire: (src: string, variant?: PhotoVariant) => PhotoHandle;
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
  /** Decoded-size reduction for the "thumb" variant; without it a thumb acquire shares the full entry. */
  makeThumb?: (blob: Blob) => Promise<Blob>;
  /** Separate LRU limit for thumbnails (they are small and many cards scroll back into view). */
  keepUnusedThumbs?: number;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

interface Entry {
  id: string;
  key: string;
  variant: PhotoVariant;
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
  makeThumb,
  keepUnusedThumbs = 150,
  createUrl = (b) => URL.createObjectURL(b),
  revokeUrl = (u) => URL.revokeObjectURL(u),
}: PhotoLoaderOptions): PhotoLoader {
  const authedFetch = createAuthedFetch({ fetchFn, getToken, onAuthLost });
  let entries = new Map<string, Entry>();
  let queue: Entry[] = [];
  let unused = { full: new Set<string>(), thumb: new Set<string>() }; // insertion order = LRU
  let active = 0;
  let generation = 0;

  const drop = (e: Entry) => {
    if (e.url) revokeUrl(e.url);
    unused[e.variant].delete(e.key);
    entries.delete(e.key);
  };

  const run = async (e: Entry, gen: number) => {
    try {
      const res = await authedFetch(`${base}/photos/${e.id}`, {
        credentials: "same-origin",
        redirect: "manual",
        signal: e.ctrl.signal,
      });
      if (!res.ok) throw new ApiError(res.status, "unexpected");
      if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) {
        throw new ApiError(res.status, "unexpected");
      }
      let blob = new Blob([await res.blob()], { type: "image/jpeg" });
      if (e.variant === "thumb" && makeThumb) {
        try {
          blob = await makeThumb(blob);
        } catch {
          // never fail display: show the full photo
        }
      }
      if (gen !== generation) throw new ApiError(0, "network");
      e.url = createUrl(blob);
      e.state = "ready";
      e.resolve(e.url);
    } catch (err) {
      if (gen === generation) {
        entries.delete(e.key);
        unused[e.variant].delete(e.key);
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

  const acquire = (src: string, wanted: PhotoVariant = "full"): PhotoHandle => {
    const id = apiPhotoId(src, base);
    if (!id) throw new Error("not an API photo URL");
    const variant: PhotoVariant = wanted === "thumb" && makeThumb ? "thumb" : "full";
    const key = variant === "thumb" ? `${id}#thumb` : id;
    let e = entries.get(key);
    if (!e) {
      let resolve!: (url: string) => void;
      let reject!: (err: unknown) => void;
      const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      promise.catch(() => {}); // callers handle it; avoids an unhandled rejection when nobody listens
      e = {
        id,
        key,
        variant,
        state: "queued",
        refs: 0,
        promise,
        resolve,
        reject,
        ctrl: new AbortController(),
      };
      entries.set(key, e);
      queue.push(e);
    }
    e.refs++;
    unused[variant].delete(key);
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
          entries.delete(entry.key);
          entry.reject(new ApiError(0, "network"));
          return;
        }
        const set = unused[variant];
        const limit = variant === "thumb" ? keepUnusedThumbs : keepUnused;
        set.add(entry.key);
        while (set.size > limit) {
          const oldest = entries.get(set.values().next().value as string);
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
      unused = { full: new Set(), thumb: new Set() };
      active = 0;
    },
  };
}
