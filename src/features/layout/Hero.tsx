import type { Item } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { isStale } from "@/features/items/filters";

export function Hero({
  items,
  onImport,
  onExport,
}: {
  items: Item[];
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <section className="intro">
      <div className="hero-copy">
        <p className="eyebrow">TỦ ĐỒ CÁ NHÂN</p>
        <h1>
          Tủ đồ là <em>phong cách</em>
          <br /> của bạn
        </h1>
        <p>
          Hôm nay có {items.filter((i) => isStale(i)).length} món lâu chưa mặc — thử một món nhé?
        </p>
      </div>
      <div className="hero-collage" aria-label="Một vài món đồ trong bộ sưu tập">
        {items
          .filter((item) => item.photo)
          .slice(0, 4)
          .map((item, index) => (
            <div className={`collage-card collage-${index + 1}`} key={item.id}>
              <img src={item.photo} alt={item.name} />
              <span>{["Mới mua", "Yêu thích", "Mặc nhiều nhất", "Dễ phối"][index]}</span>
            </div>
          ))}
        <i className="hero-sparkle sparkle-one">✦</i>
        <i className="hero-sparkle sparkle-two">✧</i>
        <svg className="hero-squiggle" viewBox="0 0 90 25" aria-hidden="true">
          <path d="M2 17c14-23 29 16 44-6 14-20 25 14 42-8" />
        </svg>
      </div>
      <div className="mobile-import">
        <Btn onClick={onImport}>
          <Icon name="import" /> Import
        </Btn>
        <Btn onClick={onExport}>
          <Icon name="export" /> Export
        </Btn>
      </div>
    </section>
  );
}
