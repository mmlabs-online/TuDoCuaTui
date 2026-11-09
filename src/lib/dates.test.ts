import { afterEach, describe, expect, test, vi } from "vitest";
import { daysSince, localToday, toLocalDate } from "./dates";

afterEach(() => vi.useRealTimers());

const at = (iso: string) => Date.parse(iso);

describe("localToday", () => {
  test("localToday returns the UTC+7 date just after local midnight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-06T17:30:00Z");
    expect(localToday()).toBe("2026-11-07");
  });
});

describe("toLocalDate", () => {
  test("toLocalDate passes YYYY-MM-DD through unchanged", () => {
    expect(toLocalDate("2026-11-07")).toBe("2026-11-07");
  });

  test("toLocalDate turns a timestamp into the local (UTC+7) calendar date", () => {
    expect(toLocalDate("2026-11-06T18:30:00.000Z")).toBe("2026-11-07");
    expect(toLocalDate("2026-11-06T16:59:59.000Z")).toBe("2026-11-06");
  });

  test('toLocalDate returns "" for empty and invalid input', () => {
    expect(toLocalDate("")).toBe("");
    expect(toLocalDate("not a date")).toBe("");
  });
});

describe("daysSince", () => {
  test("daysSince is 0 at 02:00 UTC+7 for a YYYY-MM-DD worn today", () => {
    expect(daysSince("2026-11-07", at("2026-11-07T02:00:00+07:00"))).toBe(0);
  });

  test("daysSince is 0 at 23:59 and 1 at 00:00 the next local day", () => {
    expect(daysSince("2026-11-07", at("2026-11-07T23:59:00+07:00"))).toBe(0);
    expect(daysSince("2026-11-07", at("2026-11-08T00:00:00+07:00"))).toBe(1);
  });

  test("daysSince counts calendar days for ISO timestamps (worn 23:00 yesterday → 1 at 01:00)", () => {
    expect(daysSince("2026-11-06T23:00:00+07:00", at("2026-11-07T01:00:00+07:00"))).toBe(1);
  });

  test("daysSince returns null for empty/invalid and 0 for a future date", () => {
    expect(daysSince("", at("2026-11-07T02:00:00+07:00"))).toBeNull();
    expect(daysSince("garbage", at("2026-11-07T02:00:00+07:00"))).toBeNull();
    expect(daysSince("2026-11-09", at("2026-11-07T02:00:00+07:00"))).toBe(0);
  });

  test("daysSince across a month and year boundary", () => {
    expect(daysSince("2025-12-31", at("2026-01-01T02:00:00+07:00"))).toBe(1);
    expect(daysSince("2026-02-28", at("2026-03-01T02:00:00+07:00"))).toBe(1);
  });
});
