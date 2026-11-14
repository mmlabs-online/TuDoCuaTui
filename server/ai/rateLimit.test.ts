// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { createLimiter, GLOBAL_LIMITS } from "./rateLimit.js";

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

  it.each(["test", "save", "tag"] as const)("global ceiling for %s", (kind) => {
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
