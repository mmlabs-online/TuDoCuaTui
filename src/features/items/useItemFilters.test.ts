import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Item } from "@/types/item";
import { useItemFilters } from "./useItemFilters";

describe("useItemFilters", () => {
  test("filterKey changes with query, category, filters and sort but not with items", () => {
    const { result, rerender } = renderHook(({ items }) => useItemFilters(items), {
      initialProps: { items: [] as Item[] },
    });
    const keys = [result.current.filterKey];
    rerender({
      items: [{ id: "x", name: "Áo", colors: [], tags: [], seasons: [] } as unknown as Item],
    });
    expect(result.current.filterKey).toBe(keys[0]);

    act(() => result.current.setQuery("áo"));
    keys.push(result.current.filterKey);
    act(() => result.current.setCategory("Quần"));
    keys.push(result.current.filterKey);
    act(() => result.current.setFilter("status", "Đang dùng"));
    keys.push(result.current.filterKey);
    act(() => result.current.setSort("Tên A→Z"));
    keys.push(result.current.filterKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
