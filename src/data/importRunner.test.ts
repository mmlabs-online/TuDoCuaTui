import { describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { runImport } from "./importRunner";

const item = (name: string) => ({ name }) as Item;
const list = (n: number) => Array.from({ length: n }, (_, i) => item(`R${i + 1}`));
const echo = async (it: Item) => ({ ...it, id: `id-${it.name}` });

describe("runImport", () => {
  test("saves rows in order and returns ok results with the saved items", async () => {
    const out = await runImport(list(3), echo);
    expect(out.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(out.map((r) => r.ok && r.item.id)).toEqual(["id-R1", "id-R2", "id-R3"]);
  });

  test("a save that fails on row 3 does not stop rows 1, 2, 4, 5", async () => {
    const boom = new Error("boom");
    const save = vi.fn(async (it: Item) => {
      if (it.name === "R3") throw boom;
      return echo(it);
    });
    const out = await runImport(list(5), save);
    expect(save).toHaveBeenCalledTimes(5);
    expect(out.map((r) => r.ok)).toEqual([true, true, false, true, true]);
    expect(out[2]).toEqual({ index: 2, ok: false, error: boom });
  });

  test("onSaved runs for each saved row before the next save starts; never for failed rows", async () => {
    const events: string[] = [];
    await runImport(
      list(3),
      async (it) => {
        events.push(`save ${it.name}`);
        if (it.name === "R2") throw new Error("x");
        return echo(it);
      },
      { onSaved: (it, i) => events.push(`saved ${it.name} #${i}`) },
    );
    expect(events).toEqual(["save R1", "saved R1 #0", "save R2", "save R3", "saved R3 #2"]);
  });

  test("onProgress counts attempted rows, failures included (1/5 … 5/5)", async () => {
    const onProgress = vi.fn();
    await runImport(
      list(5),
      async (it) => {
        if (it.name === "R2") throw new Error("x");
        return echo(it);
      },
      { onProgress },
    );
    expect(onProgress.mock.calls).toEqual([1, 2, 3, 4, 5].map((n) => [n, 5]));
  });

  test("an abort during row 2 lets row 2 finish and never starts row 3", async () => {
    const controller = new AbortController();
    const save = vi.fn(async (it: Item) => {
      if (it.name === "R2") controller.abort();
      return echo(it);
    });
    const out = await runImport(list(3), save, { signal: controller.signal });
    expect(out).toHaveLength(2);
    expect(out[1].ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  test("an already aborted signal saves nothing and returns []", async () => {
    const save = vi.fn(echo);
    const out = await runImport(list(3), save, { signal: AbortSignal.abort() });
    expect(out).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  test("empty list returns [] without calling save or onProgress", async () => {
    const save = vi.fn(echo);
    const onProgress = vi.fn();
    expect(await runImport([], save, { onProgress })).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  test("200 items all succeed in order with 200 progress calls", async () => {
    const onProgress = vi.fn();
    const out = await runImport(list(200), echo, { onProgress });
    expect(out).toHaveLength(200);
    expect(out.every((r, i) => r.ok && r.index === i)).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(200);
    expect(onProgress).toHaveBeenLastCalledWith(200, 200);
  });
});
