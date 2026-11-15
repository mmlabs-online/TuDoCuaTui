import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { TURNSTILE_SITE_KEY } from "./config";
import { loadTurnstile, type TurnstileApi } from "./turnstile";

export type TurnstileHandle = { reset: () => void };

type Props = {
  onToken: (token: string) => void;
  onExpire: () => void;
  /** Script failed to load, the challenge errored, or no site key is configured. */
  onError: () => void;
  ref?: Ref<TurnstileHandle>;
  siteKey?: string;
};

/** Renders the Turnstile challenge into a slot; the token is single-use, so callers `reset()` after each submit. */
export function TurnstileWidget({
  onToken,
  onExpire,
  onError,
  ref,
  siteKey = TURNSTILE_SITE_KEY,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const cb = useRef({ onToken, onExpire, onError });
  cb.current = { onToken, onExpire, onError };

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (api.current) api.current.api.reset(api.current.id);
    },
  }));

  useEffect(() => {
    if (!siteKey) {
      cb.current.onError();
      return;
    }
    let cancelled = false;
    loadTurnstile().then(
      (t) => {
        if (cancelled || !el.current) return;
        const id = t.render(el.current, {
          sitekey: siteKey,
          size: "flexible",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          callback: (token) => cb.current.onToken(token),
          "expired-callback": () => cb.current.onExpire(),
          "error-callback": () => cb.current.onError(),
        });
        api.current = { api: t, id };
      },
      () => {
        if (!cancelled) cb.current.onError();
      },
    );
    return () => {
      cancelled = true;
      if (api.current) api.current.api.remove(api.current.id);
      api.current = null;
    };
  }, [siteKey]);

  return siteKey ? <div ref={el} /> : null;
}
