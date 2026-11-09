import type { SupabaseClient } from "@supabase/supabase-js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fakeSupabase";
import type { Database } from "@/types/database";
import type { Item } from "@/types/item";
import { useWardrobe } from "./useWardrobe";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  get supabase() {
    return h.client;
  },
}));
vi.mock("./photos", () => ({ resizeImage: vi.fn(), urlToBlob: vi.fn() }));

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

const useFake = (fake: FakeSupabase) => {
  h.client = fake.client as unknown as SupabaseClient<Database>;
};

const setup = async () => {
  const hook = renderHook(() => useWardrobe(starter, defaults));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

afterEach(() => {
  cleanup();
  h.client = null;
});

describe("useWardrobe", () => {
  describe("local mode", () => {
    test("loads starter items and default plus item locations", async () => {
      const hook = renderHook(() => useWardrobe(starter, defaults));
      expect(hook.result.current.mode).toBe("local");
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
      let out: Item[] = [];
      await act(async () => {
        out = await result.current.importMany(
          [makeItem({ id: "x1", name: "X1" }), makeItem({ id: "x2", name: "X2" })],
          onProgress,
        );
      });
      expect(out.map((i) => i.name)).toEqual(["X1", "X2"]);
      expect(out.every((i) => i.id && i.id !== "x1" && i.id !== "x2")).toBe(true);
      expect(onProgress.mock.calls).toEqual([
        [1, 2],
        [2, 2],
      ]);
      expect(result.current.items).toHaveLength(4);
    });

    test("importMany works without onProgress", async () => {
      const { result } = await setup();
      await act(async () => {
        await result.current.importMany([makeItem({ id: "x1" })]);
      });
      expect(result.current.items).toHaveLength(3);
    });

    test("signOut does nothing", async () => {
      const { result } = await setup();
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });
  });

  test("message maps 23505, 42501, Error messages and unknown values", async () => {
    const { message } = (await setup()).result.current;
    expect(message({ code: "23505" })).toBe("Dữ liệu bị trùng");
    expect(message({ code: "42501" })).toBe("Không có quyền thao tác");
    expect(message(new Error("Mất mạng"))).toBe("Mất mạng");
    for (const v of [{}, null, "x"]) expect(message(v)).toBe("Có lỗi xảy ra, thử lại nhé");
  });

  describe("supabase mode", () => {
    test("loads through the Supabase repo", async () => {
      const fake = createFakeSupabase();
      fake.push({ data: [] }, { data: [{ name: "Kệ giày" }] });
      useFake(fake);
      const { result } = await setup();
      expect(result.current.mode).toBe("supabase");
      expect(result.current.locations).toEqual(["Kệ giày"]);
      expect(fake.calls).toContainEqual({
        table: "tudo_items_with_stats",
        method: "select",
        args: ["*"],
      });
      expect(fake.calls).toContainEqual({
        table: "tudo_locations",
        method: "select",
        args: ["name"],
      });
    });

    test("a load error shows the mapped message", async () => {
      const fake = createFakeSupabase();
      fake.push({ error: { code: "42501" } }, { data: [] });
      useFake(fake);
      const { result } = await setup();
      expect(result.current.error).toBe("Không có quyền thao tác");
      expect(result.current.loading).toBe(false);
    });

    test("signOut calls auth.signOut", async () => {
      const fake = createFakeSupabase();
      fake.push({ data: [] }, { data: [] });
      useFake(fake);
      const { result } = await setup();
      await act(async () => {
        await result.current.signOut();
      });
      expect(fake.client.auth.signOut).toHaveBeenCalledTimes(1);
    });

    test("importMany stops at the first failure and adds nothing to state (records current behaviour)", async () => {
      const fake = createFakeSupabase();
      const err = { code: "23505" };
      fake.push(
        { data: [] },
        { data: [] },
        { data: { id: "n1" } },
        { data: { id: "n1", name: "X1" } },
        { error: err },
      );
      useFake(fake);
      const { result } = await setup();
      let failure: unknown;
      await act(async () => {
        failure = await result.current
          .importMany([makeItem({ name: "X1" }), makeItem({ name: "X2" })])
          .catch((e: unknown) => e);
      });
      expect(failure).toBe(err);
      expect(result.current.items).toEqual([]);
      expect(fake.calls.filter((c) => c.method === "upsert")).toHaveLength(2);
    });
  });
});
