export interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "light" | "dark";
  size?: "flexible" | "normal" | "compact";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

export interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | null = null;

/** The only place that injects the Turnstile script. Loads it once; a failed load can be retried. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (loading) return loading;
  const p = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      script.remove();
      loading = null;
      reject(new Error("turnstile_load_failed"));
    };
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  loading = p;
  return p;
}

/** Test helper: forget the cached load. */
export function resetTurnstileLoaderForTests(): void {
  loading = null;
}
