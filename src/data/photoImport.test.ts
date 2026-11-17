import { describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { ApiError, PhotoSaveError } from "./apiErrors";
import {
  exceedsDailyLimit,
  itemNameFromFile,
  type PhotoImportDeps,
  type PhotoJob,
  runPhotoImport,
} from "./photoImport";
import { PhotoPrepError } from "./photoPrep";

const DEFAULTS = { location: " Tủ A ", status: "Đang dùng" as const };

const job = (n: number, over: Partial<PhotoJob> = {}): PhotoJob => ({
  key: `k${n}`,
  file: new File(["x"], `IMG_${n}.jpg`, { type: "image/jpeg" }),
  name: `IMG_${n}`,
  itemId: `id${n}`,
  state: "pending",
  ...over,
});

const stored = (it: Item, over: Partial<Item> = {}): Item => ({
  ...it,
  photo: "/api/photos/p",
  ...over,
});

function setup(save: (item: Item) => Promise<Item> = async (it) => stored(it)) {
  let n = 0;
  const urls: string[] = [];
  const revoked: string[] = [];
  const deps = {
    save: vi.fn(save),
    wait: vi.fn(async (_ms: number, _s?: AbortSignal) => {}),
    createUrl: vi.fn(() => {
      const u = `blob:${++n}`;
      urls.push(u);
      return u;
    }),
    revokeUrl: vi.fn((u: string) => void revoked.push(u)),
  } satisfies PhotoImportDeps;
  return { deps, urls, revoked };
}

const err = (status: number, code: string, retryAfterSec?: number) =>
  new ApiError(status, code, undefined, undefined, undefined, retryAfterSec);
const photoFail = (it: Item, cause: unknown) =>
  new PhotoSaveError(stored(it, { photo: "" }), cause);

describe("itemNameFromFile", () => {
  test('"IMG_2031.HEIC" → "IMG_2031"', () => {
    expect(itemNameFromFile("IMG_2031.HEIC")).toBe("IMG_2031");
  });
  test('keeps inner dots: "áo dài.tết.jpg" → "áo dài.tết"', () => {
    expect(itemNameFromFile("áo dài.tết.jpg")).toBe("áo dài.tết");
  });
  test("normalizes NFD (macOS) Vietnamese to NFC", () => {
    const nfd = "áo dài.jpg".normalize("NFD");
    expect(nfd).not.toBe("áo dài.jpg");
    expect(itemNameFromFile(nfd)).toBe("áo dài".normalize("NFC"));
  });
  test("no extension is kept; empty names use the fallback; long names are cut to NAME_MAX", () => {
    expect(itemNameFromFile("scan")).toBe("scan");
    expect(itemNameFromFile(".jpg", "F")).toBe("F");
    expect(itemNameFromFile("   .png", "F")).toBe("F");
    expect(itemNameFromFile(`${"a".repeat(200)}.jpg`)).toHaveLength(120);
  });
});

test("exceedsDailyLimit: 50 → false, 51 → true", () => {
  expect(exceedsDailyLimit(50)).toBe(false);
  expect(exceedsDailyLimit(51)).toBe(true);
});

describe("runPhotoImport", () => {
  test("creates each item with the batch defaults (location, status, name, pre-assigned id, blob: photo)", async () => {
    const { deps } = setup();
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS });
    const first = deps.save.mock.calls[0][0];
    expect(first).toMatchObject({
      id: "id1",
      name: "IMG_1",
      location: "Tủ A",
      status: "Đang dùng",
      photo: "blob:1",
    });
    expect(deps.save.mock.calls[1][0]).toMatchObject({ id: "id2", name: "IMG_2" });
    expect(out.jobs.map((j) => j.state)).toEqual(["done", "done"]);
    expect(out.stopped).toBeUndefined();
  });

  test("runs sequentially in order and reports the current file", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps } = setup(async (it) => {
      if (it.id === "id1") await gate;
      return stored(it);
    });
    const current: number[] = [];
    const p = runPhotoImport([job(1), job(2)], deps, {
      defaults: DEFAULTS,
      onCurrent: (i) => current.push(i),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(current).toEqual([0]);
    release();
    await p;
    expect(deps.save.mock.calls.map((c) => c[0].id)).toEqual(["id1", "id2"]);
    expect(current).toEqual([0, 1]);
  });

  test("creates and revokes one object URL per file (also on failure)", async () => {
    const { deps, urls, revoked } = setup(async (it) => {
      if (it.id === "id2") throw err(0, "network");
      return stored(it);
    });
    await runPhotoImport([job(1), job(2), job(3)], deps, { defaults: DEFAULTS });
    expect(urls).toHaveLength(3);
    expect(revoked).toEqual(urls);
  });

  test("a prep failure creates no item and the batch continues", async () => {
    const { deps } = setup(async (it) => {
      if (it.id === "id1") throw new PhotoPrepError("heicUnsupported");
      return stored(it);
    });
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS });
    expect(out.jobs.map((j) => j.state)).toEqual(["failed", "done"]);
    expect(out.jobs[0].item).toBeUndefined();
    expect((out.jobs[0].error as Error).message).toBeTruthy();
  });

  test("photo failure keeps the saved item; retry reuses its id", async () => {
    let fail = true;
    const { deps } = setup(async (it) => {
      if (fail) throw photoFail(it, err(500, "photo_upload_failed"));
      return stored(it);
    });
    const first = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS });
    expect(first.jobs[0].state).toBe("photoFailed");
    expect(first.jobs[0].item?.id).toBe("id1");
    fail = false;
    const second = await runPhotoImport(first.jobs, deps, {
      defaults: { location: "Khác", status: "Đang dùng" },
    });
    const retried = deps.save.mock.calls[1][0];
    expect(retried).toMatchObject({ id: "id1", name: "IMG_1", location: "Tủ A", photo: "blob:2" });
    expect(second.jobs[0].state).toBe("done");
  });

  test("item failure retry reuses the pre-assigned id", async () => {
    let fail = true;
    const { deps } = setup(async (it) => {
      if (fail) throw err(0, "network");
      return stored(it);
    });
    const first = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS });
    expect(first.jobs[0].state).toBe("failed");
    fail = false;
    await runPhotoImport(first.jobs, deps, { defaults: DEFAULTS });
    expect(deps.save.mock.calls.map((c) => c[0].id)).toEqual(["id1", "id1"]);
  });

  test("done files are skipped on retry", async () => {
    const { deps } = setup();
    await runPhotoImport([job(1, { state: "done" }), job(2)], deps, { defaults: DEFAULTS });
    expect(deps.save.mock.calls.map((c) => c[0].id)).toEqual(["id2"]);
  });

  test("429 stops the batch and keeps the rest pending", async () => {
    const { deps } = setup(async (it) => {
      if (it.id === "id2") throw photoFail(it, err(429, "rate_limited", 3600));
      return stored(it);
    });
    const out = await runPhotoImport([job(1), job(2), job(3)], deps, { defaults: DEFAULTS });
    expect(out.stopped).toEqual({ code: "rate_limited", retryAfterSec: 3600 });
    expect(out.jobs.map((j) => j.state)).toEqual(["done", "photoFailed", "pending"]);
    expect(deps.save).toHaveBeenCalledTimes(2);
  });

  test("429 on the item step leaves the file pending", async () => {
    const { deps } = setup(async () => {
      throw err(429, "rate_limited");
    });
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS });
    expect(out.jobs.map((j) => j.state)).toEqual(["pending", "pending"]);
    expect(out.stopped?.retryAfterSec).toBeUndefined();
  });

  test("photo_quota_exceeded stops the batch", async () => {
    const { deps } = setup(async (it) => {
      throw photoFail(it, err(409, "photo_quota_exceeded"));
    });
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS });
    expect(out.stopped?.code).toBe("photo_quota_exceeded");
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(out.jobs.map((j) => j.state)).toEqual(["photoFailed", "pending"]);
  });

  test("503 waits Retry-After and retries once", async () => {
    let calls = 0;
    const { deps } = setup(async (it) => {
      if (++calls === 1) throw photoFail(it, err(503, "photos_unavailable", 5));
      return stored(it);
    });
    const out = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS });
    expect(deps.wait).toHaveBeenCalledTimes(1);
    expect(deps.wait.mock.calls[0][0]).toBe(5000);
    expect(deps.save.mock.calls.map((c) => c[0].id)).toEqual(["id1", "id1"]);
    expect(out.jobs[0].state).toBe("done");
  });

  test("second 503 fails the file and continues", async () => {
    const { deps } = setup(async (it) => {
      if (it.id === "id1") throw err(503, "photos_unavailable", 1);
      return stored(it);
    });
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS });
    expect(deps.wait).toHaveBeenCalledTimes(1);
    expect(deps.save.mock.calls.map((c) => c[0].id)).toEqual(["id1", "id1", "id2"]);
    expect(out.jobs.map((j) => j.state)).toEqual(["failed", "done"]);
  });

  test("wait is capped at 30 s and defaults to 5 s without Retry-After", async () => {
    const a = setup(async () => {
      throw err(503, "photos_unavailable", 120);
    });
    await runPhotoImport([job(1)], a.deps, { defaults: DEFAULTS });
    expect(a.deps.wait.mock.calls[0][0]).toBe(30000);
    const b = setup(async () => {
      throw err(503, "photos_unavailable");
    });
    await runPhotoImport([job(1)], b.deps, { defaults: DEFAULTS });
    expect(b.deps.wait.mock.calls[0][0]).toBe(5000);
  });

  test("abort stops before the next file and during a 503 wait", async () => {
    const c1 = new AbortController();
    const a = setup(async (it) => {
      c1.abort();
      return stored(it);
    });
    const out = await runPhotoImport([job(1), job(2)], a.deps, {
      defaults: DEFAULTS,
      signal: c1.signal,
    });
    expect(a.deps.save).toHaveBeenCalledTimes(1);
    expect(out.jobs.map((j) => j.state)).toEqual(["done", "pending"]);

    const c2 = new AbortController();
    const b = setup(async () => {
      throw err(503, "photos_unavailable");
    });
    b.deps.wait.mockImplementation(async () => c2.abort());
    const out2 = await runPhotoImport([job(1)], b.deps, { defaults: DEFAULTS, signal: c2.signal });
    expect(b.deps.save).toHaveBeenCalledTimes(1);
    expect(out2.jobs[0].state).toBe("failed");
  });
});
