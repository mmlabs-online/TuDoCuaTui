import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_SITE_KEY } from "./config";
import { TurnstileWidget, type TurnstileHandle } from "./TurnstileWidget";
import { loadTurnstile, resetTurnstileLoaderForTests, type TurnstileApi } from "./turnstile";

const scripts = () => document.head.querySelectorAll("script[src*='challenges.cloudflare.com']");
const fake = () => ({
  render: vi.fn((_el: HTMLElement, _o: unknown) => "w1"),
  reset: vi.fn(),
  remove: vi.fn(),
});
const setApi = (api: ReturnType<typeof fake> | undefined) => {
  (window as unknown as { turnstile?: unknown }).turnstile = api;
};

beforeEach(() => {
  resetTurnstileLoaderForTests();
  document.head.innerHTML = "";
});
afterEach(() => {
  cleanup();
  setApi(undefined);
  document.documentElement.classList.remove("dark");
});

describe("loadTurnstile", () => {
  it("injects the script once with render=explicit", async () => {
    const api = fake();
    setApi(api);
    const a = loadTurnstile();
    const b = loadTurnstile();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].getAttribute("src")).toContain("render=explicit");
    scripts()[0].dispatchEvent(new Event("load"));
    expect(await a).toBe(api as unknown as TurnstileApi);
    expect(await b).toBe(await a);
  });

  it("a load error rejects and a later call can retry", async () => {
    const a = loadTurnstile();
    scripts()[0].dispatchEvent(new Event("error"));
    await expect(a).rejects.toBeTruthy();
    expect(scripts()).toHaveLength(0);
    const api = fake();
    setApi(api);
    const b = loadTurnstile();
    expect(scripts()).toHaveLength(1);
    scripts()[0].dispatchEvent(new Event("load"));
    await expect(b).resolves.toBeTruthy();
  });

  it("a script that loads without window.turnstile rejects", async () => {
    const a = loadTurnstile();
    scripts()[0].dispatchEvent(new Event("load"));
    await expect(a).rejects.toBeTruthy();
  });
});

describe("TurnstileWidget", () => {
  const mount = async (props: Partial<Parameters<typeof TurnstileWidget>[0]> = {}) => {
    const api = fake();
    setApi(api);
    const handlers = { onToken: vi.fn(), onExpire: vi.fn(), onError: vi.fn() };
    const ref = createRef<TurnstileHandle>();
    const view = render(<TurnstileWidget {...handlers} ref={ref} {...props} />);
    await act(async () => {
      scripts()[0]?.dispatchEvent(new Event("load"));
    });
    return { api, handlers, ref, view };
  };

  it("renders with the site key, flexible size, and routes callbacks", async () => {
    const { api, handlers } = await mount();
    const opts = api.render.mock.calls[0][1] as Record<string, unknown> & {
      callback: (t: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    };
    expect(opts.sitekey).toBe(TURNSTILE_SITE_KEY);
    expect(opts.size).toBe("flexible");
    expect(opts.theme).toBe("light");
    opts.callback("tok");
    opts["expired-callback"]();
    opts["error-callback"]();
    expect(handlers.onToken).toHaveBeenCalledWith("tok");
    expect(handlers.onExpire).toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalled();
  });

  it("uses the dark theme when the app is dark", async () => {
    document.documentElement.classList.add("dark");
    const { api } = await mount();
    expect((api.render.mock.calls[0][1] as { theme: string }).theme).toBe("dark");
  });

  it("reset via the handle; remove on unmount", async () => {
    const { api, ref, view } = await mount();
    ref.current!.reset();
    expect(api.reset).toHaveBeenCalledWith("w1");
    view.unmount();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });

  it("an empty site key renders nothing and reports an error", async () => {
    const onError = vi.fn();
    const { container } = render(
      <TurnstileWidget siteKey="" onToken={vi.fn()} onExpire={vi.fn()} onError={onError} />,
    );
    expect(container.innerHTML).toBe("");
    expect(onError).toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);
  });

  it("a failed script load reports an error", async () => {
    const onError = vi.fn();
    render(<TurnstileWidget onToken={vi.fn()} onExpire={vi.fn()} onError={onError} />);
    await act(async () => {
      scripts()[0].dispatchEvent(new Event("error"));
    });
    expect(onError).toHaveBeenCalled();
  });
});
