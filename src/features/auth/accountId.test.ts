import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAccountId, readAccountId, writeAccountId } from "./accountId";

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
