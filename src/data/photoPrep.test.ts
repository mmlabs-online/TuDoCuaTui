import { describe, expect, test, vi } from "vitest";
import { EDITOR_COPY } from "@/features/items/copy";
import {
  ENCODE_STEPS,
  MAX_INPUT_BYTES,
  MAX_UPLOAD_BYTES,
  PhotoPrepError,
  photoKind,
  preparePhoto,
  type PhotoPrepCode,
} from "./photoPrep";

const file = (size: number, type: string, name = "a") =>
  Object.defineProperty(new File(["x"], name, { type }), "size", { value: size }) as File;
const blobOf = (size: number) =>
  Object.defineProperty(new Blob(["x"], { type: "image/jpeg" }), "size", { value: size });

const setup = (sizes: number[] = [1000]) => {
  const release = vi.fn();
  const img = { width: 4000, height: 3000, source: {} as CanvasImageSource, release };
  let n = 0;
  const load = vi.fn(async () => img);
  const render = vi.fn(async () => ({
    blob: blobOf(sizes[Math.min(n++, sizes.length - 1)]),
    width: 1200,
    height: 900,
  }));
  return { load, render, release, img, deps: { load, render } };
};
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: PhotoPrepError) => e.code,
  );

describe("photoKind", () => {
  test("photoKind maps MIME types", () => {
    for (const t of ["image/jpeg", "image/jpg", "image/pjpeg"])
      expect(photoKind({ type: t })).toBe("jpeg");
    expect(photoKind({ type: "image/png" })).toBe("png");
    expect(photoKind({ type: "image/webp" })).toBe("webp");
    for (const t of ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"])
      expect(photoKind({ type: t })).toBe("heic");
    for (const t of ["image/gif", "image/svg+xml", "application/pdf"])
      expect(photoKind({ type: t })).toBeNull();
  });

  test("photoKind falls back to the extension when the type is empty or application/octet-stream", () => {
    for (const type of ["", "application/octet-stream"]) {
      expect(photoKind({ type, name: "Ảnh áo dài.HEIC" })).toBe("heic");
      expect(photoKind({ type, name: "IMG_2031.heif" })).toBe("heic");
      expect(photoKind({ type, name: "a.JPG" })).toBe("jpeg");
      expect(photoKind({ type, name: "a.jpeg" })).toBe("jpeg");
      expect(photoKind({ type, name: "a.jfif" })).toBe("jpeg");
      expect(photoKind({ type, name: "a.png" })).toBe("png");
      expect(photoKind({ type, name: "a.webp" })).toBe("webp");
      expect(photoKind({ type, name: "a.gif" })).toBeNull();
      expect(photoKind({ type, name: "no-extension" })).toBeNull();
      expect(photoKind({ type, name: "" })).toBeNull();
    }
  });
});

describe("preparePhoto", () => {
  test("accepts the phone formats", async () => {
    for (const f of [
      file(10, "image/jpeg"),
      file(10, "image/jpg"),
      file(10, "image/heic"),
      file(10, "image/heif"),
      file(10, "", "IMG.HEIC"),
      file(10, "", "a.jpg"),
    ])
      await expect(preparePhoto(f, setup().deps)).resolves.toBeTruthy();
  });

  test("rejects a file over 10 MiB before decoding", async () => {
    const s = setup();
    expect(await codeOf(preparePhoto(file(MAX_INPUT_BYTES + 1, "image/jpeg"), s.deps))).toBe(
      "tooLarge",
    );
    expect(s.load).not.toHaveBeenCalled();
    await expect(preparePhoto(file(MAX_INPUT_BYTES, "image/jpeg"), s.deps)).resolves.toBeTruthy();
  });

  test("rejects an unsupported type without decoding", async () => {
    const s = setup();
    for (const t of ["image/gif", "image/svg+xml"])
      expect(await codeOf(preparePhoto(file(10, t), s.deps))).toBe("unsupportedType");
    expect(s.load).not.toHaveBeenCalled();
  });

  test("returns a JPEG of at most MAX_UPLOAD_BYTES on the first step", async () => {
    const s = setup([500]);
    const out = await preparePhoto(file(10, "image/jpeg"), s.deps);
    expect(s.render).toHaveBeenCalledTimes(1);
    expect(s.render).toHaveBeenCalledWith(s.img, 1200, 0.82);
    expect(out.blob.type).toBe("image/jpeg");
    expect(out.blob.size).toBe(500);
    expect([out.width, out.height]).toEqual([1200, 900]);
  });

  test("walks ENCODE_STEPS until the blob fits", async () => {
    const s = setup([MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES]);
    const out = await preparePhoto(file(10, "image/png"), s.deps);
    expect(s.render).toHaveBeenCalledTimes(3);
    expect(out.blob.size).toBe(MAX_UPLOAD_BYTES);
    expect(s.render).toHaveBeenLastCalledWith(s.img, ENCODE_STEPS[2].max, ENCODE_STEPS[2].quality);
  });

  test("throws tooLargeAfterResize when no step fits", async () => {
    const s = setup([MAX_UPLOAD_BYTES + 1]);
    expect(await codeOf(preparePhoto(file(10, "image/png"), s.deps))).toBe("tooLargeAfterResize");
    expect(s.render).toHaveBeenCalledTimes(ENCODE_STEPS.length);
  });

  test("HEIC that the browser cannot decode → heicUnsupported", async () => {
    const s = setup();
    s.load.mockRejectedValueOnce(new Error("x"));
    expect(await codeOf(preparePhoto(file(10, "image/heic"), s.deps))).toBe("heicUnsupported");
  });

  test("HEIC that the browser decodes → JPEG", async () => {
    const out = await preparePhoto(file(10, "image/heic"), setup().deps);
    expect(out.blob.type).toBe("image/jpeg");
  });

  test("a non-HEIC decode failure → unreadable", async () => {
    const s = setup();
    s.load.mockRejectedValueOnce(new Error("x"));
    expect(await codeOf(preparePhoto(file(10, "image/png"), s.deps))).toBe("unreadable");
  });

  test("a render failure → unreadable", async () => {
    const s = setup();
    s.render.mockRejectedValueOnce(new Error("x"));
    expect(await codeOf(preparePhoto(file(10, "image/png"), s.deps))).toBe("unreadable");
  });

  test("releases the decoded image on success and on failure", async () => {
    const ok = setup();
    await preparePhoto(file(10, "image/jpeg"), ok.deps);
    expect(ok.release).toHaveBeenCalledTimes(1);
    const bad = setup();
    bad.render.mockRejectedValueOnce(new Error("x"));
    await codeOf(preparePhoto(file(10, "image/jpeg"), bad.deps));
    expect(bad.release).toHaveBeenCalledTimes(1);
  });
});

describe("PhotoPrepError", () => {
  test("PhotoPrepError message is the Vietnamese copy for its code", () => {
    for (const code of Object.keys(EDITOR_COPY.photo.errors) as PhotoPrepCode[]) {
      const e = new PhotoPrepError(code);
      expect(e.message).toBe(EDITOR_COPY.photo.errors[code]);
      expect(e.code).toBe(code);
    }
  });

  // Keep in step with MAX_BYTES in server/photos.js.
  test("MAX_UPLOAD_BYTES equals the server limit (2 MiB)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});
