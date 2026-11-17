import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { createMemoryRepo } from "@/test/memoryRepo";
import { API_ERROR_COPY } from "./apiErrors";
import type { WardrobeRepo } from "./repo";
import { type ImportResult, useWardrobe } from "./useWardrobe";

vi.mock("./photos", () => ({ resizeImage: vi.fn(), urlToBlob: vi.fn() }));

// Per-test switch: the "memory" describe swaps the HTTP repo for the in-memory double; the others use the real one.
const repoSwitch = vi.hoisted(() => ({ memory: null as WardrobeRepo | null }));
vi.mock("./repo.http", async (orig) => {
  const actual = await orig<typeof import("./repo.http")>();
  return {
    ...actual,
    createHttpRepo: (...a: Parameters<typeof actual.createHttpRepo>) =>
      repoSwitch.memory ?? actual.createHttpRepo(...a),
  };
});

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: "a",
  name: "Áo",
  category: "Áo",
  status: "Đang dùng",
  colors: [],
  seasons: [],
  brand: "",
  size: "",
  location: "",
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

const starter = [
  makeItem({ id: "s1", name: "Một", location: "Kệ giày" }),
  makeItem({ id: "s2", name: "Hai", location: "Ngăn kéo" }),
];
const defaults = ["Tủ phòng ngủ", "Kệ giày"];

