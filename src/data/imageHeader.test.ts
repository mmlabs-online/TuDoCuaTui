import { describe, expect, test } from "vitest";
import { imageDimensions } from "./imageHeader";

const bytes = (...parts: (number | string | ArrayLike<number>)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "number"
        ? [p]
        : typeof p === "string"
          ? [...p].map((c) => c.charCodeAt(0))
          : Array.from(p),
    ),
  );
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le32 = (n: number) => be32(n).reverse();
const pad = (n: number) => new Array(n).fill(0);

const png = (w: number, h: number) =>
  bytes(0x89, "PNG\r\n", 0x1a, 0x0a, be32(13), "IHDR", be32(w), be32(h), pad(5));
const sof = (marker: number, w: number, h: number) =>
  bytes(0xff, marker, be16(17), 8, be16(h), be16(w), 3, pad(9));

describe("imageDimensions", () => {
  test("reads width/height from a PNG IHDR", () => {
    expect(imageDimensions(png(10000, 6000))).toEqual({ width: 10000, height: 6000 });
  });

  test("reads a JPEG SOF0 and SOF2 after APP0/APP1 segments", () => {
    const app = (marker: number, len: number) => bytes(0xff, marker, be16(len + 2), pad(len));
    for (const m of [0xc0, 0xc2]) {
      const j = bytes(0xff, 0xd8, app(0xe0, 14), app(0xe1, 300), sof(m, 4000, 3000));
      expect(imageDimensions(j)).toEqual({ width: 4000, height: 3000 });
    }
  });

  test("skips 0xFF fill bytes and standalone markers; stops at SOS → null", () => {
    expect(
      imageDimensions(bytes(0xff, 0xd8, 0xff, 0xff, 0xff, 0x01, 0xff, 0xd0, sof(0xc0, 8, 6))),
    ).toEqual({ width: 8, height: 6 });
    expect(imageDimensions(bytes(0xff, 0xd8, 0xff, 0xda, be16(8), pad(20)))).toBeNull();
  });

  test("reads WebP VP8, VP8L and VP8X sizes", () => {
    const riff = (chunk: number[]) => bytes("RIFF", le32(chunk.length + 4), "WEBP", chunk);
    // Chunk data starts at 20: 3 frame-tag bytes, the start code, then width/height (LE, 14 bits) at 26/28.
    const vp8 = [...bytes("VP8 ", le32(10), pad(3), 0x9d, 0x01, 0x2a, 0x40, 0x06, 0xb8, 0x0b)];
    expect(imageDimensions(riff(vp8))).toEqual({ width: 1600, height: 3000 });
    const bits = (6000 - 1) | ((4000 - 1) << 14);
    const vp8l = [...bytes("VP8L", le32(5), 0x2f), ...le32(bits)];
    expect(imageDimensions(riff(vp8l))).toEqual({ width: 6000, height: 4000 });
    const u24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
    const vp8x = [...bytes("VP8X", le32(10), pad(4), u24(9999), u24(5999))];
    expect(imageDimensions(riff(vp8x))).toEqual({ width: 10000, height: 6000 });
  });

  test("returns null for unknown, empty, HEIC-like and truncated input without throwing", () => {
    expect(imageDimensions(new Uint8Array())).toBeNull();
    expect(imageDimensions(bytes("hello world, not an image"))).toBeNull();
    expect(imageDimensions(bytes(pad(4), "ftypheic", pad(20)))).toBeNull();
    expect(imageDimensions(png(1, 1).slice(0, 20))).toBeNull();
    expect(imageDimensions(bytes(0xff, 0xd8, 0xff, 0xe0, be16(5000), pad(10)))).toBeNull();
    expect(imageDimensions(sof(0xc0, 5, 5).slice(0, 8))).toBeNull();
    expect(imageDimensions(bytes(0xff, 0xd8, sof(0xc0, 5, 5).slice(0, 8)))).toBeNull();
    expect(imageDimensions(bytes("RIFF", le32(4), "WEBP"))).toBeNull();
    expect(imageDimensions(bytes("RIFF", le32(4), "WEBP", "VP8L", le32(5), 0x2f))).toBeNull();
  });
});
