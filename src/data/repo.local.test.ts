import { afterEach, describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { createLocalRepo } from "./repo";

vi.mock("./photos", () => ({ resizeImage: vi.fn(), urlToBlob: vi.fn() }));

const LS_KEY = "tu-do-items";

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

const starter = [makeItem({ id: "s1", name: "Starter" })];
const make = () => createLocalRepo(starter, ["Tủ phòng ngủ", "Kệ giày"]);
const stored = () => JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as Item[];

afterEach(() => {
  vi.useRealTimers();
});

describe("createLocalRepo", () => {
  test("mode is local", () => {
    expect(make().mode).toBe("local");
  });

  test("list returns starter items when storage is empty", async () => {
    expect(await make().list()).toEqual(starter);
  });

  test("list reads stored items", async () => {
    const seeded = [makeItem({ id: "x", name: "Stored" })];
    localStorage.setItem(LS_KEY, JSON.stringify(seeded));
    expect(await make().list()).toEqual(seeded);
  });

  test("list falls back to starter on corrupt JSON", async () => {
    localStorage.setItem(LS_KEY, "{not json");
    expect(await make().list()).toEqual(starter);
  });

  test("locations merges defaults and item locations without duplicates or empties", async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        makeItem({ id: "1", location: "Kệ giày" }),
        makeItem({ id: "2", location: "Hộc tủ" }),
        makeItem({ id: "3", location: "" }),
        makeItem({ id: "4", location: "Hộc tủ" }),
      ]),
    );
    expect(await make().locations()).toEqual(["Tủ phòng ngủ", "Kệ giày", "Hộc tủ"]);
  });

  test("save new item without id prepends it with a generated id and persists", async () => {
    const repo = make();
    const saved = await repo.save(makeItem({ id: "", name: "Mới" }));
    expect(saved.id).not.toBe("");
    expect((await repo.list()).map((i) => i.id)).toEqual([saved.id, "s1"]);
    expect(stored()[0]).toEqual(saved);
  });

  test("save existing id replaces in place", async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([makeItem({ id: "1" }), makeItem({ id: "2" }), makeItem({ id: "3" })]),
    );
    const repo = make();
    await repo.save(makeItem({ id: "2", name: "Đổi" }));
    const list = await repo.list();
    expect(list.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(list[1].name).toBe("Đổi");
  });

  test("save with an unknown non-empty id prepends it", async () => {
    const repo = make();
    await repo.save(makeItem({ id: "zzz" }));
    expect((await repo.list()).map((i) => i.id)).toEqual(["zzz", "s1"]);
  });

  test("save keeps working in memory when setItem throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const repo = make();
    const saved = await repo.save(makeItem({ id: "" }));
    expect((await repo.list())[0]).toEqual(saved);
  });

  test("remove deletes by id and persists", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([makeItem({ id: "1" }), makeItem({ id: "2" })]));
    const repo = make();
    await repo.remove(makeItem({ id: "1" }));
    expect((await repo.list()).map((i) => i.id)).toEqual(["2"]);
    expect(stored().map((i) => i.id)).toEqual(["2"]);
  });

  const freeze = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  test("wear +1 sets lastWorn to today's local date (YYYY-MM-DD) and already=false", async () => {
    freeze("2026-11-06T17:30:00Z");
    const repo = make();
    const item = makeItem({ id: "s1", wearCount: 2 });
    await repo.save(item);
    const res = await repo.wear(item, 1);
    expect(res).toEqual({ wearCount: 3, lastWorn: "2026-11-07", already: false });
    expect((await repo.list())[0]).toMatchObject({ wearCount: 3, lastWorn: "2026-11-07" });
  });

  test("wear +1 twice on the same day counts once and flags already", async () => {
    freeze("2026-11-07T03:00:00Z");
    const repo = make();
    const item = makeItem({ id: "s1" });
    await repo.save(item);
    await repo.wear(item, 1);
    const before = stored();
    const res = await repo.wear(item, 1);
    expect(res).toEqual({ wearCount: 1, lastWorn: "2026-11-07", already: true });
    expect(stored()).toEqual(before);
  });

  test("wear +1 counts again on the next local day", async () => {
    freeze("2026-11-07T03:00:00Z");
    const repo = make();
    const item = makeItem({ id: "s1" });
    await repo.save(item);
    await repo.wear(item, 1);
    freeze("2026-11-08T03:00:00Z");
    expect(await repo.wear(item, 1)).toEqual({
      wearCount: 2,
      lastWorn: "2026-11-08",
      already: false,
    });
  });

  test("wear +1 when lastWorn is an ISO timestamp from earlier today (demo/legacy data) flags already", async () => {
    freeze("2026-11-07T08:00:00Z");
    const item = makeItem({ id: "s1", wearCount: 2, lastWorn: "2026-11-07T01:00:00.000Z" });
    const repo = make();
    await repo.save(item);
    const res = await repo.wear(item, 1);
    expect(res.already).toBe(true);
    expect(res.wearCount).toBe(2);
  });

  test("wear -1 after today's wear restores the previous lastWorn", async () => {
    freeze("2026-11-07T03:00:00Z");
    const item = makeItem({ id: "s1", wearCount: 3, lastWorn: "2026-11-01" });
    const repo = make();
    await repo.save(item);
    await repo.wear(item, 1);
    expect(await repo.wear(item, -1)).toEqual({
      wearCount: 3,
      lastWorn: "2026-11-01",
      already: false,
    });
    expect((await repo.wear(item, 1)).already).toBe(false);
  });

  test("wear -1 of today's wear with no remembered previous date clears lastWorn", async () => {
    freeze("2026-11-07T03:00:00Z");
    const item = makeItem({ id: "s1", wearCount: 3, lastWorn: "2026-11-07" });
    await make().save(item);
    const res = await make().wear(item, -1);
    expect(res).toEqual({ wearCount: 2, lastWorn: "", already: false });
  });

  test("wear -1 to 0 clears lastWorn", async () => {
    const item = makeItem({ id: "s1", wearCount: 1, lastWorn: "2026-01-01" });
    const repo = make();
    await repo.save(item);
    expect(await repo.wear(item, -1)).toEqual({ wearCount: 0, lastWorn: "", already: false });
  });

  test("wear -1 of an older wear keeps lastWorn", async () => {
    freeze("2026-11-07T03:00:00Z");
    const item = makeItem({ id: "s1", wearCount: 3, lastWorn: "2026-01-01T00:00:00.000Z" });
    const repo = make();
    await repo.save(item);
    expect(await repo.wear(item, -1)).toEqual({
      wearCount: 2,
      lastWorn: "2026-01-01T00:00:00.000Z",
      already: false,
    });
  });

  test("wear -1 never goes below 0", async () => {
    const item = makeItem({ id: "s1", wearCount: 0 });
    const repo = make();
    await repo.save(item);
    expect((await repo.wear(item, -1)).wearCount).toBe(0);
  });

  test("wear on an item not in storage uses the passed item", async () => {
    const repo = make();
    const res = await repo.wear(makeItem({ id: "ghost", wearCount: 4 }), 1);
    expect(res.wearCount).toBe(5);
  });
});
