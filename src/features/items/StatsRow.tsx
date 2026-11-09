import type { Item } from "@/types/item";
import { isStale } from "./filters";

export function StatsRow({
  items,
  special,
  onToggleSpecial,
}: {
  items: Item[];
  special: string;
  onToggleSpecial: (s: string) => void;
}) {
  const most = [...items].sort((a, b) => b.wearCount - a.wearCount)[0];
  return (
    <section className="stats-grid">
      <div className="stat-card">
        <span>Tổng món đồ</span>
        <strong>{items.length}</strong>
        <small>{new Set(items.map((i) => i.location).filter(Boolean)).size} vị trí lưu trữ</small>
      </div>
      <div className="stat-card">
        <span>Tổng giá trị</span>
        <strong className="money">
          {items.reduce((s, i) => s + i.price, 0).toLocaleString("vi-VN")} ₫
        </strong>
        <small>Giá mua ban đầu</small>
      </div>
      <button
        className={`stat-card clickable ${special === "stale" ? "active" : ""}`}
        onClick={() => onToggleSpecial("stale")}
      >
        <span>≥ 90 ngày chưa mặc</span>
        <strong>{items.filter((i) => isStale(i)).length}</strong>
        <small>
          Xem những món bị lãng quên <span>→</span>
        </small>
      </button>
      <button
        className={`stat-card clickable ${special === "never" ? "active" : ""}`}
        onClick={() => onToggleSpecial("never")}
      >
        <span>Chưa mặc lần nào</span>
        <strong>{items.filter((i) => i.wearCount === 0).length}</strong>
        <small>
          Bắt đầu phối đồ <span>→</span>
        </small>
      </button>
      <div className="stat-card most">
        <span>Mặc nhiều nhất</span>
        <strong>{most?.name}</strong>
        <small>{most?.wearCount} lần mặc</small>
      </div>
    </section>
  );
}
