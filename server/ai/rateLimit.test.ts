// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLimiter } from "./rateLimit.js";

describe("limiter", () => {
  it("30 saves pass, the 31st fails, an hour later it passes again", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 30; i++) expect(l.check("save")).toBe(true);
    expect(l.check("save")).toBe(false);
    expect(l.check("save")).toBe(false); // a failed check records nothing
    t += 60 * 60 * 1000 + 1;
    expect(l.check("save")).toBe(true);
  });

  it("counts kinds separately", () => {
    const l = createLimiter({ now: () => 5 });
    for (let i = 0; i < 20; i++) expect(l.check("test")).toBe(true);
    expect(l.check("test")).toBe(false);
    expect(l.check("save")).toBe(true);
  });

  it("tag kind: 100 per 24 h, independent, window rolls", () => {
    let t = 1_000_000;
    const l = createLimiter({ now: () => t });
    for (let i = 0; i < 100; i++) expect(l.check("tag")).toBe(true);
    expect(l.check("tag")).toBe(false);
    expect(l.check("test")).toBe(true);
    expect(l.check("save")).toBe(true);
    t += 23 * 60 * 60 * 1000;
    expect(l.check("tag")).toBe(false);
    t += 60 * 60 * 1000 + 1;
    expect(l.check("tag")).toBe(true);
  });

  it("defaults to the real clock", () => {
    expect(createLimiter().check("save")).toBe(true);
  });
});
