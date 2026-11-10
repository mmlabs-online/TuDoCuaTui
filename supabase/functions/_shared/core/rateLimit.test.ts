import { describe, expect, it, vi } from "vitest";
import { LIMITS, checkAndRecord } from "./rateLimit";

const now = new Date("2026-11-10T12:00:00.000Z");

function fakeStore(used: number) {
  return {
    countCalls: vi.fn(async () => used),
    recordCall: vi.fn(async () => {}),
    pruneCalls: vi.fn(async () => {}),
  };
}

describe("checkAndRecord", () => {
  it("allows and records under the limit, then prunes this user's old rows", async () => {
    const s = fakeStore(LIMITS.test.max - 1);
    expect(await checkAndRecord(s, "u", "test", now)).toBe(true);
    expect(s.recordCall).toHaveBeenCalledWith("u", "test");
    expect(s.pruneCalls).toHaveBeenCalledWith("u", "2026-11-08T12:00:00.000Z");
  });

  it("refuses at the limit without recording", async () => {
    const s = fakeStore(LIMITS.save.max);
    expect(await checkAndRecord(s, "u", "save", now)).toBe(false);
    expect(s.recordCall).not.toHaveBeenCalled();
  });

  it("counts a rolling one-hour window per kind", async () => {
    const s = fakeStore(0);
    await checkAndRecord(s, "u", "test", now);
    await checkAndRecord(s, "u", "save", now);
    expect(s.countCalls).toHaveBeenNthCalledWith(1, "u", "test", "2026-11-10T11:00:00.000Z");
    expect(s.countCalls).toHaveBeenNthCalledWith(2, "u", "save", "2026-11-10T11:00:00.000Z");
    expect(LIMITS.test.max).toBe(20);
    expect(LIMITS.save.max).toBe(30);
  });

  it("fails closed when the store errors", async () => {
    const s = fakeStore(0);
    s.countCalls.mockRejectedValue(new Error("store_error"));
    await expect(checkAndRecord(s, "u", "test", now)).rejects.toThrow();
    expect(s.recordCall).not.toHaveBeenCalled();
  });
});
