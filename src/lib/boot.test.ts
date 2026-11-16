import { describe, expect, it, vi } from "vitest";
import { detectRuntime } from "@/data/mode";
import { needsAuth, takeTokenHash } from "./boot";

const TOKEN = "A".repeat(43);
const HASH = `#token=${TOKEN}`;

describe("takeTokenHash", () => {
  it("verify link: returns page + hash and strips the hash", () => {
    const replaceState = vi.fn();
    expect(takeTokenHash({ pathname: "/verify-email", hash: HASH }, { replaceState })).toEqual({
      page: "verify",
      hash: HASH,
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/verify-email");
  });

  it("reset link: returns page + hash and strips the hash", () => {
    const replaceState = vi.fn();
    expect(takeTokenHash({ pathname: "/reset-password", hash: HASH }, { replaceState })).toEqual({
      page: "reset",
      hash: HASH,
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
  });

  it("a trailing slash is replaced with the canonical path", () => {
    const replaceState = vi.fn();
    expect(
      takeTokenHash({ pathname: "/reset-password/", hash: HASH }, { replaceState })?.page,
    ).toBe("reset");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
  });

  it("other paths and an empty hash do nothing", () => {
    const replaceState = vi.fn();
    expect(takeTokenHash({ pathname: "/", hash: HASH }, { replaceState })).toBeNull();
    expect(takeTokenHash({ pathname: "/verify-email", hash: "" }, { replaceState })).toBeNull();
    expect(takeTokenHash({ pathname: "/reset-password", hash: "" }, { replaceState })).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each(["/verify-email", "/reset-password"])(
    "replaceState runs before the /healthz fetch (%s)",
    async (pathname) => {
      const order: string[] = [];
      const fetchFn = vi.fn(async () => {
        order.push("fetch");
        return new Response('{"status":"ok"}', { headers: { "Content-Type": "application/json" } });
      });
      takeTokenHash(
        { pathname, hash: HASH },
        { replaceState: () => void order.push("replaceState") },
      );
      await detectRuntime({ fetchFn: fetchFn as unknown as typeof fetch, dev: false });
      expect(order).toEqual(["replaceState", "fetch"]);
    },
  );
});

describe("needsAuth", () => {
  const verify = { page: "verify", hash: "#token=x" } as const;
  const reset = { page: "reset", hash: "#token=x" } as const;
  it("truth table", () => {
    expect(needsAuth({ mode: "local", auth: null }, null)).toBe(false);
    expect(needsAuth({ mode: "local", auth: "identity" }, verify)).toBe(false);
    expect(needsAuth({ mode: "local", auth: null }, reset)).toBe(false);
    expect(needsAuth({ mode: "api", auth: "identity" }, null)).toBe(true);
    expect(needsAuth({ mode: "api", auth: "identity" }, verify)).toBe(true);
    expect(needsAuth({ mode: "api", auth: "identity" }, reset)).toBe(true);
    expect(needsAuth({ mode: "api", auth: null }, verify)).toBe(true);
    expect(needsAuth({ mode: "api", auth: null }, reset)).toBe(true);
    expect(needsAuth({ mode: "api", auth: null }, null)).toBe(false);
  });
});
