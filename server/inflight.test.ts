import { describe, expect, it } from "vitest";
import { createInFlight } from "./inflight.js";

describe("createInFlight", () => {
  it("caps per user (2) and in total (3)", () => {
    const f = createInFlight({ perUser: 2, total: 3 });
    expect(f.tryAcquire("a")).not.toBeNull();
    expect(f.tryAcquire("a")).not.toBeNull();
    expect(f.tryAcquire("a")).toBeNull();
    expect(f.tryAcquire("b")).not.toBeNull();
    expect(f.total()).toBe(3);
    expect(f.tryAcquire("b")).toBeNull();
  });

  it("release frees a slot; a double release counts once", () => {
    const f = createInFlight({ perUser: 2, total: 3 });
    const r1 = f.tryAcquire("a")!;
    f.tryAcquire("a");
    r1();
    r1();
    expect(f.count("a")).toBe(1);
    expect(f.total()).toBe(1);
    expect(f.tryAcquire("a")).not.toBeNull();
  });

  it("count 0 removes the user entry", () => {
    const f = createInFlight({ perUser: 2, total: 3 });
    f.tryAcquire("a")!();
    expect(f.count("a")).toBe(0);
    expect(f.total()).toBe(0);
  });
});
