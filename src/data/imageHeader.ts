export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, s: string) =>
  [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || !ascii(b, 1, "PNG") || !ascii(b, 12, "IHDR")) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function jpeg(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m === 0xda || m === 0xd9) return null;
    if (isSof(m)) {
      if (i + 9 > b.length) return null;
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 25 || !ascii(b, 8, "WEBP")) return null;
  if (ascii(b, 12, "VP8 ")) {
    if (b.length < 30) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, "VP8X")) {
    return b.length < 30 ? null : { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** Pixel size from the file header (JPEG, PNG, WebP) without decoding; `null` when unknown or truncated. */
export function imageDimensions(bytes: Uint8Array): ImageSize | null {
  try {
    if (bytes[0] === 0x89) return png(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
    if (bytes[0] === 0x52 && ascii(bytes, 0, "RIFF")) return webp(bytes);
    return null;
  } catch {
    return null;
  }
}
