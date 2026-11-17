// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readCapped } from "./readCapped.js";

const streamOf = (chunks: string[]) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
      c.close();
    },
  });

describe("readCapped", () => {
  it("parses JSON under the cap", async () => {
    const body = JSON.stringify({ a: "x".repeat(20) });
    expect(await readCapped(new Response(body), body.length)).toEqual({ a: "x".repeat(20) });
    const res = new Response(streamOf(['{"a":', '"b",', '"c":1}']));
    expect(await readCapped(res, 1024)).toEqual({ a: "b", c: 1 });
  });

  it("over the cap -> null and the reader is cancelled", async () => {
    const body = JSON.stringify({ a: "x".repeat(20) });
    expect(await readCapped(new Response(body), body.length - 1)).toBeNull();
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(1024));
      },
      cancel,
    });
    expect(await readCapped(new Response(stream), 4 * 1024)).toBeNull();
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(10);
  });

  it("not JSON / empty / no body -> null", async () => {
    expect(await readCapped(new Response("nope"), 1024)).toBeNull();
    expect(await readCapped(new Response(""), 1024)).toBeNull();
    expect(await readCapped(new Response(null), 1024)).toBeNull();
  });
});
