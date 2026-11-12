import type { Item } from "@/types/item";
import { Icon } from "@/components/Icon";
import { ItemPhoto } from "@/components/ItemPhoto";
import { colorMap, frameColors } from "@/constants/wardrobe";

export function ItemCard({
  item,
  age,
  onClick,
}: {
  item: Item;
  age: (s: string) => number;
  onClick: () => void;
}) {
  const days = age(item.lastWorn);
  const frameIndex = Number.parseInt(item.id.replace(/\D/g, "").slice(-2) || "0", 10);
  const placeholder = (
    <div className="photo-placeholder">
      <Icon name="shirt" size={42} />
      <span>Chưa có ảnh</span>
    </div>
  );
  return (
    <button className="item-card" onClick={onClick}>
      <div
        className="photo-wrap"
        style={{ "--frame": frameColors[frameIndex % frameColors.length] } as React.CSSProperties}
      >
        {item.photo ? (
          <ItemPhoto src={item.photo} alt={item.name} fallback={placeholder} />
        ) : (
          placeholder
        )}
        {item.status !== "Đang dùng" && (
          <span className={`badge badge-${item.status.replaceAll(" ", "-")}`}>{item.status}</span>
        )}
        <span className="wear-pill">
          👕 {item.wearCount}× ·{" "}
          {days > 365 ? "hơn 1 năm" : days === 0 ? "hôm nay" : `${days} ngày`}
        </span>
        <i className="card-sparkle">✦</i>
      </div>
      <div className="card-info">
        <div className="card-title">
          <h3>{item.name}</h3>
          <div className="dots">
            {item.colors.slice(0, 3).map((c) => (
              <i key={c} title={c} style={{ background: colorMap[c] }} />
            ))}
          </div>
        </div>
        <p>
          {item.category} · {item.brand || "Không hãng"}
        </p>
        <p className="location">{item.location || "Chưa có vị trí"}</p>
      </div>
    </button>
  );
}
