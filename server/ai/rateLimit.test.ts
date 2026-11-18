// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { createLimiter, GLOBAL_LIMITS, LIMITS } from "./rateLimit.js";

describe("limiter", () => {
  it("30 saves pass, the 31st fails, an hour later it passes again", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 30; i++) expect(l.check(OWNER_A, "save")).toBe(true);
    expect(l.check(OWNER_A, "save")).toBe(false);
    expect(l.check(OWNER_A, "save")).toBe(false); // a failed check records nothing
    t += 60 * 60 * 1000 + 1;
    expect(l.check(OWNER_A, "save")).toBe(true);
  });

  it("counts kinds separately", () => {
    const l = createLimiter({ now: () => 5 });
    for (let i = 0; i < 20; i++) expect(l.check(OWNER_A, "test")).toBe(true);
    expect(l.check(OWNER_A, "test")).toBe(false);
    expect(l.check(OWNER_A, "save")).toBe(true);
  });

  it("tag kind: 100 per 24 h, independent, window rolls", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 100; i++) expect(l.check(OWNER_A, "tag")).toBe(true);
    expect(l.check(OWNER_A, "tag")).toBe(false);
    expect(l.check(OWNER_A, "test")).toBe(true);
    expect(l.check(OWNER_A, "save")).toBe(true);
    t += 23 * 60 * 60 * 1000;
    expect(l.check(OWNER_A, "tag")).toBe(false);
    t += 60 * 60 * 1000 + 1;
    expect(l.check(OWNER_A, "tag")).toBe(true);
  });

  it("defaults to the real clock", () => {
    expect(createLimiter().check(OWNER_A, "save")).toBe(true);
  });

  it("is per user: A's 31st save fails, B's first passes", () => {
    const l = createLimiter({ now: () => 5 });
    for (let i = 0; i < 30; i++) expect(l.check(OWNER_A, "save")).toBe(true);
    expect(l.check(OWNER_A, "save")).toBe(false);
    expect(l.check(OWNER_B, "save")).toBe(true);
  });

  it.each(["test", "save", "tag", "suggest"] as const)("global ceiling for %s", (kind) => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    const { max, windowMs } = GLOBAL_LIMITS[kind];
    for (let i = 0; i < max; i++) expect(l.check(`u${i % 100}`, kind)).toBe(true);
    expect(l.check("fresh", kind)).toBe(false);
    t += windowMs + 1;
    expect(l.check("fresh", kind)).toBe(true);
  });

  it("a rejected call records nothing", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    // (a) per-user rejection leaves the global count alone: 20 of A, then 280 from others fill the ceiling exactly
    for (let i = 0; i < 20; i++) l.check("a", "test");
    for (let i = 0; i < 50; i++) expect(l.check("a", "test")).toBe(false);
    for (let i = 0; i < 280; i++) expect(l.check(`o${i % 14}`, "test")).toBe(true);
    expect(l.check("z", "test")).toBe(false);
    // (b) global rejection does not consume the user's slot
    for (let i = 0; i < 50; i++) expect(l.check("late", "test")).toBe(false);
    t += 60 * 60 * 1000 + 1;
    for (let i = 0; i < 20; i++) expect(l.check("late", "test")).toBe(true);
    expect(l.check("late", "test")).toBe(false);
  });

  it("evicts idle users", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 50; i++) l.check(`u${i}`, "save");
    expect(l.size()).toBe(50);
    t += 24 * 60 * 60 * 1000 + 1;
    l.check("u0", "save"); // the user's own next check keeps only live entries
    expect(l.size()).toBe(50);
    for (let i = 0; i < 256; i++) l.check("u0", "save"); // periodic sweep
    expect(l.size()).toBe(1);
  });

  it("sweeps when the map grows past 1024 users", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 1025; i++) l.check(`s${i}`, "tag");
    expect(l.size()).toBe(1025);
    t += 25 * 60 * 60 * 1000;
    l.check("next", "tag");
    expect(l.size()).toBe(1);
  });

  it("a user whose calls all expired is deleted on the rejection path too", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    l.check("x", "save");
    t += 24 * 60 * 60 * 1000 + 1;
    for (let i = 0; i < 600; i++) l.check(`g${i}`, "save");
    expect(l.check("x", "save")).toBe(false);
    expect(l.size()).toBe(600);
  });
});

