import type { ItemFilters } from "./filters";
import { FilterSelect } from "@/components/FilterSelect";
import { Icon } from "@/components/Icon";
import {
  categoryIcons,
  categoryNames,
  colors,
  seasons,
  sortOptions,
  statuses,
} from "@/constants/wardrobe";

export function FilterBar({
  query,
  onQuery,
  filters,
  onFilter,
  sort,
  onSort,
  category,
  onCategory,
  locationOptions,
  counts,
  total,
}: {
  query: string;
  onQuery: (v: string) => void;
  filters: ItemFilters;
  onFilter: (key: keyof ItemFilters, v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  locationOptions: string[];
  counts: Record<string, number>;
  total: number;
}) {
  return (
    <>
      <div className="toolbar">
        <label className="searchbox">
          <Icon name="search" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Tìm theo tên, hãng, màu, tag, chất liệu, ghi chú, vị trí…"
          />
          {query && (
            <button onClick={() => onQuery("")}>
              <Icon name="close" size={15} />
            </button>
          )}
        </label>
        <FilterSelect
          value={filters.status}
          onChange={(v) => onFilter("status", v)}
          label="Trạng thái"
          options={statuses}
        />
        <FilterSelect
          value={filters.season}
          onChange={(v) => onFilter("season", v)}
          label="Mùa"
          options={seasons}
        />
        <FilterSelect
          value={filters.location}
          onChange={(v) => onFilter("location", v)}
          label="Vị trí lưu trữ"
          options={locationOptions}
        />
        <FilterSelect
          value={filters.color}
          onChange={(v) => onFilter("color", v)}
          label="Màu"
          options={colors}
        />
        <FilterSelect value={sort} onChange={onSort} label="Sắp xếp" options={sortOptions} sort />
      </div>
      <div className="categories">
        {["Tất cả", ...categoryNames].map((c) => (
          <button key={c} className={category === c ? "active" : ""} onClick={() => onCategory(c)}>
            <i>{categoryIcons[c]}</i>
            {c}
            <span>{c === "Tất cả" ? total : counts[c]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
