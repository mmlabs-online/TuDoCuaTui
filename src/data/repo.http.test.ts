import { afterEach, describe, expect, test, vi } from "vitest";
import { EDITOR_COPY } from "@/features/items/copy";
import type { Item } from "@/types/item";
import { API_ERROR_COPY, ApiError, PHOTO_UPLOAD_ERROR_COPY, PhotoSaveError } from "./apiErrors";
import { PhotoPrepError } from "./photoPrep";
import { fixtureBackup } from "@/test/fixtures";
import { createHttpRepo } from "./repo.http";

afterEach(() => {
  prepare.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ID = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const prepare = vi.fn(async (_b: Blob) => ({
  blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
}));
const setup = (res: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => res());
  return { fetchFn, repo: createHttpRepo(fetchFn as unknown as typeof fetch, "/api", prepare) };
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

  test("a saved duplicate takes created_at from the server", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(ID);
    const { repo, fetchFn } = setup(() =>
      json({ item: { ...row, created_at: "2026-11-21T03:00:00Z" } }),
    );
    const saved = await repo.save(item({ id: "", createdAt: "2025-01-01T00:00:00Z" }));
    expect(JSON.parse(call(fetchFn).init.body as string)).not.toHaveProperty("created_at");
    expect(saved.createdAt).toBe("2026-11-21T03:00:00Z");
  });

  const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
  const DATA_URL = "data:image/jpeg;base64,AAAA";

  test('list maps primary_photo_id to photo "/api/photos/<id>" and photoPath', async () => {
    const { repo } = setup(() => json({ items: [{ ...row, primary_photo_id: PHOTO_ID }] }));
    const [it] = await repo.list();
    expect(it.photoPath).toBe(PHOTO_ID);
    expect(it.photo).toBe(`/api/photos/${PHOTO_ID}`);
  });

  test('row without a photo maps to photo ""', async () => {
    const { repo } = setup(() => json({ items: [{ ...row, primary_photo_id: null }] }));
    const [it] = await repo.list();
    expect(it.photo).toBe("");
    expect(it.photoPath).toBeUndefined();
  });

  test("save with a blob: photo prepares it before the item PUT and uploads the JPEG", async () => {
    let n = 0;
    const { repo, fetchFn } = setup(() =>
      json({ item: ++n === 1 ? row : { ...row, primary_photo_id: PHOTO_ID } }),
    );
    const saved = await repo.save(item({ photo: DATA_URL }));
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(fetchFn.mock.invocationCallOrder[0]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(call(fetchFn).init.body).not.toContain("data:image");
    const c = call(fetchFn, 1);
    expect(c.url).toBe(`/api/items/${ID}/photo`);
    expect(c.init.method).toBe("PUT");
    expect(c.headers["Content-Type"]).toBe("image/jpeg");
    expect(c.init.body).toBe((await prepare.mock.results[0].value).blob);
    expect(saved.photoPath).toBe(PHOTO_ID);
    expect(saved.photo).toBe(`/api/photos/${PHOTO_ID}`);
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
    await repo.save(item({ photo: `/api/photos/${PHOTO_ID}`, photoPath: PHOTO_ID }));
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls.every((c) => !String(c[0]).includes("/photo"))).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });

  test("a photo that fails preparation throws before any request", async () => {
    const { repo, fetchFn } = setup(() => json({ item: row }));
    const failure = new PhotoPrepError("tooLarge");
    prepare.mockRejectedValueOnce(failure);
    const err = await repo.save(item({ photo: DATA_URL })).catch((e) => e);
    expect(err).toBe(failure);
    expect(err).not.toBeInstanceOf(PhotoSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a photo over the pixel cap throws before any request", async () => {
    const { repo, fetchFn } = setup(() => json({ item: row }));
    const failure = new PhotoPrepError("tooManyPixels");
    prepare.mockRejectedValueOnce(failure);
    const err = await repo.save(item({ photo: DATA_URL })).catch((e) => e);
    expect(err).toBe(failure);
    expect(err.message).toBe(EDITOR_COPY.photo.errors.tooManyPixels);
    expect(fetchFn).not.toHaveBeenCalled();
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

  test.each([
    [409, "photo_quota_exceeded"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
    [429, "rate_limited"],
    [503, "photos_unavailable"],
  ] as const)("a %i %s photo step throws PhotoSaveError with that copy", async (status, code) => {
    let n = 0;
    const { repo } = setup(() =>
      ++n === 1 ? json({ item: row }) : json({ error: { code } }, status),
    );
    const err = await repo.save(item({ photo: DATA_URL })).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoSaveError);
    const photoCopy = (PHOTO_UPLOAD_ERROR_COPY as Record<string, string>)[code];
    expect(err.message).toContain(photoCopy ?? API_ERROR_COPY[code]);
  });

  test.each([
    [429, "rate_limited", "3600"],
    [503, "photos_unavailable", "5"],
  ] as const)("ApiError carries Retry-After seconds (%i)", async (status, code, header) => {
    const { repo } = setup(
      () =>
        new Response(JSON.stringify({ error: { code } }), {
          status,
          headers: { "Content-Type": "application/json", "Retry-After": header },
        }),
    );
    const err = await repo.list().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.retryAfterSec).toBe(Number(header));
  });

  test("PhotoSaveError cause keeps retryAfterSec", async () => {
    let n = 0;
    const { repo } = setup(() =>
      ++n === 1
        ? json({ item: row })
        : new Response(JSON.stringify({ error: { code: "rate_limited" } }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "90" },
          }),
    );
    const err = await repo.save(item({ photo: DATA_URL })).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoSaveError);
    expect(err.cause).toBeInstanceOf(ApiError);
    expect(err.cause.retryAfterSec).toBe(90);
  });

  test.each([undefined, "abc", "Wed, 21 Oct 2026 07:28:00 GMT", "-5"])(
    "missing or non-numeric Retry-After (%s) → undefined",
    async (header) => {
      const { repo } = setup(
        () =>
          new Response(JSON.stringify({ error: { code: "rate_limited" } }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...(header !== undefined && { "Retry-After": header }),
            },
          }),
      );
      const err = await repo.list().catch((e) => e);
      expect(err.retryAfterSec).toBeUndefined();
    },
  );

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