const setup = async () => {
  const hook = renderHook(() => useWardrobe());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

afterEach(cleanup);

describe("useWardrobe", () => {
  describe("with a memory repo", () => {
    beforeEach(() => {
      repoSwitch.memory = createMemoryRepo(starter, defaults);
    });
    afterEach(() => {
      repoSwitch.memory = null;
    });

    test("loads items and default plus item locations", async () => {
      const hook = renderHook(() => useWardrobe());
      expect(hook.result.current.loading).toBe(true);
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      expect(hook.result.current.items).toEqual(starter);
      expect(hook.result.current.locations).toEqual(["Tủ phòng ngủ", "Kệ giày", "Ngăn kéo"]);
      expect(hook.result.current.error).toBeNull();
    });

    test("save adds a new item first and appends its new location", async () => {
      const { result } = await setup();
      await act(async () => {
        await result.current.save(makeItem({ id: "", name: "Mới", location: "Kệ mới" }));
      });
      expect(result.current.items.map((i) => i.name)).toEqual(["Mới", "Một", "Hai"]);
      expect(result.current.locations.filter((l) => l === "Kệ mới")).toHaveLength(1);
    });

    test("save of an existing item replaces it in place without duplicating its location", async () => {
      const { result } = await setup();
      await act(async () => {
        await result.current.save({ ...starter[0], name: "Đổi tên" });
      });
      expect(result.current.items.map((i) => i.name)).toEqual(["Đổi tên", "Hai"]);
      expect(result.current.locations.filter((l) => l === "Kệ giày")).toHaveLength(1);
    });

    test("save with an empty location leaves locations unchanged", async () => {
      const { result } = await setup();
      const before = result.current.locations;
      await act(async () => {
        await result.current.save(makeItem({ id: "n", location: "" }));
      });
      expect(result.current.locations).toEqual(before);
    });

    test("remove drops the item", async () => {
      const { result } = await setup();
      await act(async () => {
        await result.current.remove(starter[0]);
      });
      expect(result.current.items.map((i) => i.id)).toEqual(["s2"]);
    });

    test("wear +1 updates only the matching item", async () => {
      const { result } = await setup();
      let res: unknown;
      await act(async () => {
        res = await result.current.wear(starter[0], 1);
      });
      expect(res).toMatchObject({ wearCount: 1 });
      expect(result.current.items[0].wearCount).toBe(1);
      expect(result.current.items[1]).toEqual(starter[1]);
    });

    test("wear passes the already flag through and does not store it on the item", async () => {
      const { result } = await setup();
      let first: unknown;
      let second: unknown;
      await act(async () => {
        first = await result.current.wear(starter[0], 1);
      });
      await act(async () => {
        second = await result.current.wear(starter[0], 1);
      });
      expect(first).toMatchObject({ already: false });
      expect(second).toMatchObject({ already: true });
      expect(result.current.items[0]).not.toHaveProperty("already");
      expect(result.current.items[0].wearCount).toBe(1);
    });

    test("importMany saves in order with fresh ids and reports progress", async () => {
      const { result } = await setup();
      const onProgress = vi.fn();
      let out: ImportResult[] = [];
      await act(async () => {
        out = await result.current.importMany(
          [makeItem({ id: "x1", name: "X1" }), makeItem({ id: "x2", name: "X2" })],
          { onProgress },
        );
      });
      const saved = out.map((r) => (r.ok ? r.item : null));
      expect(out.every((r) => r.ok)).toBe(true);
      expect(saved.map((i) => i?.name)).toEqual(["X1", "X2"]);
      expect(saved.every((i) => i && i.id && i.id !== "x1" && i.id !== "x2")).toBe(true);
      expect(onProgress.mock.calls).toEqual([
        [1, 2],
        [2, 2],
      ]);
      expect(result.current.items).toHaveLength(4);
    });

    test("importMany works without options", async () => {
      const { result } = await setup();
      await act(async () => {
        await result.current.importMany([makeItem({ id: "x1" })]);
      });
      expect(result.current.items).toHaveLength(3);
    });

    test("importMany adds each saved item to state before the next row starts", async () => {
      const { result } = await setup();
      const seen: number[] = [];
      await act(async () => {
        await result.current.importMany([makeItem({ name: "A" }), makeItem({ name: "B" })], {
          onProgress: () => seen.push(result.current.items.length),
        });
      });
      // onProgress runs right after onSaved; React may batch, so check the end state too.
      expect(seen).toHaveLength(2);
      expect(result.current.items.map((i) => i.name).slice(0, 2)).toEqual(["B", "A"]);
    });

    test("importMany imports 200 items and all of them are in state", async () => {
      const { result } = await setup();
      const list = Array.from({ length: 200 }, (_, i) => makeItem({ name: `Món ${i}` }));
      let out: ImportResult[] = [];
      await act(async () => {
        out = await result.current.importMany(list);
      });
      expect(out).toHaveLength(200);
      expect(out.every((r) => r.ok)).toBe(true);
      expect(result.current.items).toHaveLength(202);
    });

    test("importMany stops when the signal is aborted", async () => {
      const { result } = await setup();
      const controller = new AbortController();
      let out: ImportResult[] = [];
      await act(async () => {
        out = await result.current.importMany(
          [makeItem({ name: "A" }), makeItem({ name: "B" }), makeItem({ name: "C" })],
          { onProgress: (done) => done === 1 && controller.abort(), signal: controller.signal },
        );
      });
      expect(out).toHaveLength(1);
      expect(result.current.items).toHaveLength(3);
    });

    test("the hook result has no signOut", async () => {
      const { result } = await setup();
      expect(result.current).not.toHaveProperty("signOut");
    });

    test("message returns Error messages and the generic text for unknown values", async () => {
      const { message } = (await setup()).result.current;
      expect(message(new Error("Mất mạng"))).toBe("Mất mạng");
      for (const v of [{}, null, "x"]) expect(message(v)).toBe("Có lỗi xảy ra, thử lại nhé");
    });
  });

  describe("HTTP repo", () => {
    afterEach(() => vi.unstubAllGlobals());

    const photoFetch = () =>
      vi.fn(async (url: string) =>
        url.startsWith("/api/photos/")
          ? new Response(new Blob(["x"]), { headers: { "Content-Type": "image/jpeg" } })
          : new Response(
              JSON.stringify(url.endsWith("/locations") ? { locations: [] } : { items: [] }),
              { headers: { "Content-Type": "application/json" } },
            ),
      );

    test("photo loader: null without getToken; present with getToken; unmount revokes", async () => {
      vi.stubGlobal("fetch", photoFetch());
      const getToken = async () => "t";
      const noToken = renderHook(() => useWardrobe());
      expect(noToken.result.current.photos).toBeNull();
      await waitFor(() => expect(noToken.result.current.loading).toBe(false));

      let n = 0;
      const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:t/${n++}`);
      const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      const api = renderHook(() => useWardrobe({ getToken }));
      await waitFor(() => expect(api.result.current.loading).toBe(false));
      const loader = api.result.current.photos!;
      expect(loader).not.toBeNull();
      await loader.acquire("/api/photos/11111111-1111-4111-8111-111111111111").promise;
      expect(create).toHaveBeenCalledTimes(1);
      api.unmount();
      expect(revoke).toHaveBeenCalledWith("blob:t/0");
      create.mockRestore();
      revoke.mockRestore();
    });

    test("loads through the HTTP repo", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (url: string) =>
            new Response(
              JSON.stringify(url.endsWith("/locations") ? { locations: ["L"] } : { items: [] }),
              {
                headers: { "Content-Type": "application/json" },
              },
            ),
        ),
      );
      const { result } = renderHook(() => useWardrobe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.items).toEqual([]);
      expect(result.current.locations).toEqual(["L"]);
    });

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    test("a load error shows the ApiError message and loading ends", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ error: { code: "db_unavailable" } }, 503)),
      );
      const { result } = renderHook(() => useWardrobe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe(API_ERROR_COPY.db_unavailable);
    });

    test("importMany continues after a failed row and keeps the saved rows in state", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if ((init?.method ?? "GET") === "GET") {
            return json(url.endsWith("/locations") ? { locations: [] } : { items: [] });
          }
          const id = /\/items\/([^/]+)/.exec(url)![1];
          const name = JSON.parse(init!.body as string).name as string;
          if (name === "X2") return json({ error: { code: "invalid_input" } }, 400);
          return json({ item: { id, name, category: "top", status: "active" } });
        }),
      );
      const { result } = renderHook(() => useWardrobe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      let out: ImportResult[] = [];
      await act(async () => {
        out = await result.current.importMany([
          makeItem({ name: "X1" }),
          makeItem({ name: "X2" }),
          makeItem({ name: "X3" }),
        ]);
      });
      expect(out.map((r) => r.ok)).toEqual([true, false, true]);
      expect(out[1]).toEqual({ index: 1, ok: false, error: API_ERROR_COPY.invalid_input });
      expect(result.current.items.map((i) => i.name).sort()).toEqual(["X1", "X3"]);
    });
  });

  describe("with getToken", () => {
    afterEach(() => vi.unstubAllGlobals());
    test("repo and photo loader both get getToken on the first render; onAuthLost is forwarded", async () => {
      const calls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
          calls.push(`${url} ${auth}`);
          if (url.includes("/photos/")) {
            return new Response(new Blob(["x"]), {
              status: 200,
              headers: { "Content-Type": "image/jpeg" },
            });
          }
          return new Response("", { status: 401 });
        }),
      );
      vi.stubGlobal(
        "URL",
        class extends URL {
          static createObjectURL = () => "blob:x";
          static revokeObjectURL = () => {};
        },
      );
      const getToken = vi.fn(async (_r?: string) => "tok");
      const onAuthLost = vi.fn();
      const { result, rerender } = renderHook(() => useWardrobe({ getToken, onAuthLost }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(calls.some((c) => c.endsWith("Bearer tok"))).toBe(true);
      expect(onAuthLost).toHaveBeenCalled();
      const photos = result.current.photos;
      expect(photos).not.toBeNull();
      rerender();
      expect(result.current.photos).toBe(photos);
      await photos!.acquire("/api/photos/11111111-1111-4111-8111-111111111111").promise;
      expect(calls.some((c) => c.includes("/photos/") && c.endsWith("Bearer tok"))).toBe(true);
    });
  });
});