describe("owner lane", () => {
  const KINDS = ["test", "save", "tag", "suggest"] as const;
  const others = (n: number) =>
    Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("owner passes when other users have filled the global ceiling (each kind)", () => {
    for (const kind of KINDS) {
      const l = createLimiter({ now: () => 1_000_000, ownerSub: OWNER_A });
      const users = others(Math.ceil(GLOBAL_LIMITS[kind].max / LIMITS[kind].max) + 1);
      let made = 0;
      for (const u of users) {
        for (let i = 0; i < LIMITS[kind].max && made < GLOBAL_LIMITS[kind].max; i++, made++) {
          expect(l.check(u, kind)).toBe(true);
        }
      }
      expect(l.check(OWNER_B, kind)).toBe(false);
      expect(l.check(OWNER_A, kind)).toBe(true);
    }
  });

  it("owner calls are not counted toward the global ceiling", () => {
    const kind = "test";
    const l = createLimiter({ now: () => 1_000_000, ownerSub: OWNER_A });
    for (let i = 0; i < LIMITS[kind].max; i++) expect(l.check(OWNER_A, kind)).toBe(true);
    let made = 0;
    for (const u of others(Math.ceil(GLOBAL_LIMITS[kind].max / LIMITS[kind].max))) {
      for (let i = 0; i < LIMITS[kind].max && made < GLOBAL_LIMITS[kind].max; i++, made++) {
        expect(l.check(u, kind)).toBe(true);
      }
    }
    expect(made).toBe(GLOBAL_LIMITS[kind].max);
    expect(l.check(OWNER_B, kind)).toBe(false);
  });

  it("owner still gets false at its own per-user limit; the window frees it", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t, ownerSub: OWNER_A });
    for (const kind of KINDS) {
      for (let i = 0; i < LIMITS[kind].max; i++) expect(l.check(OWNER_A, kind)).toBe(true);
      expect(l.check(OWNER_A, kind)).toBe(false);
    }
    t += 24 * 60 * 60 * 1000 + 1;
    for (const kind of KINDS) expect(l.check(OWNER_A, kind)).toBe(true);
  });

  it("ownerSub unset: the first user is limited by the global ceiling like everyone", () => {
    const l = createLimiter({ now: () => 1_000_000 });
    let made = 0;
    for (const u of others(Math.ceil(GLOBAL_LIMITS.test.max / LIMITS.test.max))) {
      for (let i = 0; i < LIMITS.test.max && made < GLOBAL_LIMITS.test.max; i++, made++) {
        l.check(u, "test");
      }
    }
    expect(l.check(OWNER_A, "test")).toBe(false);
  });
});

describe("limiter with custom limits", () => {
  it("enforces its own kinds and windows, per user and globally", () => {
    let t = 1_000;
    const l = createLimiter({
      now: () => t,
      limits: { restore: { max: 2, windowMs: 1000 } },
      globalLimits: { restore: { max: 3, windowMs: 1000 } },
    });
    expect(l.check(OWNER_A, "restore")).toBe(true);
    expect(l.check(OWNER_A, "restore")).toBe(true);
    expect(l.check(OWNER_A, "restore")).toBe(false);
    expect(l.check(OWNER_B, "restore")).toBe(true);
    expect(l.check(OWNER_B, "restore")).toBe(false); // global ceiling (3)
    t += 1001;
    expect(l.check(OWNER_A, "restore")).toBe(true);
  });

  it("default construction still enforces the AI values", () => {
    const l = createLimiter({ now: () => 1 });
    for (let i = 0; i < LIMITS.save.max; i++) expect(l.check(OWNER_A, "save")).toBe(true);
    expect(l.check(OWNER_A, "save")).toBe(false);
    expect(GLOBAL_LIMITS.save.max).toBe(600);
  });
});
