import { afterEach, describe, expect, test, vi } from "vitest";
import { clearLegacyAuthKeys } from "./legacySession";

const fakeStorage = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
  };
};

describe("clearLegacyAuthKeys", () => {
  test("removes sb-<ref>-auth-token and sb-<ref>-auth-token-code-verifier", () => {
    const s = fakeStorage({ "sb-abc-auth-token": "1", "sb-abc-auth-token-code-verifier": "2" });
    expect(clearLegacyAuthKeys(s)).toBe(2);
    expect(s.m.size).toBe(0);
  });

  test("keeps tu-do-items, tu-do-theme and unrelated keys", () => {
    const keep = {
      "tu-do-items": "[]",
      "tu-do-theme": "dark",
      "sb-x": "1",
      "my-sb-a-auth-token": "1",
      "sb-a-auth-token-extra": "1",
    };
    const s = fakeStorage({ ...keep, "sb-a-auth-token": "1" });
    expect(clearLegacyAuthKeys(s)).toBe(1);
    expect([...s.m.keys()].sort()).toEqual(Object.keys(keep).sort());
  });

  test("removes every matching key when several exist and returns the count", () => {
    const s = fakeStorage({
      "sb-a-auth-token": "1",
      "sb-b-auth-token": "1",
      "sb-c-auth-token-code-verifier": "1",
      "tu-do-items": "[]",
    });
    expect(clearLegacyAuthKeys(s)).toBe(3);
    expect([...s.m.keys()]).toEqual(["tu-do-items"]);
  });

  test("does not throw when storage throws and returns 0", () => {
    const boom = () => {
      throw new Error("denied");
    };
    expect(clearLegacyAuthKeys({ length: 1, key: boom, removeItem: boom })).toBe(0);
    expect(
      clearLegacyAuthKeys({
        get length(): number {
          throw new Error("denied");
        },
        key: () => null,
        removeItem: boom,
      }),
    ).toBe(0);
    expect(clearLegacyAuthKeys({ length: 1, key: () => "sb-a-auth-token", removeItem: boom })).toBe(
      0,
    );
  });

  describe("default storage", () => {
    afterEach(() => vi.unstubAllGlobals());

    test("clears legacy keys from window.localStorage when no storage is passed", () => {
      localStorage.setItem("sb-abc-auth-token", "1");
      localStorage.setItem("tu-do-theme", "dark");
      expect(clearLegacyAuthKeys()).toBe(1);
      expect(localStorage.getItem("sb-abc-auth-token")).toBeNull();
      expect(localStorage.getItem("tu-do-theme")).toBe("dark");
      localStorage.clear();
    });

    test("returns 0 when reading window.localStorage throws (site data blocked)", () => {
      vi.stubGlobal("localStorage", undefined);
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("denied", "SecurityError");
        },
      });
      expect(() => clearLegacyAuthKeys()).not.toThrow();
      expect(clearLegacyAuthKeys()).toBe(0);
    });
  });
});
