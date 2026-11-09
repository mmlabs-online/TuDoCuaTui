import type { Item } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Empty } from "@/components/Empty";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/Skeleton";
import { ItemCard } from "./ItemCard";
import { ageInDays } from "./filters";

export function ItemGrid({
  loading,
  visible,
  total,
  onOpen,
  onAdd,
  onImport,
  onReset,
}: {
  loading: boolean;
  visible: Item[];
  total: number;
  onOpen: (item: Item) => void;
  onAdd: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  return (
    <>
      {loading ? (
        <Skeleton />
      ) : visible.length ? (
        <div className="item-grid">
          {visible.map((item) => (
            <ItemCard key={item.id} item={item} age={ageInDays} onClick={() => onOpen(item)} />
          ))}
        </div>
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
