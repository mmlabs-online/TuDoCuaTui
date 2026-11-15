import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { PhotoLoader } from "./photoUrls";

/** Null in local and Access mode: photos then render from their plain URL. */
export const PhotoLoaderContext = createContext<PhotoLoader | null>(null);

type Resolved = { src: string; url: string | null; failed: boolean };

/**
 * `src` to put in an `<img>`: the URL itself when no loader handles it, a `blob:` URL once loaded, `null` while
 * pending. `lazy` loads only while the element is near the viewport.
 */
export function usePhotoUrl(src: string, { lazy }: { lazy: boolean }) {
  const loader = useContext(PhotoLoaderContext);
  const handled = !!loader && loader.handles(src);
  const [node, setNode] = useState<Element | null>(null);
  const [state, setState] = useState<Resolved>({ src: "", url: null, failed: false });
  const ref = useCallback((el: Element | null) => setNode(el), []);
  const observe = handled && lazy && typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    if (!loader || !handled) return;
    let release: (() => void) | null = null;
    let stale = false;
    const start = () => {
      if (release) return;
      const h = loader.acquire(src);
      release = h.release;
      h.promise.then(
        (url) => !stale && setState({ src, url, failed: false }),
        () => !stale && setState({ src, url: null, failed: true }),
      );
    };
    const stop = () => {
      release?.();
      release = null;
      setState({ src: "", url: null, failed: false });
    };
    if (!observe) {
      start();
      return () => {
        stale = true;
        release?.();
      };
    }
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last.isIntersecting) start();
        else stop();
      },
      { rootMargin: "300px" },
    );
    io.observe(node);
    return () => {
      stale = true;
      io.disconnect();
      release?.();
    };
  }, [loader, handled, observe, node, src]);

  if (!handled) return { src, failed: false, ref };
  const mine = state.src === src;
  return { src: mine ? state.url : null, failed: mine && state.failed, ref };
}
