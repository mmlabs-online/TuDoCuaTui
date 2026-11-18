import { describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { blankItem } from "@/features/items/blankItem";
import { suggestionToFields } from "@/features/items/aiFill";
import { AiSettingsError } from "./aiSettings";
import type { TagSuggestion } from "./aiTagging";
import { ApiError, PhotoSaveError } from "./apiErrors";
import type { SaveOptions } from "./repo";
import {
  applyAiToBatchItem,
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

const SUGGESTION: TagSuggestion = {
  name: "Áo sơ mi kem",
  category: "top",
  colors: ["kem"],
  seasons: ["summer"],
  material: "Cotton",
  brand: "Uniqlo",
  tags: ["công sở"],
};
const NOTHING: TagSuggestion = {
  name: null,
  category: null,
  colors: [],
  seasons: [],
  material: null,
  brand: null,
  tags: [],
};
const JPEG = new Blob(["jpeg"], { type: "image/jpeg" });
const aiErr = (code: string) =>
  new AiSettingsError(code === "rate_limited" ? 429 : 502, code as never);

/** A fake `repo.save`: like the real one it hands the prepared JPEG to `withPrepared` and saves the result. */
function aiSetup(extra: (it: Item) => void = () => {}) {
  const saved: Item[] = [];
  const s = setup();
  const save = vi.fn(async (it: Item, o?: SaveOptions) => {
    extra(it);
    const next = o?.withPrepared ? await o.withPrepared(JPEG, it) : it;
    saved.push(next);
    return stored(next);
  });
  return { ...s, deps: { ...s.deps, save }, saved };
}

describe("applyAiToBatchItem", () => {
  const batch = (): Item => ({
    ...blankItem(),
    id: "id1",
    name: "IMG_1",
    location: "Tủ A",
    status: "Cất kho",
    notes: "ghi chú",
    price: 5,
    size: "M",
    purchaseDate: "2026-01-02",
  });
  const fields = suggestionToFields(SUGGESTION);

  test("fills name/category/colors/seasons/material/brand/tags on a batch item", () => {
    const { item, filled } = applyAiToBatchItem(batch(), fields);
    expect(item).toMatchObject({
      name: "Áo sơ mi kem",
      category: "Áo",
      colors: ["Kem"],
      seasons: ["Hạ"],
      material: "Cotton",
      brand: "Uniqlo",
      tags: ["công sở"],
    });
    expect(filled).toBe(7);
  });
  test("AI name replaces the file-name name; no AI name keeps the file name", () => {
    expect(applyAiToBatchItem(batch(), { name: "Váy" }).item.name).toBe("Váy");
    expect(applyAiToBatchItem(batch(), { brand: "X" }).item.name).toBe("IMG_1");
  });
  test("never touches location, status, price, size, notes, purchaseDate", () => {
    const before = batch();
    const { item } = applyAiToBatchItem(before, fields);
    expect(item).toMatchObject({
      location: "Tủ A",
      status: "Cất kho",
      price: 5,
      size: "M",
      notes: "ghi chú",
      purchaseDate: "2026-01-02",
    });
    expect(before.name).toBe("IMG_1");
  });
  test("unknown ids are dropped; Vietnamese values are NFC-trimmed (via suggestionToFields)", () => {
    const f = suggestionToFields({
      ...NOTHING,
      category: "nope",
      colors: ["nope"],
      brand: "  Áo".normalize("NFD") + "  ",
    });
    expect(f).toEqual({ brand: "Áo".normalize("NFC") });
    expect(applyAiToBatchItem(batch(), f).item.category).toBe("Áo");
  });
  test("returns the count of filled keys (0 when there is nothing)", () => {
    expect(applyAiToBatchItem(batch(), {}).filled).toBe(0);
    expect(applyAiToBatchItem(batch(), { material: "Len" }).filled).toBe(1);
  });
});

describe("runPhotoImport AI", () => {
  test("no tag option: tag is never called and save gets no hook", async () => {
    const tag = vi.fn(async () => SUGGESTION);
    const { deps } = aiSetup();
    await runPhotoImport([job(1)], deps, { defaults: DEFAULTS });
    expect(tag).not.toHaveBeenCalled();
    expect(deps.save.mock.calls[0]).toHaveLength(1);
  });

  test("fills empty fields from the suggestion and keeps batch location/status", async () => {
    const { deps, saved } = aiSetup();
    const tag = vi.fn(async () => SUGGESTION);
    const out = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS, tag });
    expect(saved[0]).toMatchObject({
      id: "id1",
      name: "Áo sơ mi kem",
      category: "Áo",
      colors: ["Kem"],
      location: "Tủ A",
      status: "Đang dùng",
    });
    expect(out.jobs[0]).toMatchObject({ state: "done", ai: "filled" });
    expect(out.aiStopped).toBeUndefined();
  });

  test("tag receives the prepared JPEG passed by save", async () => {
    const { deps } = aiSetup();
    const tag = vi.fn(async (_b: Blob) => SUGGESTION);
    await runPhotoImport([job(1)], deps, { defaults: DEFAULTS, tag });
    expect(tag.mock.calls[0][0]).toBe(JPEG);
  });

  test("an empty suggestion marks the file as nothing to fill", async () => {
    const { deps } = aiSetup();
    const out = await runPhotoImport([job(1)], deps, {
      defaults: DEFAULTS,
      tag: async () => NOTHING,
    });
    expect(out.jobs[0]).toMatchObject({ state: "done", ai: "nothing" });
  });

  test("tag error (provider_unavailable): item saved without AI, skipped, next photo still tagged", async () => {
    const { deps, saved } = aiSetup();
    const tag = vi
      .fn<(b: Blob) => Promise<TagSuggestion>>()
      .mockRejectedValueOnce(aiErr("provider_unavailable"))
      .mockResolvedValue(SUGGESTION);
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS, tag });
    expect(saved[0].name).toBe("IMG_1");
    expect(out.jobs[0]).toMatchObject({
      state: "done",
      ai: "skipped",
      aiError: "provider_unavailable",
    });
    expect(out.jobs[1]).toMatchObject({ state: "done", ai: "filled" });
    expect(tag).toHaveBeenCalledTimes(2);
    expect(out.aiStopped).toBeUndefined();
  });

  test("a non-AI error from the tagger counts as internal and skips only that photo", async () => {
    const { deps } = aiSetup();
    const tag = vi
      .fn<(b: Blob) => Promise<TagSuggestion>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(SUGGESTION);
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS, tag });
    expect(out.jobs[0]).toMatchObject({ ai: "skipped", aiError: "internal" });
    expect(out.jobs[1].ai).toBe("filled");
  });

  test('AI rate_limited: later photos get ai = "off" without a tag call, every item saved, aiStopped set', async () => {
    const { deps, saved } = aiSetup();
    const tag = vi
      .fn<(b: Blob) => Promise<TagSuggestion>>()
      .mockResolvedValueOnce(SUGGESTION)
      .mockRejectedValueOnce(aiErr("rate_limited"));
    const out = await runPhotoImport([job(1), job(2), job(3)], deps, { defaults: DEFAULTS, tag });
    expect(tag).toHaveBeenCalledTimes(2);
    expect(saved).toHaveLength(3);
    expect(out.jobs.map((j) => j.state)).toEqual(["done", "done", "done"]);
    expect(out.jobs.map((j) => j.ai)).toEqual(["filled", "skipped", "off"]);
    expect(out.aiStopped).toBe("rate_limited");
    expect(out.stopped).toBeUndefined();
  });

  test("invalid_key turns AI off for the batch (aiStopped = invalid_key)", async () => {
    const { deps } = aiSetup();
    const tag = vi.fn(async () => {
      throw aiErr("invalid_key");
    });
    const out = await runPhotoImport([job(1), job(2)], deps, { defaults: DEFAULTS, tag });
    expect(tag).toHaveBeenCalledTimes(1);
    expect(out.aiStopped).toBe("invalid_key");
    expect(out.jobs.map((j) => j.state)).toEqual(["done", "done"]);
  });

  test("photo ApiError rate_limited still stops the batch and is not mistaken for the AI one", async () => {
    const { deps } = aiSetup((it) => {
      if (it.id === "id2") throw err(429, "rate_limited", 60);
    });
    const tag = vi.fn(async () => SUGGESTION);
    const out = await runPhotoImport([job(1), job(2), job(3)], deps, { defaults: DEFAULTS, tag });
    expect(out.stopped).toEqual({ code: "rate_limited", retryAfterSec: 60 });
    expect(out.aiStopped).toBeUndefined();
    expect(out.jobs[2].state).toBe("pending");
  });

  test("503 save retry reuses the suggestion (tag called once)", async () => {
    let fails = 1;
    const { deps, saved } = aiSetup();
    const inner = deps.save.getMockImplementation()!;
    deps.save.mockImplementation(async (it, o) => {
      const out = await inner(it, o);
      if (fails-- > 0) throw err(503, "db_unavailable", 1);
      return out;
    });
    const tag = vi.fn(async () => SUGGESTION);
    const out = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS, tag });
    expect(tag).toHaveBeenCalledTimes(1);
    expect(out.jobs[0].state).toBe("done");
    expect(saved.at(-1)?.name).toBe("Áo sơ mi kem");
  });

  test("item PUT fails after tagging: second run reuses aiFields, same itemId, tag called once", async () => {
    let fails = 1;
    const { deps, saved } = aiSetup();
    const inner = deps.save.getMockImplementation()!;
    deps.save.mockImplementation(async (it, o) => {
      const out = await inner(it, o);
      if (fails-- > 0) throw err(500, "internal");
      return out;
    });
    const tag = vi.fn(async () => SUGGESTION);
    const first = await runPhotoImport([job(1)], deps, { defaults: DEFAULTS, tag });
    expect(first.jobs[0]).toMatchObject({ state: "failed", ai: "filled" });
    const second = await runPhotoImport(first.jobs, deps, { defaults: DEFAULTS, tag });
    expect(tag).toHaveBeenCalledTimes(1);
    expect(second.jobs[0].state).toBe("done");
    expect(saved.map((s) => s.id)).toEqual(["id1", "id1"]);
    expect(saved[1].name).toBe("Áo sơ mi kem");
  });

  test("photoFailed retry is not re-tagged and keeps the saved fields", async () => {
    const { deps, saved } = aiSetup();
    const savedItem = stored(
      { ...blankItem(), id: "id1", name: "Áo sơ mi kem", brand: "Uniqlo" },
      { photo: "" },
    );
    const tag = vi.fn(async () => SUGGESTION);
    await runPhotoImport(
      [
        job(1, {
          state: "photoFailed",
          item: savedItem,
          ai: "filled",
          aiFields: suggestionToFields(SUGGESTION),
        }),
      ],
      deps,
      { defaults: DEFAULTS, tag },
    );
    expect(tag).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({ name: "Áo sơ mi kem", brand: "Uniqlo" });
  });

  test('"off" jobs are tagged on the next run', async () => {
    const { deps } = aiSetup();
    const tag = vi.fn(async () => SUGGESTION);
    const out = await runPhotoImport([job(1, { ai: "off" })], deps, { defaults: DEFAULTS, tag });
    expect(tag).toHaveBeenCalledTimes(1);
    expect(out.jobs[0].ai).toBe("filled");
  });

  test("abort during tag: item is saved without AI, no skipped state shown", async () => {
    const { deps, saved } = aiSetup();
    const ctl = new AbortController();
    const tag = vi.fn(async () => {
      ctl.abort();
      throw aiErr("provider_unavailable");
    });
    const out = await runPhotoImport([job(1)], deps, {
      defaults: DEFAULTS,
      tag,
      signal: ctl.signal,
    });
    expect(saved[0].name).toBe("IMG_1");
    expect(out.jobs[0].ai).toBeUndefined();
  });

  test("onTagging(i, true/false) brackets the tag call", async () => {
    const { deps } = aiSetup();
    const log: string[] = [];
    await runPhotoImport([job(1)], deps, {
      defaults: DEFAULTS,
      tag: async () => {
        log.push("tag");
        return SUGGESTION;
      },
      onTagging: (i, on) => log.push(`${i}:${on}`),
    });
    expect(log).toEqual(["0:true", "tag", "0:false"]);
  });
});
