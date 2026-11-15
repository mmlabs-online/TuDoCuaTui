import { describe, expect, it } from "vitest";
import { createPhotoQuota, PHOTO_LIMITS, storedAllows } from "./photoQuota.js";

const H = 60 * 60 * 1000;

function setup(opts: { exempt?: string | null; dailyMax?: number } = {}) {
  let t = 1_000_000;
  const q = createPhotoQuota({
    storedMax: 2,
    dailyMax: opts.dailyMax ?? 2,
    windowMs: H,
    now: () => t,
    exempt: opts.exempt,
  });
  return { q, advance: (ms: number) => (t += ms) };
}

describe("PHOTO_LIMITS", () => {
  it("defaults are 500 stored, 50 per 24 h", () => {
    expect(PHOTO_LIMITS).toEqual({ storedMax: 500, dailyMax: 50, windowMs: 24 * H });
  });
});

describe("storedAllows", () => {
  it.each([
    [{ total: 1, onItem: 0, cap: 2 }, true],
    [{ total: 2, onItem: 0, cap: 2 }, false],
    [{ total: 2, onItem: 1, cap: 2 }, true],
    [{ total: 5, onItem: 1, cap: 2 }, false],
    [{ total: 5, onItem: 1, cap: 5 }, true],
    [{ total: 9999, onItem: 0, cap: null }, true],
    [{ total: 0, onItem: 0, cap: 0 }, false],
  ])("%j -> %s", (input, want) => {
    expect(storedAllows(input)).toBe(want);
  });
});

describe("createPhotoQuota", () => {
  it("reserves dailyMax times, then refuses with a rounded-up Retry-After", () => {
    const { q, advance } = setup();
    expect(q.reserve("u").ok).toBe(true);
    advance(1000);
    expect(q.reserve("u").ok).toBe(true);
    advance(500);
    const r = q.reserve("u");
    expect(r).toEqual({ ok: false, retryAfterSec: Math.ceil((H - 1500) / 1000) });
  });

  it("rolling window: one more reserve succeeds just after the oldest entry leaves", () => {
    const { q, advance } = setup();
    q.reserve("u");
    advance(10);
    q.reserve("u");
    advance(H - 11);
    expect(q.reserve("u").ok).toBe(false);
    advance(2);
    expect(q.reserve("u").ok).toBe(true);
  });

  it("refund removes exactly that reservation; twice is a no-op; the slot is reusable", () => {
    const { q } = setup();
    const a = q.reserve("u");
    const b = q.reserve("u");
    expect(q.reserve("u").ok).toBe(false);
    if (!a.ok || !b.ok) throw new Error("expected tickets");
    a.refund();
    a.refund();
    expect(q.reserve("u").ok).toBe(true);
    expect(q.reserve("u").ok).toBe(false);
    b.refund();
    expect(q.reserve("u").ok).toBe(true);
  });

  it("a rejected reserve records nothing (no self-extending lockout)", () => {
    const { q, advance } = setup();
    q.reserve("u");
    q.reserve("u");
    for (let i = 0; i < 50; i++) {
      advance(1);
      expect(q.reserve("u").ok).toBe(false);
    }
    advance(H);
    expect(q.reserve("u").ok).toBe(true);
  });

  it("two users are independent", () => {
    const { q } = setup();
    q.reserve("a");
    q.reserve("a");
    expect(q.reserve("a").ok).toBe(false);
    expect(q.reserve("b").ok).toBe(true);
  });

  it("exempt user: always a ticket, nothing recorded; storedCap is null; others get storedMax", () => {
    const { q } = setup({ exempt: "owner", dailyMax: 1 });
    for (let i = 0; i < 5; i++) expect(q.reserve("owner").ok).toBe(true);
    expect(q.size()).toBe(0);
    expect(q.storedCap("owner")).toBeNull();
    expect(q.storedCap("other")).toBe(2);
  });

  it("exempt: null exempts nobody", () => {
    const { q } = setup({ exempt: null, dailyMax: 1 });
    expect(q.storedCap("owner")).toBe(2);
    q.reserve("owner");
    expect(q.reserve("owner").ok).toBe(false);
  });

  it("idle users are swept", () => {
    const { q, advance } = setup();
    q.reserve("a");
    q.reserve("b");
    expect(q.size()).toBe(2);
    advance(H + 1);
    q.sweepNow();
    expect(q.size()).toBe(0);
  });
});
