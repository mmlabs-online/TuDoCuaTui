import { useEffect, useRef } from "react";

import type { Item } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Empty } from "@/components/Empty";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/Skeleton";
import { ItemCard } from "./ItemCard";
import { GRID_COPY } from "./copy";
import { ageInDays } from "./filters";
import { useProgressiveList } from "./useProgressiveList";

export function ItemGrid({
  loading,
  visible,
  total,
  resetKey,
  onOpen,
  onAdd,
  onImport,
  onReset,
}: {
  loading: boolean;
  visible: Item[];
  total: number;
  resetKey: string;
  onOpen: (item: Item) => void;
  onAdd: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  const { shown, hasMore, showMore } = useProgressiveList(visible, resetKey);
  const sentinel = useRef<HTMLDivElement>(null);
  const canObserve = typeof IntersectionObserver !== "undefined";

  // Recreated after each page so a sentinel that is still in view loads the next page.
  useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !canObserve || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, canObserve, shown.length]);

  return (
    <>
      {loading ? (
        <Skeleton />
      ) : visible.length ? (
        <>
          <div className="item-grid">
            {shown.map((item) => (
              <ItemCard key={item.id} item={item} age={ageInDays} onClick={() => onOpen(item)} />
            ))}
          </div>
          {hasMore && (
            <div className="grid-more" ref={sentinel}>
              {!canObserve && <Btn onClick={showMore}>{GRID_COPY.loadMore}</Btn>}
            </div>
          )}
        </>
      ) : total === 0 ? (
        <Empty onAdd={onAdd} onImport={onImport} />
      ) : (
        <div className="no-results">
          <span>
            <Icon name="search" size={26} />
          </span>
          <h3>Không tìm thấy món đồ</h3>
          <p>Thử một từ khoá khác hoặc xoá bớt bộ lọc.</p>
          <Btn onClick={onReset}>Xoá bộ lọc</Btn>
        </div>
      )}
    </>
  );
}
