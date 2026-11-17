import { describe, expect, it, vi } from "vitest";
import { probeServer } from "@/data/serverProbe";
import { takeTokenHash } from "./boot";

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
      await probeServer({ fetchFn: fetchFn as unknown as typeof fetch });
      expect(order).toEqual(["replaceState", "fetch"]);
    },
  );
});
