import { describe, expect, test, vi } from "vitest";
import { THUMB_MAX, THUMB_QUALITY, makeThumb, thumbWith } from "./photoThumb";
import type { PhotoDeps } from "./photoPrep";

function fakeDeps(width: number, height: number, over: Partial<PhotoDeps> = {}) {
  const release = vi.fn();
  const out = new Blob(["thumb"], { type: "image/jpeg" });
  const render = vi.fn(async (_i: unknown, _m: number, _q: number) => ({
    blob: out,
    width: 1,
    height: 1,
  }));
  const deps = {
    load: vi.fn(async () => ({ width, height, release })),
    render,
    ...over,
  } as unknown as PhotoDeps;
  return { deps, release, render, out };
}

const input = new Blob(["original"], { type: "image/jpeg" });

describe("thumbWith", () => {
  test("an image larger than THUMB_MAX is rendered at THUMB_MAX, quality 0.8, and released", async () => {
    const { deps, release, render, out } = fakeDeps(1200, 900);
    await expect(thumbWith(input, deps)).resolves.toBe(out);
    expect(THUMB_MAX).toBe(480);
    expect(THUMB_QUALITY).toBe(0.8);
    expect(render).toHaveBeenCalledWith(expect.anything(), 480, 0.8);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("an image already <= THUMB_MAX returns the original blob without render", async () => {
    const { deps, release, render } = fakeDeps(480, 300);
    await expect(thumbWith(input, deps)).resolves.toBe(input);
    expect(render).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("render failure still releases the image and rejects", async () => {
    const { deps, release } = fakeDeps(1200, 900, {
      render: async () => {
        throw new Error("boom");
      },
    });
    await expect(thumbWith(input, deps)).rejects.toThrow("boom");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("makeThumb", () => {
  test("off-thread first", async () => {
    const off = fakeDeps(1200, 900);
    const main = fakeDeps(1200, 900);
    await makeThumb(input, { offThread: () => off.deps, main: main.deps });
    expect(off.render).toHaveBeenCalledTimes(1);
    expect(main.render).not.toHaveBeenCalled();
  });

  test("off-thread failure -> main", async () => {
    const off = fakeDeps(1200, 900, {
      load: async () => {
        throw new Error("worker");
      },
    });
    const main = fakeDeps(1200, 900);
    await makeThumb(input, { offThread: () => off.deps, main: main.deps });
    expect(main.render).toHaveBeenCalledTimes(1);
  });

  test("no worker -> main", async () => {
    const main = fakeDeps(1200, 900);
    await makeThumb(input, { offThread: () => null, main: main.deps });
    expect(main.render).toHaveBeenCalledTimes(1);
  });
});
