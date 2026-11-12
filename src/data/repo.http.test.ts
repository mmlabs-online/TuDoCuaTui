import { afterEach, describe, expect, test, vi } from "vitest";
import { EDITOR_COPY } from "@/features/items/copy";
import type { Item } from "@/types/item";
import { API_ERROR_COPY, ApiError, PhotoSaveError } from "./apiErrors";
import { createHttpRepo } from "./repo.http";

afterEach(() => {
  resize.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ID = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const resize = vi.fn(async (_b: Blob) => ({
  blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
}));
const setup = (res: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => res());
  return { fetchFn, repo: createHttpRepo(fetchFn as unknown as typeof fetch, "/api", resize) };
};
const call = (fetchFn: ReturnType<typeof vi.fn>, n = 0) => {
  const [url, init] = fetchFn.mock.calls[n] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

const row = {
  id: ID,
  name: "Áo",
  category: "top",
  status: "active",
  colors: ["kem"],
  seasons: ["summer"],
  brand: null,
  size: null,
  location_name: "Tủ A",
  price: 100000,
  purchase_date: "2026-01-02",
  material: null,
  tags: ["x"],
  notes: null,
  primary_photo_path: null,
  wear_count: 2,
  last_worn: null,
  created_at: "2026-01-01T00:00:00Z",
};

const item = (over: Partial<Item> = {}): Item => ({
  id: ID,
  name: " Áo ",
  category: "Áo",
  status: "Đang dùng",
  colors: ["Kem"],
  seasons: ["Hạ"],
  brand: "",
  size: "",
  location: " Tủ A ",
  price: 0,
  purchaseDate: "",
  material: "",
  tags: [],
  notes: "",
  photo: "",
  wearCount: 0,
  lastWorn: "",
  createdAt: "",
  ...over,
});

describe("createHttpRepo", () => {
  test("mode is api", () => {
    expect(setup(() => json({})).repo.mode).toBe("api");
  });

  test("list GETs /api/items and maps rows (photo empty, null last_worn → empty)", async () => {
    const { repo, fetchFn } = setup(() => json({ items: [row] }));
    const [it] = await repo.list();
    const c = call(fetchFn);
    expect(c.url).toBe("/api/items");
    expect(c.init.method).toBe("GET");
    expect(it).toMatchObject({
      id: ID,
      category: "Áo",
      status: "Đang dùng",
      colors: ["Kem"],
      seasons: ["Hạ"],
      location: "Tủ A",
      photo: "",
      lastWorn: "",
      wearCount: 2,
    });
  });

  test("locations GETs /api/locations", async () => {
    const { repo, fetchFn } = setup(() => json({ locations: ["a", "b"] }));
    expect(await repo.locations()).toEqual(["a", "b"]);
    expect(call(fetchFn).url).toBe("/api/locations");
  });

  test("GETs send Accept, no-store and manual redirect", async () => {
    const { repo, fetchFn } = setup(() => json({ items: [] }));
    await repo.list();
    const c = call(fetchFn);
    expect(c.headers).toEqual({ Accept: "application/json" });
    expect(c.init.cache).toBe("no-store");
    expect(c.init.redirect).toBe("manual");
    expect(c.init.body).toBeUndefined();
  });

  test("save PUTs the full body to /api/items/<id>", async () => {
    const { repo, fetchFn } = setup(() =>
      json({ item: { ...row, name: "Server", location_name: "Srv" } }),
    );
    const saved = await repo.save(item());
    const c = call(fetchFn);
    expect(c.url).toBe(`/api/items/${ID}`);
    expect(c.init.method).toBe("PUT");
    expect(c.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(c.init.body as string);
    expect(Object.keys(body).sort()).toEqual(
      [
        "brand",
        "category",
        "colors",
        "location_name",
        "material",
        "name",
        "notes",
        "price",
        "purchase_date",
        "seasons",
        "size",
        "status",
        "tags",
      ].sort(),
    );
    expect(body).toMatchObject({
      name: "Áo",
      category: "top",
      status: "active",
      colors: ["kem"],
      seasons: ["summer"],
      brand: null,
      price: null,
      location_name: "Tủ A",
    });
    expect(saved.name).toBe("Server");
    expect(saved.location).toBe("Srv");
  });

  test("save with a non-UUID id generates one; empty location is null", async () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue(ID);
    const { repo, fetchFn } = setup(() => json({ item: row }));
    await repo.save(item({ id: "", location: "  " }));
    expect(spy).toHaveBeenCalled();
    expect(call(fetchFn).url).toBe(`/api/items/${ID}`);
    expect(JSON.parse(call(fetchFn).init.body as string).location_name).toBeNull();
  });

  const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
  const DATA_URL = "data:image/jpeg;base64,AAAA";

  test("list maps primary_photo_id to photoPath and leaves photo empty", async () => {
    const { repo } = setup(() => json({ items: [{ ...row, primary_photo_id: PHOTO_ID }] }));
    const [it] = await repo.list();
    expect(it.photoPath).toBe(PHOTO_ID);
    expect(it.photo).toBe("");
  });

  test("save with a data: photo PUTs the item, then the resized JPEG to /items/<id>/photo", async () => {
    let n = 0;
    const { repo, fetchFn } = setup(() =>
      json({ item: ++n === 1 ? row : { ...row, primary_photo_id: PHOTO_ID } }),
    );
    const saved = await repo.save(item({ photo: DATA_URL }));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(call(fetchFn).init.body).not.toContain("data:image");
    const c = call(fetchFn, 1);
    expect(c.url).toBe(`/api/items/${ID}/photo`);
    expect(c.init.method).toBe("PUT");
    expect(c.headers["Content-Type"]).toBe("image/jpeg");
    expect(c.init.body).toBe((await resize.mock.results[0].value).blob);
    expect(saved.photoPath).toBe(PHOTO_ID);
    expect(saved.photo).toBe("");
  });

  test("save after explicitly removing a stored photo DELETEs that photo id", async () => {
    let n = 0;
    const { repo, fetchFn } = setup(() =>
      ++n === 1
        ? json({ item: { ...row, primary_photo_id: PHOTO_ID } })
        : new Response(null, { status: 204 }),
    );
    const saved = await repo.save(
      item({ photo: "", photoPath: undefined, removedPhotoId: PHOTO_ID }),
    );
    expect(call(fetchFn, 1).url).toBe(`/api/items/${ID}/photo?photo=${PHOTO_ID}`);
    expect(call(fetchFn, 1).init.method).toBe("DELETE");
    expect(saved.photoPath).toBeUndefined();
  });

  test("stale view: a row with a photo but no explicit removal sends no DELETE", async () => {
    const { repo, fetchFn } = setup(() => json({ item: { ...row, primary_photo_id: PHOTO_ID } }));
    const saved = await repo.save(item({ photo: "", photoPath: undefined }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(saved.photoPath).toBe(PHOTO_ID);
  });

  test("removing a stale photo id keeps the newer primary photo in the result", async () => {
    const NEWER = "33333333-3333-4333-8333-333333333333";
    let n = 0;
    const { repo } = setup(() =>
      ++n === 1
        ? json({ item: { ...row, primary_photo_id: NEWER } })
        : new Response(null, { status: 204 }),
    );
    const saved = await repo.save(item({ photo: "", removedPhotoId: PHOTO_ID }));
    expect(saved.photoPath).toBe(NEWER);
  });

  test("save with an unchanged stored photo or an http(s) photo makes no photo request", async () => {
    const { repo, fetchFn } = setup(() => json({ item: { ...row, primary_photo_id: PHOTO_ID } }));
    await repo.save(item({ photo: "", photoPath: PHOTO_ID }));
    await repo.save(item({ photo: "https://example.test/a.jpg", photoPath: PHOTO_ID }));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(resize).not.toHaveBeenCalled();
  });

  test("a failing photo step throws PhotoSaveError with the saved item and Vietnamese copy", async () => {
    let n = 0;
    const { repo } = setup(() =>
      ++n === 1 ? json({ item: row }) : json({ error: { code: "photo_upload_failed" } }, 502),
    );
    const err = await repo.save(item({ photo: DATA_URL })).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoSaveError);
    expect(err.item.id).toBe(ID);
    expect(err.message).toContain(API_ERROR_COPY.photoNotSaved);
    expect(err.message).toContain(API_ERROR_COPY.photo_upload_failed);
  });

  test("remove DELETEs and resolves on 204", async () => {
    const { repo, fetchFn } = setup(() => new Response(null, { status: 204 }));
    await expect(repo.remove(item())).resolves.toBeUndefined();
    expect(call(fetchFn).url).toBe(`/api/items/${ID}`);
    expect(call(fetchFn).init.method).toBe("DELETE");
  });

  test("wear POSTs delta and today, maps the result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T10:00:00+07:00"));
    const { repo, fetchFn } = setup(() => json({ wear_count: 3, last_worn: null, already: false }));
    const out = await repo.wear(item(), -1);
    const c = call(fetchFn);
    expect(c.url).toBe(`/api/items/${ID}/wear`);
    expect(c.init.method).toBe("POST");
    const today = JSON.parse(c.init.body as string);
    expect(today.delta).toBe(-1);
    expect(today.today).toMatch(/^2026-03-(09|10)$/);
    expect(out).toEqual({ wearCount: 3, lastWorn: "", already: false });
  });

  test("wear maps already and last_worn", async () => {
    const { repo } = setup(() => json({ wear_count: 1, last_worn: "2026-03-10", already: true }));
    expect(await repo.wear(item(), 1)).toEqual({
      wearCount: 1,
      lastWorn: "2026-03-10",
      already: true,
    });
  });
});

