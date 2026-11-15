import { describe, expect, it, vi } from "vitest";
import { detectRuntime } from "@/data/mode";
import { needsAuth, takeVerifyHash } from "./boot";

const TOKEN = "A".repeat(43);

describe("takeVerifyHash", () => {
  it("returns the hash and strips it from the address bar", () => {
    const replaceState = vi.fn();
    expect(
      takeVerifyHash({ pathname: "/verify-email", hash: `#token=${TOKEN}` }, { replaceState }),
    ).toBe(`#token=${TOKEN}`);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/verify-email");
  });

  it("other paths and an empty hash do nothing", () => {
    const replaceState = vi.fn();
    expect(takeVerifyHash({ pathname: "/", hash: `#token=${TOKEN}` }, { replaceState })).toBeNull();
    expect(takeVerifyHash({ pathname: "/verify-email", hash: "" }, { replaceState })).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("replaceState runs before the /healthz fetch", async () => {
    const order: string[] = [];
    const fetchFn = vi.fn(async () => {
      order.push("fetch");
      return new Response('{"status":"ok"}', { headers: { "Content-Type": "application/json" } });
    });
    takeVerifyHash(
      { pathname: "/verify-email", hash: `#token=${TOKEN}` },
      { replaceState: () => void order.push("replaceState") },
    );
    await detectRuntime({ fetchFn: fetchFn as unknown as typeof fetch, dev: false });
    expect(order).toEqual(["replaceState", "fetch"]);
  });
});

describe("needsAuth", () => {
  const h = "#token=x";
  it("truth table", () => {
    expect(needsAuth({ mode: "local", auth: null }, null)).toBe(false);
    expect(needsAuth({ mode: "local", auth: "identity" }, h)).toBe(false);
    expect(needsAuth({ mode: "api", auth: "identity" }, null)).toBe(true);
    expect(needsAuth({ mode: "api", auth: "identity" }, h)).toBe(true);
    expect(needsAuth({ mode: "api", auth: "access" }, h)).toBe(true);
    expect(needsAuth({ mode: "api", auth: null }, h)).toBe(true);
    expect(needsAuth({ mode: "api", auth: "access" }, null)).toBe(false);
    expect(needsAuth({ mode: "api", auth: null }, null)).toBe(false);
  });
});