describe("backup and restore", () => {
  const summary = {
    locations: { inserted: 2, updated: 0, unchanged: 0, merged: 0, remapped: 0 },
    items: { inserted: 3, updated: 0, unchanged: 0, remapped: 0 },
    wearLogs: { inserted: 2, unchanged: 0 },
    photosMissing: 1,
  };

  test("exportAll GETs /api/backup and returns the body unchanged", async () => {
    const { fetchFn, repo } = setup(() => json(fixtureBackup));
    expect(await repo.exportAll()).toEqual(fixtureBackup);
    const c = call(fetchFn);
    expect(c.url).toBe("/api/backup");
    expect(c.init.method).toBe("GET");
  });

  test("restore POSTs the backup as JSON to /api/restore and returns summary", async () => {
    const { fetchFn, repo } = setup(() => json({ summary }));
    expect(await repo.restore(fixtureBackup)).toEqual(summary);
    const c = call(fetchFn);
    expect(c.url).toBe("/api/restore");
    expect(c.init.method).toBe("POST");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.init.body).toBe(JSON.stringify(fixtureBackup));
  });

  test("restore 400 invalid_input keeps field and reason; 503 restore_busy is an ApiError with that code", async () => {
    const bad = setup(() =>
      json(
        { error: { code: "invalid_input", field: "items[3].name", reason: "nameRequired" } },
        400,
      ),
    );
    await expect(bad.repo.restore(fixtureBackup)).rejects.toMatchObject({
      status: 400,
      code: "invalid_input",
      field: "items[3].name",
      reason: "nameRequired",
    });
    const busy = setup(() => json({ error: { code: "restore_busy" } }, 503));
    const e = await busy.repo.restore(fixtureBackup).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 503, code: "restore_busy" });
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

  test("401 → session expired", async () => {
    expect((await fail(() => json({ error: { code: "unauthorized" } }, 401))).message).toBe(
      API_ERROR_COPY.unauthorized,
    );
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

describe("identity mode (getToken)", () => {
  const withAuth = (statuses: number[], auth: Parameters<typeof createHttpRepo>[3]) => {
    const q = [...statuses];
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => {
      const st = q.shift() ?? 200;
      return st === 401 ? new Response("", { status: 401 }) : json({ locations: ["A"] });
    });
    const repo = createHttpRepo(fetchFn as unknown as typeof fetch, "/api", prepare, auth);
    return { fetchFn, repo };
  };

  test("bearer + one retry after a 401", async () => {
    const tokens = ["old", "new"];
    const getToken = vi.fn(async (_r?: string) => tokens.shift() ?? null);
    const { fetchFn, repo } = withAuth([401, 200], { getToken });
    expect(await repo.locations()).toEqual(["A"]);
    expect(call(fetchFn, 0).headers.Authorization).toBe("Bearer old");
    expect(call(fetchFn, 1).headers.Authorization).toBe("Bearer new");
    expect(getToken.mock.calls[1]).toEqual(["old"]);
  });

  test("second 401 -> onAuthLost and ApiError(401)", async () => {
    const onAuthLost = vi.fn();
    const { fetchFn, repo } = withAuth([401, 401], { getToken: async () => "t", onAuthLost });
    await expect(repo.locations()).rejects.toMatchObject({ status: 401 });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("a redirect → ApiError(0, unexpected), not the unauthorized copy; no onAuthLost", async () => {
    const onAuthLost = vi.fn();
    const redirect = {
      type: "opaqueredirect",
      status: 0,
      ok: false,
      headers: new Headers(),
    } as Response;
    const fetchFn = vi.fn(async () => redirect);
    const repo = createHttpRepo(fetchFn as unknown as typeof fetch, "/api", prepare, {
      getToken: async () => "t",
      onAuthLost,
    });
    const e = await repo.list().then(
      () => {
        throw new Error("expected failure");
      },
      (err: ApiError) => err,
    );
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code]).toEqual([0, "unexpected"]);
    expect(e.message).not.toBe(API_ERROR_COPY.unauthorized);
    expect(onAuthLost).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("403 forbidden_origin → ApiError(403, forbidden_origin); no onAuthLost", async () => {
    const onAuthLost = vi.fn();
    const fetchFn = vi.fn(async () => json({ error: { code: "forbidden_origin" } }, 403));
    const repo = createHttpRepo(fetchFn as unknown as typeof fetch, "/api", prepare, {
      getToken: async () => "t",
      onAuthLost,
    });
    await expect(repo.locations()).rejects.toMatchObject({ status: 403, code: "forbidden_origin" });
    expect(onAuthLost).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("no header without getToken", async () => {
    const { fetchFn, repo } = withAuth([200], {});
    await repo.locations();
    expect(call(fetchFn).headers.Authorization).toBeUndefined();
  });
});

describe("createHttpRepo save withPrepared (F-703)", () => {
  const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
  const DATA_URL = "data:image/jpeg;base64,AAAA";
  const twoCalls = () => {
    let n = 0;
    return setup(() => json({ item: ++n === 1 ? row : { ...row, primary_photo_id: PHOTO_ID } }));
  };

  test("withPrepared receives the prepared JPEG once and its result is the row that is PUT", async () => {
    const { repo, fetchFn } = twoCalls();
    const hook = vi.fn(async (_j: Blob, it: Item) => ({ ...it, name: "Từ AI", brand: "Uniqlo" }));
    await repo.save(item({ photo: DATA_URL }), { withPrepared: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toBe((await prepare.mock.results[0].value).blob);
    const body = JSON.parse(call(fetchFn).init.body as string);
    expect(body).toMatchObject({ name: "Từ AI", brand: "Uniqlo" });
    expect(call(fetchFn, 1).init.body).toBe((await prepare.mock.results[0].value).blob);
  });

  test("withPrepared is not called without a new photo", async () => {
    const { repo } = setup(() => json({ item: row }));
    const hook = vi.fn(async (_j: Blob, it: Item) => it);
    await repo.save(item({ photo: "" }), { withPrepared: hook });
    await repo.save(item({ photo: "/api/photos/x" }), { withPrepared: hook });
    expect(hook).not.toHaveBeenCalled();
  });

  test("withPrepared cannot change the id or the uploaded bytes", async () => {
    const { repo, fetchFn } = twoCalls();
    await repo.save(item({ photo: DATA_URL }), {
      withPrepared: async (_j, it) => ({
        ...it,
        id: "other",
        photo: "data:image/jpeg;base64,BBBB",
      }),
    });
    expect(call(fetchFn).url).toBe(`/api/items/${ID}`);
    expect(call(fetchFn, 1).url).toBe(`/api/items/${ID}/photo`);
    expect(call(fetchFn, 1).init.body).toBe((await prepare.mock.results[0].value).blob);
  });
});