describe("createHttpRepo errors", () => {
  const fail = async (res: () => Response | Promise<Response>) => {
    const { repo } = setup(res);
    return repo.list().then(
      () => {
        throw new Error("expected failure");
      },
      (e: ApiError) => e,
    );
  };

  test("400 invalid_input keeps field/reason and uses editor copy", async () => {
    const e = await fail(() =>
      json({ error: { code: "invalid_input", field: "name", reason: "nameRequired" } }, 400),
    );
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe(EDITOR_COPY.errors.nameRequired);
    expect(e.field).toBe("name");
    expect(e.reason).toBe("nameRequired");
  });

  test("401 and opaque redirect → session expired", async () => {
    expect((await fail(() => json({ error: { code: "unauthorized" } }, 401))).message).toBe(
      API_ERROR_COPY.unauthorized,
    );
    const opaque = {
      type: "opaqueredirect",
      status: 0,
      ok: false,
      headers: new Headers(),
    } as Response;
    expect((await fail(() => opaque)).message).toBe(API_ERROR_COPY.unauthorized);
  });

  test("404/409/413/503/500 map to their copy; 500 shows the request id", async () => {
    const cases: [number, string][] = [
      [404, "not_found"],
      [409, "conflict"],
      [413, "payload_too_large"],
      [503, "db_unavailable"],
    ];
    for (const [status, code] of cases) {
      const e = await fail(() => json({ error: { code } }, status));
      expect(e.message).toBe(API_ERROR_COPY[code as "not_found"]);
    }
    const e = await fail(() => json({ error: { code: "internal", requestId: "rid-9" } }, 500));
    expect(e.message).toContain("rid-9");
  });

  test("non-JSON error body and non-JSON 200 → unexpected", async () => {
    expect((await fail(() => new Response("<html>", { status: 502 }))).message).toBe(
      API_ERROR_COPY.unexpected,
    );
    expect((await fail(() => new Response("<html>", { status: 200 }))).message).toBe(
      API_ERROR_COPY.unexpected,
    );
    expect((await fail(() => json({}, 500))).message).toBe(API_ERROR_COPY.unexpected);
  });

  test("fetch rejection → network", async () => {
    expect(
      (
        await fail(() => {
          throw new TypeError("failed");
        })
      ).message,
    ).toBe(API_ERROR_COPY.network);
  });
});
