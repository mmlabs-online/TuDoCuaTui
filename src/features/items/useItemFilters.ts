import { useMemo, useState } from "react";

import type { Item } from "@/types/item";
import { categoryNames, sortOptions } from "@/constants/wardrobe";
import { matchesFilters, sortItems, type ItemFilters } from "./filters";

export function useItemFilters(items: Item[]) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [filters, setFilters] = useState({
    status: "",
    season: "",
    location: "",
    color: "",
    special: "",
  });
  const [sort, setSort] = useState<string>(sortOptions[0]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        categoryNames.map((c) => [c, items.filter((i) => i.category === c).length]),
      ),
    [items],
  );
  const visible = useMemo(() => {
    return sortItems(
      items.filter((i) => matchesFilters(i, { query, category, filters })),
      sort,
    );
  }, [items, query, category, filters, sort]);

  const resetFilters = () => {
    setQuery("");
    setCategory("Tất cả");
    setFilters({ status: "", season: "", location: "", color: "", special: "" });
  };
  const toggleSpecial = (s: string) =>
    setFilters((f) => ({ ...f, special: f.special === s ? "" : s }));
  const setFilter = (key: keyof ItemFilters, v: string) => setFilters((f) => ({ ...f, [key]: v }));
  const hasActiveFilters = !!(
    query ||
    category !== "Tất cả" ||
    Object.values(filters).some(Boolean)
  );

  return {
    query,
    setQuery,
    category,
    setCategory,
    filters,
    sort,
    setSort,
    counts,
    visible,
    hasActiveFilters,
    setFilter,
    toggleSpecial,
    resetFilters,
  };
}
