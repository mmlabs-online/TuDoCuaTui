// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CREDIT_PRICES,
  creditPrice,
  isLive,
  isValidOpKey,
  RESERVATION_TTL_MS,
  splitSpend,
  vnMonth,
} from "./creditMath.js";

describe("creditMath", () => {
  it("CREDIT_PRICES matches D53 (photo_fill 1, suggest 1, sticker 10) and is frozen", () => {
    expect(CREDIT_PRICES).toEqual({ photo_fill: 1, suggest: 1, sticker: 10 });
    expect(Object.isFrozen(CREDIT_PRICES)).toBe(true);
    expect(RESERVATION_TTL_MS).toBe(600_000);
  });

  it("creditPrice returns null for an unknown kind, '' and 'toString'", () => {
    expect(creditPrice("sticker")).toBe(10);
    expect(creditPrice("nope")).toBeNull();
    expect(creditPrice("")).toBeNull();
    expect(creditPrice("toString")).toBeNull();
    expect(creditPrice("__proto__")).toBeNull();
    expect(creditPrice(undefined)).toBeNull();
  });

  it("vnMonth: 2026-11-30T16:59:59.999Z -> 2026-11; 2026-11-30T17:00:00Z -> 2026-12; 2026-12-31T17:00:00Z -> 2027-01; 2026-02-28T17:00:00Z -> 2026-03", () => {
    expect(vnMonth(Date.parse("2026-11-30T16:59:59.999Z"))).toBe("2026-11");
    expect(vnMonth(Date.parse("2026-11-30T17:00:00Z"))).toBe("2026-12");
    expect(vnMonth(Date.parse("2026-12-31T17:00:00Z"))).toBe("2027-01");
    expect(vnMonth(Date.parse("2026-02-28T17:00:00Z"))).toBe("2026-03");
  });

  it("vnMonth does not depend on process TZ", () => {
    // 2026-06-30T20:00:00Z is 2026-07-01 03:00 in UTC+7 whatever TZ the process runs in.
    expect(vnMonth(Date.UTC(2026, 5, 30, 20, 0, 0))).toBe("2026-07");
    expect(vnMonth(Date.UTC(2026, 5, 30, 16, 59, 59))).toBe("2026-06");
  });

  it("splitSpend: monthly first, partial, lasting only, exact, insufficient, negative or NaN avail treated as 0", () => {
    expect(splitSpend(10, 60, 0)).toEqual({ monthlyPart: 10, lastingPart: 0 });
    expect(splitSpend(10, 4, 6)).toEqual({ monthlyPart: 4, lastingPart: 6 });
    expect(splitSpend(10, 4, 100)).toEqual({ monthlyPart: 4, lastingPart: 6 });
    expect(splitSpend(1, 0, 5)).toEqual({ monthlyPart: 0, lastingPart: 1 });
    expect(splitSpend(10, 0, 10)).toEqual({ monthlyPart: 0, lastingPart: 10 });
    expect(splitSpend(10, 4, 5)).toBeNull();
    expect(splitSpend(1, -5, 1)).toEqual({ monthlyPart: 0, lastingPart: 1 });
    expect(splitSpend(1, Number.NaN, 0)).toBeNull();
    expect(splitSpend(1, 0, Number.NaN)).toBeNull();
  });

  it("isLive: committed always; reserved when expiresAt > now (strict); refunded never", () => {
    expect(isLive({ state: "committed", expiresAt: 0 }, 100)).toBe(true);
    expect(isLive({ state: "reserved", expiresAt: 101 }, 100)).toBe(true);
    expect(isLive({ state: "reserved", expiresAt: 100 }, 100)).toBe(false);
    expect(isLive({ state: "refunded", expiresAt: 999 }, 100)).toBe(false);
  });

  it("isValidOpKey: 1..128 chars of [A-Za-z0-9_-]; rejects '', 129 chars, space, 'đ', non-string", () => {
    expect(isValidOpKey("a")).toBe(true);
    expect(isValidOpKey("A-b_9")).toBe(true);
    expect(isValidOpKey("x".repeat(128))).toBe(true);
    expect(isValidOpKey("")).toBe(false);
    expect(isValidOpKey("x".repeat(129))).toBe(false);
    expect(isValidOpKey("a b")).toBe(false);
    expect(isValidOpKey("đ")).toBe(false);
    expect(isValidOpKey(null)).toBe(false);
    expect(isValidOpKey(5)).toBe(false);
  });
});
