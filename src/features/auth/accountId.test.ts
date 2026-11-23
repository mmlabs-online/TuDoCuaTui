import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAccountId,
  readAccountId,
  watchAccountIdRemoved,
  writeAccountId,
  type StorageEventLike,
} from "./accountId";

const ID = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("accountId", () => {
  it("round-trips a UUID under mm_account_id", () => {
    writeAccountId(ID);
    expect(localStorage.getItem("mm_account_id")).toBe(ID);
    expect(readAccountId()).toBe(ID);
    clearAccountId();
    expect(readAccountId()).toBeNull();
  });

  it("drops and removes a value that is not a UUID", () => {
    for (const v of ["garbage", "", "x".repeat(5000)]) {
      localStorage.setItem("mm_account_id", v);
      expect(readAccountId()).toBeNull();
      expect(localStorage.getItem("mm_account_id")).toBeNull();
    }
  });

  it("swallows storage errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readAccountId()).toBeNull();
    expect(() => writeAccountId(ID)).not.toThrow();
    expect(() => clearAccountId()).not.toThrow();
  });
});

function fakeWindow() {
  const ls = new Set<(ev: StorageEventLike) => void>();
  return {
    ls,
    win: {
      addEventListener: (_t: "storage", fn: (ev: StorageEventLike) => void) => void ls.add(fn),
      removeEventListener: (_t: "storage", fn: (ev: StorageEventLike) => void) =>
        void ls.delete(fn),
    },
    emit: (ev: Partial<StorageEventLike>) =>
      ls.forEach((fn) =>
        fn({
          key: "mm_account_id",
          oldValue: ID,
          newValue: null,
          storageArea: localStorage,
          ...ev,
        }),
      ),
  };
}

describe("watchAccountIdRemoved", () => {
  it("reports a removed UUID only", () => {
    const w = fakeWindow();
    const got = vi.fn();
    watchAccountIdRemoved(got, w.win);
    w.emit({});
    expect(got).toHaveBeenCalledExactlyOnceWith(ID);
    got.mockClear();
    w.emit({ newValue: "22222222-2222-4222-8222-222222222222" }); // X -> Y
    w.emit({ key: null }); // localStorage.clear()
    w.emit({ key: "other" });
    w.emit({ oldValue: "garbage" });
    w.emit({ oldValue: null });
    w.emit({ storageArea: sessionStorage });
    expect(got).not.toHaveBeenCalled();
  });

  it("cleanup removes the listener; no window is a no-op", () => {
    const w = fakeWindow();
    const got = vi.fn();
    const stop = watchAccountIdRemoved(got, w.win);
    expect(w.ls.size).toBe(1);
    stop();
    expect(w.ls.size).toBe(0);
    w.emit({});
    expect(got).not.toHaveBeenCalled();
    vi.stubGlobal("window", undefined);
    try {
      expect(() => watchAccountIdRemoved(got)()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
